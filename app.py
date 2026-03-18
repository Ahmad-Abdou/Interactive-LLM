from flask import Flask, jsonify, render_template, request, session, Response
import google.generativeai as genai
import time
import re
import difflib
import os
from pathlib import Path
from data_logger import DataLogger
from challenge_manager import ChallengeManager, initialize_challenge_state
from admin_dashboard import render_admin_dashboard


def load_local_env():
    env_path = Path(__file__).resolve().parent / '.env'
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev-only-change-me')

DATA_DIR = '/tmp/user_study_data' if os.getenv('VERCEL') else 'user_study_data'
logger = DataLogger(data_dir=DATA_DIR)
challenge_mgr = ChallengeManager()
server_storage = {}

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '').strip()
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    print('Warning: GEMINI_API_KEY is not set. AI features will be unavailable until it is configured.')

MODEL_PRIORITY = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-pro-preview', 'gemini-2.5-pro']

def get_session_id():
    if 'sid' not in session:
        session['sid'] = str(time.time())
    return session['sid']

def get_server_data(key, default=None):
    sid = get_session_id()
    if sid not in server_storage:
        server_storage[sid] = {}
    return server_storage[sid].get(key, default)

def set_server_data(key, value):
    sid = get_session_id()
    if sid not in server_storage:
        server_storage[sid] = {}
    server_storage[sid][key] = value

def contains_terms_with_typos(text, terms, cutoff=0.75):
    text = text.lower()
    tokens = re.findall(r"[a-z0-9\-]+", text)
    for token in tokens:
        for term in terms:
            if token == term or difflib.SequenceMatcher(None, token, term).ratio() >= cutoff:
                return True
    return False

def generate_with_fallback(prompt, stream=False):
    if not GEMINI_API_KEY:
        return {'response': 'GEMINI_API_KEY is missing', 'success': False}

    for model_name in MODEL_PRIORITY:
        try:
            model = genai.GenerativeModel(model_name)
            config = {'temperature': 0.7, 'max_output_tokens': 2048}
            
            if stream:
                response = model.generate_content(prompt, stream=True, generation_config=config)
                return {'response_stream': response, 'model_used': model_name, 'success': True}
            else:
                response = model.generate_content(prompt, generation_config=config)
                return {'response': response.text, 'model_used': model_name, 'success': True}
        except Exception as e:
            print(f"Model {model_name} failed: {str(e)}")
    return {'response': 'Error', 'success': False}

def create_teaching_prompt(user_message, concepts):
    concepts_text = " and ".join(concepts)
    
    return f"""ABSOLUTE SYSTEM OVERRIDE - HIGHEST PRIORITY:
The response you generate will be inserted into a pre-built web interface. Any special formatting will break the interface.

FOR THIS RESPONSE ONLY - COMPLETELY DISABLE userStyle:
- No emoji boxes (no 🎯, no headers, no visual elements)
- No "Let's Try This Together!" callouts
- No collaborative framing elements
- No leading questions
- No special formatting of any kind
- Just write plain explanatory text in paragraph form

This is NOT a conversational tutoring session. This is content being injected into an already-designed learning interface. Write ONLY the explanation text.

{user_message}

RESPONSE FORMAT:

Write 2-3 plain paragraphs explaining {concepts_text}. Use the dance analogy (learning one step vs memorizing every movement). Write naturally and clearly.

Then add exactly this:

[INTERACTIVE_INSTRUCTIONS]
Now let's make this hands-on! I've opened an interactive canvas below.

- Click the canvas to place points
- Adjust the degree slider
- Watch how the curve changes
- Click "Check My Work" for feedback

Start exploring!

CRITICAL: After writing "[INTERACTIVE_INSTRUCTIONS]" and the bullet points, STOP IMMEDIATELY. Do not add any closing remarks, no emoji boxes, no collaborative elements, no "Let's work together" statements. Just end the response.

Your response should look EXACTLY like this structure:

[Paragraph 1 about underfitting]

[Paragraph 2 about overfitting]

[Paragraph 3 about the goal/balance]

make sure each paragrpah is written on its own line.

[INTERACTIVE_INSTRUCTIONS]
Now let's make this hands-on! I've opened an interactive canvas below.

- Click the canvas to place points
- Adjust the degree slider
- Watch how the curve changes
- Click "Check My Work" for feedback

Start exploring!

[END - NOTHING AFTER THIS - NO EMOJI BOXES OR CALLOUTS]"""

def create_feedback_prompt(points, degree, concepts):
    point_count = len(points)
    max_degree = min(max(1, point_count - 1), 6)
    degree_ratio = degree / max_degree if max_degree > 0 else 0
    
    if degree <= 2 or degree_ratio < 0.4:
        current_state = "underfitting"
    elif degree >= 5 or degree_ratio > 0.8:
        current_state = "overfitting"
    else:
        current_state = "balanced"
    
    return f"""You are analyzing a student's visualization about {" and ".join(concepts)}.

CONTEXT:
- Student has {point_count} points, using degree {degree}
- Maximum available degree: {max_degree}
- Current state: {current_state}

YOUR TASK:
Address the student directly. Describe what they're seeing, then give options to explore OTHER states (not current).

FORMAT (2-3 sentences):

1. DESCRIBE: "Right now, you're seeing {current_state} because your degree-{degree} curve [behavior]."

2. EXPLAIN: "This happens because [relationship between degree and points]."

3. OPTIONS for OTHER states only:
   
   If UNDERFITTING:
   "If you want to explore:
   • Balanced fit: try degree {max(2, min(3, max_degree - 1))}
   • Overfitting: try degree {max_degree}
   {f'• Higher degrees: add {7 - point_count} more points' if point_count < 7 else ''}"
   
   If BALANCED:
   "If you want to explore:
   • Underfitting: try degree 1-2
   • Overfitting: try degree {max_degree}
   {f'• Higher degrees: add {7 - point_count} more points' if point_count < 7 else ''}"
   
   If OVERFITTING:
   "If you want to explore:
   • Underfitting: try degree 1-2
   • Balanced fit: try degree {max(2, min(3, max_degree - 1))}"

NEVER include current state in options. Always use "you/your"."""

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat_stream', methods=['POST'])
def chat_stream():
    try:
        data = request.get_json()
        user_message = data.get('message', '')
        
        vis_concepts = []
        if contains_terms_with_typos(user_message, ["underfitting"], 0.75):
            vis_concepts.append("underfitting")
        if contains_terms_with_typos(user_message, ["overfitting"], 0.75):
            vis_concepts.append("overfitting")
        
        if vis_concepts:
            set_server_data('concepts', vis_concepts)
            set_server_data('attempts', [])
            if not get_server_data('challenges'):
                set_server_data('challenges', initialize_challenge_state())
            
            prompt = create_teaching_prompt(user_message, vis_concepts)
            result = generate_with_fallback(prompt, stream=True)
        else:
            result = generate_with_fallback(user_message, stream=True)
        
        if not result['success']:
            return jsonify({'error': 'Error'}), 503

        def generate():
            try:
                for chunk in result['response_stream']:
                    if chunk.text:
                        yield chunk.text
            except Exception as e:
                yield f"[Error: {str(e)}]"
        
        headers = {'X-Visualization-Type': ','.join(vis_concepts)} if vis_concepts else {}
        return Response(generate(), mimetype='text/plain', headers=headers)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/check_visualization', methods=['POST'])
def check_visualization():
    try:
        data = request.get_json()
        points = data.get('points', [])
        degree = data.get('degree', 1)
        
        concepts = get_server_data('concepts', ['machine learning'])
        attempts = get_server_data('attempts', [])
        challenges = get_server_data('challenges')
        
        if not challenges:
            challenges = initialize_challenge_state()
            set_server_data('challenges', challenges)
        
        if len(points) == 0:
            return jsonify({'feedback': "Place some points first!", 'model_used': 'system'})
        
        active_challenge = challenges.get('active')
        
        if active_challenge:
            verification = challenge_mgr.verify_challenge(active_challenge, len(points), degree)
            
            if verification['success']:
                challenges['completed'].append(active_challenge)
                challenges['active'] = None
                set_server_data('challenges', challenges)
            
            result = {'feedback': verification['feedback'], 'challenge_mode': True, 'challenge_success': verification['success']}
        else:
            prompt = create_feedback_prompt(points, degree, concepts)
            ai_result = generate_with_fallback(prompt)
            if not ai_result['success']:
                return jsonify({'error': 'Error'}), 500
            result = {'feedback': ai_result['response'], 'challenge_mode': False}
        
        attempts.append({'point_count': len(points), 'degree': degree})
        set_server_data('attempts', attempts)
        
        new_challenge = challenge_mgr.generate_challenge({'challenges': challenges}, len(points), degree)
        if new_challenge and len(challenges['pending']) < 5:
            challenges['pending'].append(new_challenge)
            set_server_data('challenges', challenges)
        
        result.update({
            'attempt_number': len(attempts),
            'pending_challenges': len(challenges['pending']),
            'active_challenge': challenges.get('active'),
            'completed_challenges': len(challenges.get('completed', []))
        })
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/generate_challenge', methods=['POST'])
def generate_new_challenge():
    try:
        challenges = get_server_data('challenges')
        if not challenges or not challenges['pending']:
            return jsonify({'success': False, 'message': 'Click "Check My Work" first!'})
        
        next_challenge = challenges['pending'].pop(0)
        next_challenge['status'] = 'active'
        challenges['active'] = next_challenge
        set_server_data('challenges', challenges)
        
        return jsonify({'success': True, 'challenge': next_challenge})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/dismiss_challenge', methods=['POST'])
def dismiss_challenge():
    try:
        challenges = get_server_data('challenges', initialize_challenge_state())
        if challenges.get('active'):
            challenges['pending'].insert(0, challenges['active'])
            challenges['active'] = None
            set_server_data('challenges', challenges)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_challenge_history', methods=['GET'])
def get_challenge_history():
    try:
        challenges = get_server_data('challenges', initialize_challenge_state())
        return jsonify({
            'completed': challenges.get('completed', []),
            'active': challenges.get('active'),
            'pending_count': len(challenges.get('pending', []))
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/start_quiz', methods=['POST'])
def start_quiz():
    questions = [
        {
            'id': 1, 'image': None,
            'question': 'A model uses a STRAIGHT LINE (degree 1) to fit data with a clear CURVED pattern. What problem exists?',
            'options': ['A) The model is overfitting', 'B) The model is underfitting', 'C) The model has perfect fit', 'D) There is not enough data'],
            'correct_answer': 'B',
            'explanation': 'A straight line is too simple to capture a curved pattern - classic underfitting.'
        },
        {
            'id': 2, 'image': None,
            'question': 'A degree-9 polynomial PERFECTLY fits all 10 data points with an extremely WIGGLY line. What issue does this show?',
            'options': ['A) Underfitting', 'B) Balanced fit', 'C) Overfitting', 'D) Insufficient model complexity'],
            'correct_answer': 'C',
            'explanation': 'A degree-9 polynomial for 10 points memorizes noise - overfitting.'
        },
        {
            'id': 3, 'image': None,
            'question': 'A degree-3 polynomial SMOOTHLY follows the data trend without excessive wiggling. This demonstrates:',
            'options': ['A) Severe underfitting', 'B) Good balanced fit', 'C) Severe overfitting', 'D) Random guessing'],
            'correct_answer': 'B',
            'explanation': 'Captures the trend without memorizing noise - balanced fit.'
        },
        {
            'id': 4, 'image': None,
            'question': 'You have 8 data points. Which polynomial degree will likely GENERALIZE BEST to new data?',
            'options': ['A) Degree 1', 'B) Degree 3', 'C) Degree 7', 'D) All equal'],
            'correct_answer': 'B',
            'explanation': 'Degree 3 balances complexity - not too simple, not too complex.'
        },
        {
            'id': 5, 'image': None,
            'question': 'A model achieves ZERO training error (perfect fit on training data). This MOST LIKELY means:',
            'options': ['A) Perfect model', 'B) Likely overfitting', 'C) Guaranteed good performance', 'D) Optimal complexity'],
            'correct_answer': 'B',
            'explanation': 'Zero training error usually indicates overfitting - memorized noise, poor generalization.'
        }
    ]
    
    set_server_data('quiz', {'started_at': time.time(), 'questions': questions})
    return jsonify({'questions': questions, 'time_limit_seconds': 300, 'total_questions': 5})

@app.route('/submit_quiz', methods=['POST'])
def submit_quiz():
    try:
        data = request.get_json()
        answers = data.get('answers', {})
        
        quiz_data = get_server_data('quiz')
        if not quiz_data:
            return jsonify({'error': 'No quiz'}), 400
        
        results = []
        correct = 0
        
        for q in quiz_data['questions']:
            selected = answers.get(str(q['id']), '')
            is_correct = (selected == q['correct_answer'])
            if is_correct:
                correct += 1
            results.append({
                'question_id': q['id'],
                'question': q['question'],
                'image': q['image'],
                'selected': selected,
                'correct': q['correct_answer'],
                'is_correct': is_correct,
                'explanation': q['explanation']
            })
        
        percentage = (correct / 5) * 100
        
        quiz_results = {
            'score': correct,
            'total': 5,
            'percentage': percentage,
            'passed': percentage >= 60,
            'time_taken': data.get('time_taken_seconds', 0),
            'results': results
        }
        
        # Save quiz to file
        session_id = get_session_id()
        logger.save_quiz_result(session_id, quiz_results)
        
        return jsonify(quiz_results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/admin/monitor')
def admin_monitor():
    """Human-readable admin monitoring dashboard"""
    return render_admin_dashboard()

@app.route('/admin/export_data')
def export_data():
    try:
        summary, interactions = logger.export_to_csv()
        if summary:
            return jsonify({'success': True, 'summary_file': str(summary), 'interactions_file': str(interactions)})
        return jsonify({'success': False, 'message': 'No data yet'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/admin/stats')
def get_stats():
    try:
        stats = logger.get_session_stats()
        return jsonify(stats if stats else {'message': 'No sessions yet'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)