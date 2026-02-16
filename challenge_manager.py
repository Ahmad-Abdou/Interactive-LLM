"""
Challenge Management System for Interactive Learning Platform
Handles challenge generation, queue management, state tracking, and verification
"""

import random
from datetime import datetime

class ChallengeManager:
    """
    Manages learning challenges with:
    - Queue system (max 5 pending)
    - Tree-based duplicate detection (concept -> degree -> points)
    - State management (pending -> active -> completed)
    """
    
    MAX_PENDING_CHALLENGES = 5
    
    def __init__(self):
        # Challenge concepts and their typical degree ranges
        self.concept_templates = {
            'underfitting': {
                'degrees': [1, 2],
                'description': 'underfitting'
            },
            'balanced': {
                'degrees': [2, 3, 4],
                'description': 'balanced fit'
            },
            'overfitting': {
                'degrees': [5, 6],
                'description': 'overfitting'
            }
        }
    
    def generate_challenge(self, session_state, current_points=None, current_degree=None):
        """
        Generate new unique challenge based on what hasn't been tried yet.
        Uses tree structure: concept -> points -> degree
        
        Returns dict or None if queue is full
        """
        # Check if queue is full
        pending = session_state.get('challenges', {}).get('pending', [])
        if len(pending) >= self.MAX_PENDING_CHALLENGES:
            return None
        
        # Get all used paths (completed + active + pending)
        used_paths = self._get_used_paths(session_state)
        
        # Generate unique challenge
        max_attempts = 50
        for _ in range(max_attempts):
            # Pick random concept
            concept = random.choice(list(self.concept_templates.keys()))
            
            # Pick random points (3-10 range)
            points = random.randint(3, 10)
            
            # Pick degree appropriate for concept (but we don't specify degree to user)
            # User figures out what degree creates the concept
            
            # Create path identifier
            path = f"{concept}:{points}"
            
            if path not in used_paths:
                # Found unique challenge
                challenge = {
                    'id': datetime.now().timestamp(),
                    'concept': concept,
                    'points': points,
                    'description': f"Create {self.concept_templates[concept]['description']} with {points} points",
                    'generated_at': datetime.now().isoformat(),
                    'status': 'pending'
                }
                return challenge
        
        # If we can't find unique after 50 tries, return a random one
        # (Very unlikely with 3 concepts × 8 point values = 24 combinations)
        concept = random.choice(list(self.concept_templates.keys()))
        points = random.randint(3, 10)
        
        return {
            'id': datetime.now().timestamp(),
            'concept': concept,
            'points': points,
            'description': f"Create {self.concept_templates[concept]['description']} with {points} points",
            'generated_at': datetime.now().isoformat(),
            'status': 'pending'
        }
    
    def _get_used_paths(self, session_state):
        """Extract all used challenge paths (concept:points combinations)"""
        used = set()
        
        challenges = session_state.get('challenges', {})
        
        # Completed challenges
        for c in challenges.get('completed', []):
            used.add(f"{c['concept']}:{c['points']}")
        
        # Active challenge
        active = challenges.get('active')
        if active:
            used.add(f"{active['concept']}:{active['points']}")
        
        # Pending challenges
        for c in challenges.get('pending', []):
            used.add(f"{c['concept']}:{c['points']}")
        
        return used
    
    def verify_challenge(self, challenge, user_points, user_degree):
        """
        Verify if user's work matches the challenge requirements.
        
        Returns dict with:
        - success: bool
        - feedback: str
        - details: dict
        """
        concept = challenge['concept']
        required_points = challenge['points']
        
        # Check point count
        if user_points != required_points:
            return {
                'success': False,
                'feedback': f"You have {user_points} points, but the challenge requires exactly {required_points} points. "
                           f"{'Add' if user_points < required_points else 'Remove'} {abs(user_points - required_points)} point(s).",
                'details': {
                    'points_match': False,
                    'concept_match': False
                }
            }
        
        # Points match, now check if the degree creates the right concept
        concept_match = self._check_concept_match(concept, user_points, user_degree)
        
        if concept_match['matches']:
            return {
                'success': True,
                'feedback': f"✓ Excellent! You successfully created {challenge['description']}. {concept_match['explanation']}",
                'details': {
                    'points_match': True,
                    'concept_match': True
                }
            }
        else:
            return {
                'success': False,
                'feedback': f"You have the right number of points ({required_points}), but {concept_match['explanation']} "
                           f"{concept_match['suggestion']}",
                'details': {
                    'points_match': True,
                    'concept_match': False
                }
            }
    
    def _check_concept_match(self, target_concept, points, degree):
        """
        Determine if the given degree creates the target concept.
        
        Rules:
        - Underfitting: degree 1-2 (too simple)
        - Balanced: degree 2-4 (appropriate)
        - Overfitting: degree >= 5 or degree >= points-1 (too complex)
        """
        max_possible_degree = points - 1
        
        if target_concept == 'underfitting':
            if degree <= 2:
                return {
                    'matches': True,
                    'explanation': f"The degree-{degree} line is too simple to capture all the patterns, creating underfitting."
                }
            else:
                return {
                    'matches': False,
                    'explanation': f"degree {degree} is too complex for underfitting.",
                    'suggestion': "Try degree 1 or 2 to create a model that's too simple."
                }
        
        elif target_concept == 'balanced':
            if 2 <= degree <= 4 and degree < max_possible_degree - 1:
                return {
                    'matches': True,
                    'explanation': f"Degree {degree} provides good fit without overfitting - balanced complexity."
                }
            elif degree <= 1:
                return {
                    'matches': False,
                    'explanation': f"degree {degree} is too simple, creating underfitting.",
                    'suggestion': "Try degree 2-4 for a balanced fit."
                }
            else:
                return {
                    'matches': False,
                    'explanation': f"degree {degree} is too complex, creating overfitting.",
                    'suggestion': "Try degree 2-4 for a balanced fit."
                }
        
        elif target_concept == 'overfitting':
            if degree >= 5 or degree >= max_possible_degree - 1:
                return {
                    'matches': True,
                    'explanation': f"Degree {degree} is very high for {points} points, memorizing the data instead of learning patterns."
                }
            else:
                return {
                    'matches': False,
                    'explanation': f"degree {degree} doesn't create overfitting yet.",
                    'suggestion': f"Try degree {min(max_possible_degree, 6)} or higher to see overfitting."
                }
        
        return {'matches': False, 'explanation': 'Unknown concept', 'suggestion': ''}
    
    def get_challenge_summary(self, session_state):
        """Get summary of all challenges for display"""
        challenges_data = session_state.get('challenges', {})
        
        return {
            'pending_count': len(challenges_data.get('pending', [])),
            'active': challenges_data.get('active'),
            'completed_count': len(challenges_data.get('completed', [])),
            'completed': challenges_data.get('completed', [])
        }


# Helper functions for Flask integration

def initialize_challenge_state():
    """Initialize challenge state in session"""
    return {
        'pending': [],      # Queue of generated challenges
        'active': None,     # Current active challenge
        'completed': []     # History of completed challenges
    }

def add_challenge_to_queue(session_state, challenge):
    """Add a new challenge to pending queue"""
    if 'challenges' not in session_state:
        session_state['challenges'] = initialize_challenge_state()
    
    if challenge:
        session_state['challenges']['pending'].append(challenge)

def activate_next_challenge(session_state):
    """
    Move next pending challenge to active.
    Returns the activated challenge or None if queue is empty.
    """
    if 'challenges' not in session_state:
        session_state['challenges'] = initialize_challenge_state()
    
    pending = session_state['challenges']['pending']
    
    if not pending:
        return None
    
    # Get first challenge from queue (FIFO)
    next_challenge = pending.pop(0)
    next_challenge['status'] = 'active'
    next_challenge['activated_at'] = datetime.now().isoformat()
    
    session_state['challenges']['active'] = next_challenge
    
    return next_challenge

def complete_challenge(session_state, challenge):
    """Mark active challenge as completed and move to free mode"""
    if 'challenges' not in session_state:
        return
    
    challenge['status'] = 'completed'
    challenge['completed_at'] = datetime.now().isoformat()
    
    session_state['challenges']['completed'].append(challenge)
    session_state['challenges']['active'] = None  # Back to free mode

def dismiss_active_challenge(session_state):
    """User dismisses active challenge - move back to pending"""
    if 'challenges' not in session_state:
        return
    
    active = session_state['challenges'].get('active')
    if active:
        active['status'] = 'pending'
        session_state['challenges']['pending'].insert(0, active)  # Put back at front
        session_state['challenges']['active'] = None
