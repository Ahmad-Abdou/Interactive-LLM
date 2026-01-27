from flask import Flask, jsonify, render_template, request
import google.generativeai as genai
import os
import time
import json
import re
from flask import Response

app = Flask(__name__)

GEMINI_API_KEY = "REDACTED_OLD_KEY"
genai.configure(api_key=GEMINI_API_KEY)

MODEL_PRIORITY = [
    'gemini-3-flash-preview',      
    'gemini-2.5-flash',           
    'gemini-2.5-flash-lite',             
    'gemini-3-pro-preview',
    'gemini-2.5-pro',                 
                 
]

def generate_with_fallback(user_message, conversation_history=None):

    last_error = None
    
    for model_name in MODEL_PRIORITY:
        try:
            print(model_name)
            model = genai.GenerativeModel(model_name)
            
            response = model.generate_content(user_message)
            
            return {
                'response': response.text,
                'model_used': model_name,
                'success': True
            }
            
        except Exception as e:
            error_msg = str(e)
            print(f"Model {model_name} failed: {error_msg}")
            last_error = error_msg
            
            if 'quota' in error_msg.lower() or 'rate limit' in error_msg.lower():
                print(f"   Rate limit hit, trying next model...")
                continue
            elif 'not found' in error_msg.lower():
                print(f" Model not available, trying next model...")
                continue
            else:
                continue
    
    return {
        'response': f"All models are currently unavailable. Last error: {last_error}",
        'model_used': None,
        'success': False
    }


def _split_into_sentences(text):

    if not text:
        return []
    parts = re.split(r'(?<=[\.\!\?])\s+', text)
    return [p for p in parts if p.strip()]

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        user_message = data.get('message', '')
        
        if not user_message:
            return jsonify({'error': 'No message provided'}), 400
        
        result = generate_with_fallback(user_message)
        
        if not result['success']:
            return jsonify({
                'response': result['response'],
                'error': True,
                'model_used': None
            }), 503
        
        visualization = None
        if any(keyword in user_message.lower() for keyword in 
               ['overfit', 'underfit', 'bias', 'variance', 'linear regression']):
            visualization = {
                'type': 'ml-playground',
                'data': {}
            }
        
        return jsonify({
            'response': result['response'],
            'visualization': visualization,
            'model_used': result['model_used']
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/chat_stream', methods=['POST'])
def chat_stream():
    try:
        data = request.get_json()
        user_message = data.get('message', '')

        if not user_message:
            return jsonify({'error': 'No message provided'}), 400

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

            model_meta = json.dumps({'model_used': result['model_used']})
            yield ("__MODEL_META__::" + model_meta + "\n")

        return Response(generate(), mimetype='text/plain')

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)