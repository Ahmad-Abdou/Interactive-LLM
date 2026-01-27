from flask import Flask, jsonify, render_template, request
import google.generativeai as genai
import os

app = Flask(__name__)

GEMINI_API_KEY = "AIzaSyAORDuNUhK8G-f9ly8-tOs2d6yaQ8ekvQ8"
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

@app.route('/health', methods=['GET'])
def health_check():
    """
    Endpoint to check which models are currently available
    """
    available_models = []
    
    for model_name in MODEL_PRIORITY:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content("Hi")
            available_models.append({
                'name': model_name,
                'status': 'available'
            })
        except Exception as e:
            available_models.append({
                'name': model_name,
                'status': 'unavailable',
                'error': str(e)[:100]
            })
    
    return jsonify({
        'models': available_models,
        'priority_order': MODEL_PRIORITY
    })

if __name__ == '__main__':
    app.run(debug=True)