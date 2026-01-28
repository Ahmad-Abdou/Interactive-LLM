from flask import Flask, jsonify, render_template, request
import google.generativeai as genai
import os
import time
import json
import re
from flask import Response
import difflib

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

def contains_terms_with_typos(text, terms, cutoff=0.75):
    text = text.lower()
    tokens = re.findall(r"[a-z0-9\-]+", text)
    for token in tokens:
        for term in terms:
            if token == term or difflib.SequenceMatcher(None, token, term).ratio() >= cutoff:
                return True
    return False

def generate_with_fallback(user_message):   
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
            print(f"Model {model_name} failed: {str(e)}")

def generate_with_visualization(user_message, type):
    if type == ["underfitting", "overfitting"]:
        print("BINGO")

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
            print(f"Model {model_name} failed: {str(e)}")


def _split_into_sentences(text):
    if not text:
        return []
    parts = re.split(r'(?<=[\.\!\?])\s+', text)
    return [p for p in parts if p.strip()]

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
        
        result= ''

        if contains_terms_with_typos(user_message, ["underfitting", "overfitting"], cutoff=0.75):
            result = generate_with_visualization(user_message, ["underfitting", "overfitting"])
        # elif contains_terms_with_typos(user_message, ["underfitting", "overfitting"], cutoff=0.75):
        #     result = generate_with_visualization(user_message, ["underfitting", "overfitting"])

        # elif contains_terms_with_typos(user_message, ["underfitting", "overfitting"], cutoff=0.75):
        #     result = generate_with_visualization(user_message, ["underfitting", "overfitting"])
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

        return Response(generate(), mimetype='text/plain')

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)