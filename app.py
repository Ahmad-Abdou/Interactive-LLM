from flask import Flask, jsonify, render_template, request, session
import google.generativeai as genai
import os
import time
import json
import re
from flask import Response
import difflib

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-this-in-production'

GEMINI_API_KEY = "AIzaSyAORDuNUhK8G-f9ly8-tOs2d6yaQ8ekvQ8"
genai.configure(api_key=GEMINI_API_KEY)

MODEL_PRIORITY = [
    'gemini-3-flash-preview',      
    'gemini-2.5-flash',           
    'gemini-2.5-flash-lite',             
    'gemini-3-pro-preview',
    'gemini-2.5-pro',                               
]

def contains_terms_with_typos(text, terms, cutoff=0.75):
    """Check if text contains any of the terms (with typo tolerance)"""
    text = text.lower()
    tokens = re.findall(r"[a-z0-9\-]+", text)
    for token in tokens:
        for term in terms:
            if token == term or difflib.SequenceMatcher(None, token, term).ratio() >= cutoff:
                return True
    return False

def generate_with_fallback(prompt):
    """Call Gemini API with fallback through model priority list"""
    for model_name in MODEL_PRIORITY:
        try:
            print(f"Using model: {model_name}")
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt) 
            return {
                'response': response.text,
                'model_used': model_name,
                'success': True
            }
        except Exception as e:
            print(f"Model {model_name} failed: {str(e)}")
    
    return {
        'response': 'Sorry, I am unable to process your request at the moment.',
        'model_used': None,
        'success': False
    }

def _split_into_sentences(text):
    """Split text into sentences for streaming"""
    if not text:
        return []
    parts = re.split(r'(?<=[\.\!\?])\s+', text)
    return [p for p in parts if p.strip()]


def initialize_learning_context(concepts):
    """Initialize minimal session context for interactive learning"""
    return {
        'concepts': concepts, 
        'feedback_count': 0,
        'conversation_active': True,
        'attempt_history': []
    }

def get_learning_context():
    """Get current learning context from session"""
    return session.get('learning_context', None)

def update_learning_context(updates):
    """Update learning context"""
    context = get_learning_context()
    if context:
        context.update(updates)
        session['learning_context'] = context

def create_teaching_prompt(user_message, concepts):
    """
    Create prompt for AI to explain concept AND provide interactive instructions.
    Uses marker [INTERACTIVE_INSTRUCTIONS] for frontend parsing.
    """
    concepts_text = " and ".join(concepts)
    
    prompt = f"""{user_message}

After providing a thorough explanation of {concepts_text}, add a section that introduces the interactive visualization tool.

IMPORTANT: You must provide ONLY TEXT - no code, no React components, no artifacts.

Format your response like this:

[Your detailed explanation of the concepts]

[INTERACTIVE_INSTRUCTIONS]
Now let's make this hands-on! I've opened an interactive canvas below.

Here's how to use it:
- Click on the canvas to place points (try 5-7 points)
- Use the slider to adjust the polynomial degree  
- Try different degrees to see {concepts_text} in action
- Click "Check My Work" anytime for feedback

Write simple, plain text instructions. Do NOT generate code, React components, or artifacts. Just explain how to use the tool in plain English."""

    return prompt

def create_feedback_prompt(user_message, points, degree, concepts, attempt_history):
    """
    Create prompt for AI to give conversational feedback on student's visualization.
    AI acts as a teacher analyzing their work WITH AWARENESS of previous attempts.
    """
    point_count = len(points)
    point_list = "\n".join([f"Point {i+1}: x={p['x']:.1f}, y={p['y']:.1f}" for i, p in enumerate(points)])
    concepts_text = " and ".join(concepts)
    
    history_text = ""
    if attempt_history:
        history_text = "Previous attempts:\n"
        for i, attempt in enumerate(attempt_history):
            history_text += f"Attempt {i+1}: {attempt['point_count']} points, degree {attempt['degree']}\n"
        history_text += "\n"
    
    prompt = f"""You are analyzing a student's visualization about {concepts_text}.

{history_text}Current attempt (Attempt {len(attempt_history) + 1}):
- {point_count} points on the canvas
- Polynomial degree set to {degree}
- Point coordinates:
{point_list}

Provide analytical feedback (2-4 sentences):

1. Start directly with your analysis - NO greetings, NO welcomes
2. Identify what concept this demonstrates (underfitting, overfitting, or balanced)
3. Explain WHY using the specific data they created
4. If they have previous attempts, acknowledge their progression
5. Suggest what to try next

Format your response with proper line breaks between sentences for readability.

Example good format:
"You've created underfitting here. The degree-1 line is too simple for your curved data pattern.

Try increasing to degree 5 to see overfitting in action."

Example BAD format (avoid):
"You've created underfitting here.The degree-1 line is too simple for your curved data pattern.Try increasing to degree 5."

Be direct, analytical, and helpful. Skip any welcoming phrases."""

    return prompt


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/chat_stream', methods=['POST'])
def chat_stream():
    try:
        data = request.get_json()
        user_message = data.get('message', '')

        if not user_message:
            return jsonify({'error': 'No message provided'}), 400
        
        vis_concepts = []
        
        if contains_terms_with_typos(user_message, ["underfitting"], cutoff=0.75):
            vis_concepts.append("underfitting")
        
        if contains_terms_with_typos(user_message, ["overfitting"], cutoff=0.75):
            vis_concepts.append("overfitting")
        
        if vis_concepts:
            context = initialize_learning_context(vis_concepts)
            session['learning_context'] = context
            
            print(f"Learning session started for: {vis_concepts}")
            
            prompt = create_teaching_prompt(user_message, vis_concepts)
            result = generate_with_fallback(prompt)
        else:
            result = generate_with_fallback(user_message)
        
        if not result['success']:
            return jsonify({
                'response': result['response'],
                'error': True,
                'model_used': None
            }), 503

        full_text = result['response']
        paragraphs = re.split(r'\n\s*\n', full_text)

        def generate():
            for para in paragraphs:
                sentences = _split_into_sentences(para)
                if not sentences:
                    yield (para + "\n")
                    time.sleep(0.02)
                    continue

                for s in sentences:
                    yield (s + "\n")
                    time.sleep(0.02)

                yield "\n"
                time.sleep(0.01)
        
        headers = {}
        if vis_concepts:
            headers['X-Visualization-Type'] = ','.join(vis_concepts)
        
        return Response(generate(), mimetype='text/plain', headers=headers)

    except Exception as e:
        print(f"Error in chat_stream: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/check_visualization', methods=['POST'])
def check_visualization():
    """
    Provides AI feedback on student's visualization.
    AI acts as a conversational teacher with awareness of previous attempts.
    """
    try:
        data = request.get_json()
        
        points = data.get('points', [])
        degree = data.get('degree', 1)
        
        context = get_learning_context()
        
        if not context:
            return jsonify({
                'feedback': 'Please start by asking me about a machine learning concept first!',
                'model_used': 'system'
            })
        
        concepts = context['concepts']
        attempt_history = context.get('attempt_history', [])
        
        if len(points) == 0:
            return jsonify({
                'feedback': "I don't see any points yet! Click on the canvas to place some points, then I can analyze what you've created.",
                'model_used': 'system'
            })
        
        prompt = create_feedback_prompt(
            user_message="", 
            points=points, 
            degree=degree, 
            concepts=concepts,
            attempt_history=attempt_history
        )
        
        result = generate_with_fallback(prompt)
        
        if not result['success']:
            return jsonify({'error': 'Unable to generate feedback'}), 500
        
        current_attempt = {
            'point_count': len(points),
            'degree': degree,
            'points_summary': f"{len(points)} points" 
        }
        attempt_history.append(current_attempt)
        
        update_learning_context({
            'feedback_count': context.get('feedback_count', 0) + 1,
            'attempt_history': attempt_history
        })
        
        print(f"Feedback given. Total attempts: {len(attempt_history)}")
        
        return jsonify({
            'feedback': result['response'],
            'model_used': result['model_used'],
            'attempt_number': len(attempt_history)
        })
        
    except Exception as e:
        print(f"Error in check_visualization: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/start_quiz', methods=['POST'])
def start_quiz():
    """
    Initialize quiz session and return quiz questions.
    Called when student is ready to test their knowledge.
    """
    try:
        context = get_learning_context()
        
        if not context:
            return jsonify({'error': 'No learning session found'}), 400
        
        quiz_questions = [
            {
                'id': 1,
                'image': 'quiz_q1_underfitting.png',
                'question': 'Figure 1A shows a polynomial regression model fitted to observed data. What problem does this model exhibit?',
                'options': [
                    'A) Underfitting - the model is too simple to capture the data pattern',
                    'B) Overfitting - the model is too complex for the data',
                    'C) Balanced fit - the model appropriately captures the trend',
                    'D) Insufficient data - we need more points to determine'
                ],
                'correct_answer': 'A',
                'explanation': 'The straight line (degree 1) cannot capture the obvious curve in the data. The model is too simple (high bias), resulting in systematic errors. This is classic underfitting.'
            },
            {
                'id': 2,
                'image': 'quiz_q2_overfitting.png',
                'question': 'Figure 1B displays a degree-4 polynomial fitted to 5 training points. Evaluate this modeling approach.',
                'options': [
                    'A) Appropriate - higher degrees always improve accuracy',
                    'B) Underfitting - should use even higher degree',
                    'C) Overfitting - the model is too complex for this sample size',
                    'D) Balanced - the fit looks smooth enough'
                ],
                'correct_answer': 'C',
                'explanation': 'With degree 4 and only 5 points (degree = n-1), the model has enough flexibility to perfectly fit the training data, including noise. This model won\'t generalize well - classic overfitting.'
            },
            {
                'id': 3,
                'image': 'quiz_q3_balanced.png',
                'question': 'Figure 2A shows data fitted with a degree-2 polynomial model. Assess the model\'s complexity.',
                'options': [
                    'A) Overfitting - degree is too high',
                    'B) Underfitting - needs higher degree',
                    'C) Balanced - appropriate complexity for the data',
                    'D) Cannot determine without test set performance'
                ],
                'correct_answer': 'C',
                'explanation': 'The quadratic model (degree 2) captures the curved trend without trying to pass through every point exactly. With 6 points and degree 2, the fit is smooth and follows the general pattern - this is the "sweet spot."'
            },
            {
                'id': 4,
                'image': 'quiz_q4_tricky_overfit.png',
                'question': 'Figure 2B presents a degree-6 polynomial fitted to 9 data points. The data follows a roughly linear trend. What is the likely issue?',
                'options': [
                    'A) Balanced - the smooth fit indicates appropriate complexity',
                    'B) Underfitting - linear trend suggests we could use simpler model',
                    'C) Overfitting - unnecessarily high degree for simple pattern',
                    'D) Perfect fit - degree matches data complexity'
                ],
                'correct_answer': 'C',
                'explanation': 'This is tricky! The curve looks smooth, but using degree-6 for nearly linear data is still overfitting. The data pattern is simple, but we\'re using way more complexity than needed. This won\'t generalize well.'
            },
            {
                'id': 5,
                'image': 'quiz_q5_extreme_overfit.png',
                'question': 'In Figure 3, a degree-4 polynomial is fitted to 5 observations. The model passes through every data point. Evaluate this approach.',
                'options': [
                    'A) Excellent - zero training error achieved',
                    'B) Overfitting - model memorizes noise rather than learning pattern',
                    'C) Balanced - just enough complexity',
                    'D) Underfitting - should use degree-5 or higher'
                ],
                'correct_answer': 'B',
                'explanation': 'When degree equals (n-1), the polynomial can pass through all points exactly. Zero training error does NOT mean good model! This is extreme overfitting - the model memorizes noise and will perform terribly on new data.'
            }
        ]
        
        quiz_session = {
            'started_at': time.time(),
            'questions': quiz_questions,
            'answers': {},
            'completed': False
        }
        
        session['quiz_session'] = quiz_session
        
        update_learning_context({'quiz_started': True})
        
        return jsonify({
            'questions': quiz_questions,
            'time_limit_seconds': 300,
            'total_questions': len(quiz_questions)
        })
        
    except Exception as e:
        print(f"Error in start_quiz: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/submit_quiz', methods=['POST'])
def submit_quiz():
    """
    Score quiz and return results with explanations.
    """
    try:
        data = request.get_json()
        answers = data.get('answers', {})
        time_taken = data.get('time_taken_seconds', 0)
        
        quiz_session = session.get('quiz_session')
        if not quiz_session:
            return jsonify({'error': 'No quiz session found'}), 400
        
        questions = quiz_session['questions']
        
        results = []
        correct_count = 0
        
        for q in questions:
            q_id = str(q['id'])
            selected = answers.get(q_id, '')
            correct = q['correct_answer']
            is_correct = (selected == correct)
            
            if is_correct:
                correct_count += 1
            
            results.append({
                'question_id': q['id'],
                'question': q['question'],
                'image': q['image'],
                'selected': selected,
                'correct': correct,
                'is_correct': is_correct,
                'explanation': q['explanation']
            })
        
        total_questions = len(questions)
        score_percentage = (correct_count / total_questions) * 100
        passed = score_percentage >= 60 
        
        quiz_results = {
            'score': correct_count,
            'total': total_questions,
            'percentage': score_percentage,
            'passed': passed,
            'time_taken': time_taken,
            'results': results,
            'completed_at': time.time()
        }
        
        session['quiz_results'] = quiz_results
        quiz_session['completed'] = True
        session['quiz_session'] = quiz_session
        
        context = get_learning_context()
        update_learning_context({
            'quiz_completed': True,
            'quiz_score': score_percentage
        })
        
        print(f"Quiz completed: {correct_count}/{total_questions} ({score_percentage:.1f}%)")
        
        return jsonify(quiz_results)
        
    except Exception as e:
        print(f"Error in submit_quiz: {str(e)}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)