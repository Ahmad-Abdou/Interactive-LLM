# Data Collection System for Interactive Learning Platform
# Tracks all user interactions, quiz performance, and learning behavior

import json
import csv
from datetime import datetime
from pathlib import Path
import uuid

class DataLogger:
    """
    Comprehensive logging system for user study data collection.
    Tracks sessions, interactions, quiz performance, and learning patterns.
    """
    
    def __init__(self, data_dir='user_study_data'):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)
        
        # Create subdirectories for different data types
        (self.data_dir / 'sessions').mkdir(exist_ok=True)
        (self.data_dir / 'interactions').mkdir(exist_ok=True)
        (self.data_dir / 'quiz_results').mkdir(exist_ok=True)
        (self.data_dir / 'exports').mkdir(exist_ok=True)
    
    def start_session(self, session_id=None):
        """Initialize a new user session"""
        if session_id is None:
            session_id = str(uuid.uuid4())
        
        session_data = {
            'session_id': session_id,
            'start_time': datetime.now().isoformat(),
            'end_time': None,
            'duration_seconds': None,
            'group': 'experimental',  # Can be set to 'control' for A/B testing
            'interactions': [],
            'visualizations_created': 0,
            'feedback_requests': 0,
            'quiz_completed': False,
            'quiz_score': None
        }
        
        return session_data
    
    def log_interaction(self, session_data, interaction_type, data):
        """
        Log a single user interaction
        
        interaction_type options:
        - 'message_sent': User asked a question
        - 'ai_response': AI responded
        - 'visualization_created': Interactive canvas appeared
        - 'point_added': User placed a point
        - 'point_removed': User removed a point
        - 'degree_changed': User adjusted polynomial degree
        - 'check_work': User requested feedback
        - 'feedback_received': AI provided feedback on visualization
        - 'quiz_started': User began quiz
        - 'quiz_question_answered': User answered a quiz question
        - 'quiz_submitted': User completed quiz
        """
        interaction = {
            'timestamp': datetime.now().isoformat(),
            'type': interaction_type,
            'data': data
        }
        
        session_data['interactions'].append(interaction)
        
        # Update session counters
        if interaction_type == 'visualization_created':
            session_data['visualizations_created'] += 1
        elif interaction_type == 'check_work':
            session_data['feedback_requests'] += 1
    
    def save_session(self, session_data):
        """Save session data to file"""
        session_data['end_time'] = datetime.now().isoformat()
        
        # Calculate duration
        start = datetime.fromisoformat(session_data['start_time'])
        end = datetime.fromisoformat(session_data['end_time'])
        session_data['duration_seconds'] = (end - start).total_seconds()
        
        # Save as JSON
        filepath = self.data_dir / 'sessions' / f"{session_data['session_id']}.json"
        with open(filepath, 'w') as f:
            json.dump(session_data, f, indent=2)
        
        return filepath
    
    def save_quiz_result(self, session_id, quiz_data):
        """Save detailed quiz results"""
        quiz_record = {
            'session_id': session_id,
            'timestamp': datetime.now().isoformat(),
            'score': quiz_data.get('score'),
            'total': quiz_data.get('total'),
            'percentage': quiz_data.get('percentage'),
            'passed': quiz_data.get('passed'),
            'time_taken_seconds': quiz_data.get('time_taken'),
            'questions': quiz_data.get('results', [])
        }
        
        filepath = self.data_dir / 'quiz_results' / f"{session_id}_quiz.json"
        with open(filepath, 'w') as f:
            json.dump(quiz_record, f, indent=2)
        
        return filepath
    
    def export_to_csv(self):
        """Export all session data to CSV for analysis"""
        sessions = []
        
        # Read all session files
        for session_file in (self.data_dir / 'sessions').glob('*.json'):
            with open(session_file, 'r') as f:
                sessions.append(json.load(f))
        
        if not sessions:
            return None
        
        # Create summary CSV
        summary_file = self.data_dir / 'exports' / f'session_summary_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        
        with open(summary_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=[
                'session_id',
                'start_time',
                'duration_seconds',
                'group',
                'total_interactions',
                'visualizations_created',
                'feedback_requests',
                'quiz_completed',
                'quiz_score',
                'quiz_percentage',
                'passed_quiz'
            ])
            
            writer.writeheader()
            
            for session in sessions:
                writer.writerow({
                    'session_id': session['session_id'],
                    'start_time': session['start_time'],
                    'duration_seconds': session.get('duration_seconds', 0),
                    'group': session.get('group', 'experimental'),
                    'total_interactions': len(session.get('interactions', [])),
                    'visualizations_created': session.get('visualizations_created', 0),
                    'feedback_requests': session.get('feedback_requests', 0),
                    'quiz_completed': session.get('quiz_completed', False),
                    'quiz_score': session.get('quiz_score'),
                    'quiz_percentage': session.get('quiz_percentage'),
                    'passed_quiz': session.get('passed_quiz')
                })
        
        # Create detailed interactions CSV
        interactions_file = self.data_dir / 'exports' / f'interactions_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        
        all_interactions = []
        for session in sessions:
            for interaction in session.get('interactions', []):
                all_interactions.append({
                    'session_id': session['session_id'],
                    'timestamp': interaction['timestamp'],
                    'type': interaction['type'],
                    'data': json.dumps(interaction['data'])
                })
        
        if all_interactions:
            with open(interactions_file, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=['session_id', 'timestamp', 'type', 'data'])
                writer.writeheader()
                writer.writerows(all_interactions)
        
        return summary_file, interactions_file
    
    def get_session_stats(self):
        """Get summary statistics across all sessions"""
        sessions = []
        for session_file in (self.data_dir / 'sessions').glob('*.json'):
            with open(session_file, 'r') as f:
                sessions.append(json.load(f))
        
        if not sessions:
            return None
        
        total_sessions = len(sessions)
        completed_quizzes = sum(1 for s in sessions if s.get('quiz_completed'))
        avg_duration = sum(s.get('duration_seconds', 0) for s in sessions) / total_sessions if total_sessions > 0 else 0
        avg_interactions = sum(len(s.get('interactions', [])) for s in sessions) / total_sessions if total_sessions > 0 else 0
        
        quiz_scores = [s.get('quiz_percentage') for s in sessions if s.get('quiz_percentage') is not None]
        avg_quiz_score = sum(quiz_scores) / len(quiz_scores) if quiz_scores else 0
        
        return {
            'total_sessions': total_sessions,
            'completed_quizzes': completed_quizzes,
            'avg_duration_seconds': avg_duration,
            'avg_interactions': avg_interactions,
            'avg_quiz_score': avg_quiz_score,
            'quiz_pass_rate': sum(1 for s in sessions if s.get('passed_quiz')) / completed_quizzes if completed_quizzes > 0 else 0
        }