"""
Simple Human-Readable Admin Monitoring System
Shows user sessions in plain English - see exactly what they did
"""

from flask import render_template_string
from datetime import datetime
import json
from pathlib import Path

def format_duration(seconds):
    """Convert seconds to readable format"""
    if seconds < 60:
        return f"{int(seconds)} seconds"
    minutes = int(seconds / 60)
    remaining_seconds = int(seconds % 60)
    if minutes < 60:
        return f"{minutes} min {remaining_seconds} sec"
    hours = int(minutes / 60)
    remaining_minutes = minutes % 60
    return f"{hours}h {remaining_minutes}m"

def get_readable_sessions():
    """Get all sessions in human-readable format"""
    data_dir = Path('user_study_data/sessions')
    
    if not data_dir.exists():
        return []
    
    sessions = []
    for session_file in data_dir.glob('*.json'):
        with open(session_file, 'r') as f:
            session = json.load(f)
            
            # Parse interactions into readable format
            conversations = []
            explorations = []
            challenges = []
            
            for interaction in session.get('interactions', []):
                itype = interaction['type']
                data = interaction['data']
                timestamp = interaction['timestamp']
                
                if itype == 'message_sent':
                    conversations.append({
                        'time': timestamp,
                        'user': data.get('message', '')
                    })
                
                elif itype == 'ai_response':
                    conversations.append({
                        'time': timestamp,
                        'ai': data.get('response', '')[:200] + '...'  # Truncate long responses
                    })
                
                elif itype == 'check_work':
                    explorations.append({
                        'time': timestamp,
                        'points': data.get('point_count'),
                        'degree': data.get('degree')
                    })
                
                elif itype == 'feedback_received':
                    if explorations:
                        explorations[-1]['feedback'] = data.get('feedback', '')[:150] + '...'
                
                elif itype == 'challenge_activated':
                    challenges.append({
                        'time': timestamp,
                        'challenge': data.get('challenge', {}).get('description', ''),
                        'status': 'activated'
                    })
                
                elif itype == 'challenge_completed':
                    challenges.append({
                        'time': timestamp,
                        'challenge': data.get('challenge', {}).get('description', ''),
                        'status': 'completed'
                    })
            
            # Calculate duration
            duration = session.get('duration_seconds', 0)
            
            # Get quiz data if exists
            quiz_file = Path(f'user_study_data/quiz_results/{session["session_id"]}_quiz.json')
            quiz_data = None
            if quiz_file.exists():
                with open(quiz_file, 'r') as qf:
                    quiz_data = json.load(qf)
            
            sessions.append({
                'session_id': session['session_id'][:8],  # Short ID
                'start_time': session['start_time'],
                'duration': format_duration(duration),
                'conversations': conversations,
                'explorations': explorations,
                'challenges': challenges,
                'quiz': quiz_data,
                'visualizations_created': session.get('visualizations_created', 0),
                'feedback_requests': session.get('feedback_requests', 0)
            })
    
    # Sort by start time (newest first)
    sessions.sort(key=lambda x: x['start_time'], reverse=True)
    return sessions

# HTML Template for Admin Dashboard
ADMIN_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Learning Platform - Admin Monitoring</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }
        .summary {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .session {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .session-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            border-radius: 6px;
            margin: -20px -20px 20px -20px;
        }
        .section {
            margin: 20px 0;
            padding: 15px;
            background: #f9f9f9;
            border-left: 4px solid #667eea;
            border-radius: 4px;
        }
        .section h3 {
            margin-top: 0;
            color: #667eea;
        }
        .conversation {
            margin: 10px 0;
            padding: 10px;
            border-radius: 4px;
        }
        .user-msg {
            background: #e3f2fd;
            border-left: 3px solid #2196F3;
        }
        .ai-msg {
            background: #f3e5f5;
            border-left: 3px solid #9c27b0;
        }
        .exploration {
            background: #fff3e0;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            border-left: 3px solid #ff9800;
        }
        .challenge {
            background: #e8f5e9;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            border-left: 3px solid #4caf50;
        }
        .challenge.completed {
            border-left: 3px solid #2e7d32;
        }
        .quiz-result {
            background: #fce4ec;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #e91e63;
        }
        .quiz-result.passed {
            background: #e8f5e9;
            border-left: 4px solid #4caf50;
        }
        .timestamp {
            font-size: 11px;
            color: #666;
            font-family: monospace;
        }
        .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            margin-left: 5px;
        }
        .badge.success { background: #4caf50; color: white; }
        .badge.warning { background: #ff9800; color: white; }
        .badge.info { background: #2196F3; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎓 Learning Platform - Admin Monitoring</h1>
        
        <div class="summary">
            <h2>Overview</h2>
            <p><strong>Total Sessions:</strong> {{ sessions|length }}</p>
            <p><em>Showing newest sessions first</em></p>
        </div>
        
        {% for session in sessions %}
        <div class="session">
            <div class="session-header">
                <h2 style="margin: 0;">Session {{ session.session_id }}</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">
                    Started: {{ session.start_time[:19] }} | 
                    Duration: {{ session.duration }} |
                    Explorations: {{ session.feedback_requests }}
                </p>
            </div>
            
            {% if session.conversations %}
            <div class="section">
                <h3>💬 Conversation</h3>
                {% for msg in session.conversations %}
                    {% if 'user' in msg %}
                    <div class="conversation user-msg">
                        <div class="timestamp">{{ msg.time[11:19] }}</div>
                        <strong>Student:</strong> "{{ msg.user }}"
                    </div>
                    {% elif 'ai' in msg %}
                    <div class="conversation ai-msg">
                        <div class="timestamp">{{ msg.time[11:19] }}</div>
                        <strong>AI:</strong> {{ msg.ai }}
                    </div>
                    {% endif %}
                {% endfor %}
            </div>
            {% endif %}
            
            {% if session.explorations %}
            <div class="section">
                <h3>🔬 Hands-On Exploration</h3>
                {% for exp in session.explorations %}
                <div class="exploration">
                    <div class="timestamp">{{ exp.time[11:19] }}</div>
                    <strong>Tried:</strong> {{ exp.points }} points, degree {{ exp.degree }}
                    {% if 'feedback' in exp %}
                    <br><strong>Got feedback:</strong> {{ exp.feedback }}
                    {% endif %}
                </div>
                {% endfor %}
            </div>
            {% endif %}
            
            {% if session.challenges %}
            <div class="section">
                <h3>🎯 Challenges</h3>
                {% for challenge in session.challenges %}
                <div class="challenge {% if challenge.status == 'completed' %}completed{% endif %}">
                    <div class="timestamp">{{ challenge.time[11:19] }}</div>
                    {% if challenge.status == 'completed' %}
                    ✅ <strong>Completed:</strong> {{ challenge.challenge }}
                    {% else %}
                    ⏳ <strong>Attempted:</strong> {{ challenge.challenge }}
                    {% endif %}
                </div>
                {% endfor %}
            </div>
            {% endif %}
            
            {% if session.quiz %}
            <div class="section">
                <h3>📝 Quiz Results</h3>
                <div class="quiz-result {% if session.quiz.passed %}passed{% endif %}">
                    <p><strong>Score:</strong> {{ session.quiz.score }}/{{ session.quiz.total }} 
                       ({{ "%.0f"|format(session.quiz.percentage) }}%)
                       {% if session.quiz.passed %}
                       <span class="badge success">PASSED</span>
                       {% else %}
                       <span class="badge warning">NEEDS RETRY</span>
                       {% endif %}
                    </p>
                    <p><strong>Time:</strong> {{ "%.0f"|format(session.quiz.time_taken) }} seconds</p>
                    
                    <details style="margin-top: 10px;">
                        <summary style="cursor: pointer; font-weight: bold;">View Question-by-Question</summary>
                        {% for result in session.quiz.results %}
                        <div style="margin: 10px 0; padding: 10px; background: white; border-radius: 4px;">
                            <p><strong>Q{{ result.question_id }}:</strong> {{ result.question }}</p>
                            <p>
                                Student answered: <strong>{{ result.selected }}</strong>
                                {% if result.is_correct %}
                                <span class="badge success">✓ Correct</span>
                                {% else %}
                                <span class="badge warning">✗ Wrong</span>
                                (Correct: {{ result.correct }})
                                {% endif %}
                            </p>
                        </div>
                        {% endfor %}
                    </details>
                </div>
            </div>
            {% endif %}
        </div>
        {% endfor %}
        
        {% if not sessions %}
        <div class="session">
            <p>No sessions yet. Users will appear here once they start using the platform.</p>
        </div>
        {% endif %}
    </div>
</body>
</html>
"""

def render_admin_dashboard():
    """Render the admin dashboard"""
    sessions = get_readable_sessions()
    return render_template_string(ADMIN_TEMPLATE, sessions=sessions)