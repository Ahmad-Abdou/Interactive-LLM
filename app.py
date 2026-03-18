from flask import Flask, jsonify, render_template, request, session, Response
import google.generativeai as genai
import time
import json
import re
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

MODEL_PRIORITY = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-3-flash-preview']

# ─── Session Helpers ───

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

# ─── AI Generation ───

def generate_with_fallback(prompt, stream=False):
  if not GEMINI_API_KEY:
    return {'response': 'GEMINI_API_KEY is missing', 'success': False}

    for model_name in MODEL_PRIORITY:
        try:
            model = genai.GenerativeModel(model_name)
            config = {'temperature': 0.7, 'max_output_tokens': 65536}
            if stream:
                response = model.generate_content(prompt, stream=True, generation_config=config)
                return {'response_stream': response, 'model_used': model_name, 'success': True}
            else:
                response = model.generate_content(prompt, generation_config=config)
                return {'response': response.text, 'model_used': model_name, 'success': True}
        except Exception as e:
            print(f"Model {model_name} failed: {str(e)}")
    return {'response': 'Error', 'success': False}

# ─── Scene Descriptor System ───

SCENE_SYSTEM_PROMPT = """You are an interactive educational AI tutor. You ALWAYS create visual, interactive learning experiences for ANY subject — math, physics, biology, chemistry, history, computer science, economics, music theory, literally anything.

You have a TOOLKIT of visual primitives. You are the architect — you decide what to build and how.

IMPORTANT: You MUST ALWAYS include an interactive scene in your response. NEVER give a text-only response. Every topic can be visualized.

═══════════════════════════════════════════════
YOUR TOOLKIT
═══════════════════════════════════════════════

ELEMENT TYPES (SVG shapes — these use PIXEL coordinates on the canvas, typically 700x450):
  circle  — type:"circle", id, props: {cx, cy, r, fill, stroke, strokeWidth, label, labelColor, labelSize}
  rect    — type:"rect", id, props: {x, y, width, height, fill, stroke, rx, ry, label, labelColor, labelSize}
  line    — type:"line", id, props: {x1, y1, x2, y2, color, thickness}
  arrow   — type:"arrow", id, props: {x1, y1, x2, y2, color, thickness, headSize, label}
  text    — type:"text", id, props: {x, y, text, fontSize, color, fontWeight, anchor}
  path    — type:"path", id, props: {points: [{x,y},...], color, thickness, smooth, dashed}
  group   — type:"group", id, props: {x, y}, children: [nested elements]

CONTROL TYPES (sidebar — every control MUST have a "type" field):
  slider   — type:"slider", id, label, min, max, step, value, minLabel, maxLabel
  button   — type:"button", id, label, style ("primary"/"success"/"danger"/"secondary"), icon (emoji)
  input    — type:"input", id, label, placeholder, inputType ("text"/"number")
  toggle   — type:"toggle", id, label
  dropdown — type:"dropdown", id, label, options [...], value
  point_counter — type:"point_counter", id, label, current, max

TRIGGER TYPES:
  "init"                 — runs on scene load
  "canvas_click"         — runs on SVG click
  "button_click:<id>"    — runs on button click
  "control_change:<id>"  — runs on slider/dropdown/toggle change

PRE-BUILT BEHAVIOR FUNCTIONS (for specific CS/ML topics only):
  Polynomial: add_circle, redraw_fit_line
  BST: bst_insert, bst_delete, bst_search (params: {valueFrom: "<input_id>"})
  Sorting: sort_init, sort_step, sort_reset (params: {values: [...], algorithm: "bubble"})
  Neural Net: nn_init, nn_add_layer, nn_remove_layer, nn_forward_pass, nn_adjust_weights
  Graph: graph_add_node, graph_add_edge, graph_bfs, graph_dfs
  Stack: stack_push, stack_pop (params: {valueFrom: "<input_id>"})
  Queue: queue_enqueue, queue_dequeue
  Linked List: ll_init, ll_insert, ll_insert_front, ll_delete
  Hash Table: hash_init, hash_insert, hash_lookup
  Gradient Descent: gd_init, gradient_descent_step, gd_adjust_lr, gd_reset
  K-Means: kmeans_init, kmeans_step, kmeans_reset
  Activation Funcs: activation_init, activation_change
  Generic: reset_scene, highlight_elements

═══════════════════════════════════════════════
GENERIC INTERACTIVE BEHAVIORS (use these to make element-driven scenes interactive!):
═══════════════════════════════════════════════

These behaviors let you wire controls to element changes. USE THEM to make your scenes interactive!

  update_element — Updates one element's property from a control value.
    trigger: "control_change:<slider_id>"
    action: "update_element"
    params: {elementId: "<id>", prop: "<property>", scale: 1, offset: 0}
    The slider value is multiplied by scale and added to offset.
    Properties you can update: cx, cy, r, x, y, width, height, fill, x1, y1, x2, y2, etc.

  update_elements — Updates MULTIPLE elements from one control.
    action: "update_elements"
    params: {updates: [{elementId: "<id>", prop: "<prop>", scale: 1, offset: 0}, ...]}

  set_text — Updates a text element's content using a template.
    action: "set_text"  
    params: {elementId: "<text_id>", template: "Value: {value}", decimals: 1}
    Templates: {value}, {value2} (squared), {half}, {double}

  toggle_elements — Shows/hides elements by IDs or tag (use with toggle control).
    action: "toggle_elements"
    params: {elementIds: ["arrow_right", "label_right"], showWhen: "on"}
    OR params: {elementId: "some_element", showWhen: "on"}
    OR params: {tag: "my_tag", showWhen: "on"}
    PREFER elementIds array — list the element IDs you want to toggle.
    Tag elements by setting their "tag" field in the element descriptor.

  show_step — For step-by-step explanations (slider from 1 to N).
    action: "show_step"
    params: {maxSteps: 5}
    Tag elements as "step_1", "step_2", etc.

  calculate_and_display — Evaluates a math formula using control values.
    action: "calculate_and_display"
    params: {elementId: "<text_id>", formula: "Math.sqrt(a*a + b*b)", controlIds: {a: "side_a", b: "side_b"}, template: "c = {result}", decimals: 2}

  highlight_element — Briefly highlights an element (button trigger).
    action: "highlight_element"
    params: {elementId: "<id>", fill: "#FFD700", duration: 1500}

═══════════════════════════════════════════════
ELEMENT-DRIVEN SCENES (for topics WITHOUT pre-built behaviors):
═══════════════════════════════════════════════

For topics without pre-built behaviors, use elements + generic behaviors to create INTERACTIVE diagrams.

MATH:
  - Limits: draw curve, use slider for "x approaching a", wire update_element to move point along curve
  - Derivatives: draw curve + tangent line, use slider to move tangent point, wire update_element
  - Integrals: draw curve, shade area with rects, use slider for bounds
  - Pythagorean theorem: draw triangle, use sliders for sides a,b; wire calculate_and_display for c

PHYSICS:
  - Projectile motion: draw trajectory, slider for angle/velocity, update_element
  - Newton's Laws: draw box, slider for force, update_element for arrow length
  - Waves: draw sine wave, sliders for amplitude/wavelength

BIOLOGY:
  - Cell structure: toggle_elements to show/hide organelle labels
  - Photosynthesis: show_step for each stage

═══════════════════════════════════════════════
COMPLETE INTERACTIVE EXAMPLE — Pythagorean Theorem with working sliders:
═══════════════════════════════════════════════

[SCENE_START]
{
  "topic": "pythagorean",
  "title": "Pythagorean Theorem — Interactive",
  "canvas": {"width": 700, "height": 450},
  "interactionMode": "none",
  "elements": [
    {"type": "line", "id": "side_a_line", "props": {"x1": 200, "y1": 350, "x2": 200, "y2": 150, "color": "#e74c3c", "thickness": 4}},
    {"type": "line", "id": "side_b_line", "props": {"x1": 200, "y1": 350, "x2": 450, "y2": 350, "color": "#2196F3", "thickness": 4}},
    {"type": "line", "id": "side_c_line", "props": {"x1": 200, "y1": 150, "x2": 450, "y2": 350, "color": "#4CAF50", "thickness": 4}},
    {"type": "text", "id": "label_a", "props": {"x": 170, "y": 260, "text": "a = 3", "fontSize": 18, "color": "#e74c3c", "fontWeight": "bold"}},
    {"type": "text", "id": "label_b", "props": {"x": 320, "y": 390, "text": "b = 4", "fontSize": 18, "color": "#2196F3", "fontWeight": "bold"}},
    {"type": "text", "id": "label_c", "props": {"x": 370, "y": 230, "text": "c = 5.00", "fontSize": 18, "color": "#4CAF50", "fontWeight": "bold"}},
    {"type": "text", "id": "formula", "props": {"x": 350, "y": 440, "text": "a² + b² = c²", "fontSize": 20, "color": "#333", "fontWeight": "bold", "anchor": "middle"}}
  ],
  "controls": [
    {"type": "slider", "id": "side_a", "label": "Side a", "min": 1, "max": 10, "step": 1, "value": 3},
    {"type": "slider", "id": "side_b", "label": "Side b", "min": 1, "max": 10, "step": 1, "value": 4},
    {"type": "button", "id": "check_btn", "label": "Check My Understanding", "style": "primary", "icon": "✓"}
  ],
  "behaviors": [
    {"trigger": "control_change:side_a", "action": "set_text", "params": {"elementId": "label_a", "template": "a = {value}"}},
    {"trigger": "control_change:side_b", "action": "set_text", "params": {"elementId": "label_b", "template": "b = {value}"}},
    {"trigger": "control_change:side_a", "action": "calculate_and_display", "params": {"elementId": "label_c", "formula": "Math.sqrt(a*a + b*b)", "controlIds": {"a": "side_a", "b": "side_b"}, "template": "c = {result}", "decimals": 2}},
    {"trigger": "control_change:side_b", "action": "calculate_and_display", "params": {"elementId": "label_c", "formula": "Math.sqrt(a*a + b*b)", "controlIds": {"a": "side_a", "b": "side_b"}, "template": "c = {result}", "decimals": 2}}
  ],
  "checkConfig": {
    "stateKeys": ["side_a", "side_b"],
    "prompt": "The student is exploring the Pythagorean theorem. Ask them: what happens to c when you increase a or b?"
  }
}
[SCENE_END]

═══════════════════════════════════════════════
ELEMENT FEATURES — Tooltips, Dragging, and Animations:
═══════════════════════════════════════════════

TOOLTIPS: Add a "tooltip" property to any element's props to show a description on hover.
  Example: {"type": "circle", "id": "nucleus", "props": {"cx": 300, "cy": 200, "r": 40, "fill": "#e74c3c", "tooltip": "The nucleus contains protons and neutrons"}}
  Use tooltips to explain what each part of the diagram represents!

DRAGGABLE: Add "draggable": true to any element's props to let users drag it around.
  Works on: circle, rect, text, group elements.
  Example: {"type": "circle", "id": "point", "props": {"cx": 200, "cy": 200, "r": 10, "fill": "#2196F3", "draggable": true, "tooltip": "Drag me to explore!"}}

ANIMATIONS — ONLY use when the topic INHERENTLY involves movement or flow:
  Add an "animations" array to the scene descriptor. An "▶ Animate" button will automatically appear.

  ⚠️ CRITICAL: Do NOT add animations just for decoration or emphasis!
  Only add animations when they represent REAL physical movement that helps understanding.

  ✅ GOOD uses of animation:
    - Electric circuits → flow_along_path (electrons flowing through wires)
    - Blood circulation → flow_along_path (blood flowing through vessels)
    - Water cycle → flow_along_path (water moving through the cycle)
    - Planetary orbits → rotate (planets orbiting)
    - Gears/motors → rotate (mechanical rotation)
    - Wave motion → animate_property on cy (oscillating up/down)
    - Pendulum → animate_property on cx/cy (swinging)
    - Projectile motion → animate_property on position

  ❌ DO NOT use animations for:
    - Math concepts (limits, derivatives, integrals, theorems)
    - Data structures (trees, graphs, stacks, queues)
    - Static diagrams (anatomy, architecture, chemistry structures)
    - CNN/neural network visualizations
    - Sorting algorithms (use step buttons instead)
    - Any topic where "bouncing" or "pulsing" adds no educational value

  If the topic does NOT naturally involve movement, do NOT include an "animations" array at all.
  The Animate button will not appear, which is the correct behavior for static topics.

  Animation types:

  flow_along_path — Particles flow along a path element.
    {"type": "flow_along_path", "pathId": "<path_element_id>", "particleCount": 5, "particleColor": "#FFD700", "particleRadius": 4, "speedControl": "<slider_id>", "speedScale": 1.0}
    - speedControl: ID of a slider that controls particle speed
    - reverseControl: ID of a toggle that reverses flow direction

  animate_property — Smoothly oscillates any element property (for waves, pendulums, etc.).
    {"type": "animate_property", "elementId": "<id>", "prop": "cy", "min": 100, "max": 300, "frequency": 0.5}

  rotate — Continuously rotates an element (for gears, orbits, spinning objects).
    {"type": "rotate", "elementId": "<id>", "rpm": 30}

EXAMPLE — Electric Circuit with animated current flow:
  "elements": [
    {"type": "path", "id": "wire_top", "props": {"points": [{"x":100,"y":200}, {"x":300,"y":200}, {"x":500,"y":200}], "color": "#333", "thickness": 3, "tooltip": "Wire carrying current"}},
    {"type": "rect", "id": "battery", "props": {"x": 60, "y": 180, "width": 40, "height": 40, "fill": "#4CAF50", "label": "+", "tooltip": "Battery: provides voltage"}},
    {"type": "rect", "id": "resistor", "props": {"x": 280, "y": 180, "width": 60, "height": 40, "fill": "#FF9800", "label": "R", "tooltip": "Resistor: opposes current flow"}}
  ],
  "controls": [
    {"type": "slider", "id": "voltage", "label": "Voltage (V)", "min": 1, "max": 12, "step": 1, "value": 5},
    {"type": "slider", "id": "resistance", "label": "Resistance (Ω)", "min": 1, "max": 100, "step": 1, "value": 50}
  ],
  "animations": [
    {"type": "flow_along_path", "pathId": "wire_top", "particleCount": 6, "particleColor": "#FFD700", "particleRadius": 4, "speedControl": "voltage", "speedScale": 1.0}
  ]
  
  Use TOOLTIPS on every major element so users understand the diagram!
  Use DRAGGABLE when users should be able to rearrange elements.

═══════════════════════════════════════════════
HOW TO RESPOND:
═══════════════════════════════════════════════

CASE A — SPECIFIC TOPIC (any subject — this is your DEFAULT):
  Your response should feel like a COMPREHENSIVE AI tutor lesson — rich, detailed explanation WITH an interactive visualization embedded in the middle. Think of it as a textbook page with an interactive demo.

  STRUCTURE YOUR RESPONSE LIKE THIS:

  PART 1 — DETAILED EXPLANATION (BEFORE the scene):
  Write a thorough, engaging explanation of the topic. This should be educational and complete:
  - Start with what the concept IS and why it matters (1-2 paragraphs)
  - Explain the core theory, key formulas, or principles (2-3 paragraphs)
  - Give real-world examples or analogies to build intuition
  - Use markdown formatting: **bold** for key terms, *italics* for emphasis, bullet points for lists
  - Use $math notation$ for formulas when relevant
  - This should be 300-600 words — as detailed as any good AI tutor response

  PART 2 — INTERACTIVE SCENE:
  Output COMPLETE JSON between [SCENE_START] and [SCENE_END]
  - If a pre-built behavior exists → use behavior-driven scene
  - Otherwise → use element-driven scene (place shapes, arrows, paths, text)

  PART 3 — HOW TO USE THIS INTERACTIVE (AFTER the scene):
  Write clear instructions on how to interact with the visualization:
  - Explain what each control does and what the user should observe
  - Give specific things to try (e.g., "Move the slider to 5 and notice how...")
  - Point out key insights the visualization reveals
  - This should be 3-6 bullet points with detail

  IMPORTANT: Both the text AND the scene are equally important. Write a complete explanation AND a complete scene.

CASE B — BROAD/GENERAL TOPIC (e.g. "teach me math", "explain biology", "what is economics"):
  1. Write a comprehensive 3-4 paragraph explanation about THAT SPECIFIC SUBJECT
  2. Think: "What are the most interesting sub-topics WITHIN THIS SUBJECT that I could visualize?"
  3. Generate 4-6 suggestions that are sub-topics OF THE USER'S SUBJECT
  4. Each suggestion query MUST start with "Visualize" to ensure a scene is created
  5. Output between [SUGGESTIONS_START] and [SUGGESTIONS_END]:
     {"suggestions": [
       {"label": "Sub-topic Name", "query": "Visualize [sub-topic description]", "icon": "emoji"},
       ...
     ]}

  IMPORTANT: Suggestions MUST be about the SAME SUBJECT the user asked about!
  - "teach me math" → math topics only
  - "teach me physics" → physics topics only
  - "teach me biology" → biology topics only
  NEVER suggest unrelated topics.

RULES:
- NEVER respond with text only — ALWAYS include either a [SCENE_START]...[SCENE_END] or [SUGGESTIONS_START]...[SUGGESTIONS_END]
- JSON must be valid — no trailing commas, no comments inside JSON
- Every element MUST have "type", "id", and "props" fields
- Every control MUST have a "type" field (slider/button/input/toggle/dropdown/point_counter)
- "axes" is NOT an element type — draw axes manually with line elements and text labels
- For element-driven scenes, think about what the textbook diagram looks like and recreate it with shapes
- Use colorful fills, clear labels, and logical positioning
- Canvas coordinates are in pixels — x goes right (0-700), y goes DOWN (0-450)
- One scene OR suggestions block per response, never both
"""

def create_interactive_prompt(user_message, visual_reference=""):
    ref_section = ""
    if visual_reference:
        ref_section = f"""
═══════════════════════════════════════════════
VISUAL REFERENCE — How this topic is commonly visualized:
═══════════════════════════════════════════════
{visual_reference}

Use this reference to guide your element placement. Match the described layout, shapes, colors, and labels as closely as possible using your toolkit (circle, rect, line, arrow, text, path elements).
"""

    return f"""{SCENE_SYSTEM_PROMPT}
{ref_section}
USER QUESTION: {user_message}

You are the architect. Think about:
1. What SUBJECT is the user asking about?
2. If broad → suggest sub-topics WITHIN THAT SUBJECT
3. If specific → compose a scene using elements, controls, and behaviors that best illustrates this topic
4. For non-CS topics, use element-driven scenes (place shapes, arrows, colors, labels to create diagrams)
5. IMPORTANT: Every control MUST have a "type" field (slider/button/input/toggle/dropdown/point_counter)
6. IMPORTANT: "axes" is NOT an element type — only use: circle, rect, line, arrow, text, path, group
7. IMPORTANT: Every element MUST have "type", "id", and "props" fields

Your JSON must be valid. No trailing commas. No comments in JSON. STOP after instructions."""


def create_check_prompt(state, scene_check_config, challenge_context=None):
    """Create a feedback prompt from the scene's checkConfig and current state."""
    prompt_template = scene_check_config.get('prompt', 'Analyze the student\'s work.')

    for key, value in state.items():
        placeholder = '{' + key + '}'
        if isinstance(value, (list, dict)):
            prompt_template = prompt_template.replace(placeholder, json.dumps(value))
        else:
            prompt_template = prompt_template.replace(placeholder, str(value))

    challenge_section = ""
    if challenge_context:
        challenge_section = f"""
ACTIVE CHALLENGE: The student is working on this specific challenge:
Challenge: {challenge_context.get('challengeText', '')}
Check Criteria: {challenge_context.get('checkCriteria', '')}

Evaluate whether the student has COMPLETED the challenge correctly based on the current state below.
If correct, congratulate them enthusiastically. If not, give a specific hint about what to adjust."""

    return f"""You are an AI teacher providing feedback on a student's interactive work.

{challenge_section}

{prompt_template}

Current state: {json.dumps(state)}

RULES:
- Address the student directly using "you/your"
- Be encouraging but accurate
- Keep response to 2-3 sentences
- Suggest specific next steps they can try
- No emoji boxes or special formatting — plain text only"""


# ─── Routes ───

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/chat_stream', methods=['POST'])
def chat_stream():
    try:
        data = request.get_json()
        user_message = data.get('message', '')

        set_server_data('last_message', user_message)
        set_server_data('attempts', [])

        # ─── Step 1: Visual Reference Research (optional, non-blocking) ───
        # For specific topics, first ask the AI how this topic is commonly
        # visualized. If this fails (quota, timeout), we skip it gracefully.
        visual_reference = ""
        broad_keywords = ['teach me', 'explain', 'what is', 'tell me about',
                         'introduce', 'overview', 'learn about', 'help me understand']
        is_broad = any(kw in user_message.lower() for kw in broad_keywords) and len(user_message.split()) <= 6

        if not is_broad:
            try:
                ref_prompt = f"""You are an expert educational diagram designer. A student wants to learn about: "{user_message}"

Describe EXACTLY how this topic is commonly visualized in textbooks and educational websites. Be very specific about:
1. What shapes are used (circles, rectangles, triangles, arrows, lines)
2. How they are arranged (left to right, top to bottom, circular, hierarchical)
3. What colors are typically used for different parts
4. What labels and text annotations are placed where

Describe 2-3 common visual representations. Be concrete about positions, colors, and shapes.
Keep your response under 150 words. Focus on VISUAL LAYOUT only."""

                ref_result = generate_with_fallback(ref_prompt)
                if ref_result['success']:
                    visual_reference = ref_result['response']
                    # Brief pause to avoid rate limiting between calls
                    time.sleep(2)
            except Exception as e:
                print(f"Visual reference step failed (non-critical): {e}")
                visual_reference = ""

        # ─── Step 2: Compose scene with reference ───
        prompt = create_interactive_prompt(user_message, visual_reference)
        result = generate_with_fallback(prompt, stream=True)

        if not result['success']:
            return jsonify({'error': 'All AI models are currently unavailable. Please try again in a moment.'}), 503

        def generate():
            try:
                for chunk in result['response_stream']:
                    if chunk.text:
                        yield chunk.text
            except Exception as e:
                yield f"[Error: {str(e)}]"

        return Response(generate(), mimetype='text/plain')
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/check_work', methods=['POST'])
def check_work():
    """Generic check endpoint — works with any scene type."""
    try:
        data = request.get_json()
        state = data.get('state', {})
        check_config = data.get('checkConfig', {})
        challenge_context = data.get('challengeContext', None)

        if not state:
            return jsonify({'feedback': "Interact with the canvas first!", 'model_used': 'system'})

        prompt = create_check_prompt(state, check_config, challenge_context)
        ai_result = generate_with_fallback(prompt)

        if not ai_result['success']:
            return jsonify({'error': 'Error'}), 500

        attempts = get_server_data('attempts', [])
        attempts.append({'state': state, 'timestamp': time.time()})
        set_server_data('attempts', attempts)

        return jsonify({
            'feedback': ai_result['response'],
            'attempt_number': len(attempts),
            'model_used': ai_result.get('model_used', 'unknown')
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/generate_challenge', methods=['POST'])
def generate_challenge():
    """Generate a topic-specific challenge using the current scene's controls and elements."""
    try:
        data = request.get_json()
        topic = data.get('topic', 'this topic')
        controls = data.get('controls', [])
        elements = data.get('elements', [])
        current_state = data.get('currentState', {})

        # Build a description of available controls
        controls_desc = []
        for c in controls:
            ctype = c.get('type', '?')
            cid = c.get('id', '?')
            label = c.get('label', cid)
            if ctype == 'slider':
                controls_desc.append(f"  - Slider '{label}' (id: {cid}): range {c.get('min', 0)} to {c.get('max', 100)}, step {c.get('step', 1)}")
            elif ctype in ('toggle', 'checkbox'):
                controls_desc.append(f"  - Toggle '{label}' (id: {cid}): on/off switch")
            elif ctype in ('dropdown', 'select'):
                opts = c.get('options', [])
                controls_desc.append(f"  - Dropdown '{label}' (id: {cid}): options {opts}")
            elif ctype == 'input':
                controls_desc.append(f"  - Input '{label}' (id: {cid}): text/number input")
            elif ctype == 'button':
                # Skip system buttons
                if cid in ('check_btn', 'reset_btn', 'view_feedback_btn', '_animate_btn'):
                    continue
                controls_desc.append(f"  - Button '{label}' (id: {cid})")

        controls_text = '\n'.join(controls_desc) if controls_desc else '  (no interactive controls available)'

        prompt = f"""You are an AI teacher creating a hands-on challenge for a student.

TOPIC: {topic}

The student has an interactive visualization with these controls:
{controls_text}

Current state: {json.dumps(current_state)}

Generate ONE specific, concrete challenge that the student can solve by manipulating the interactive controls listed above.

RULES:
- The challenge MUST be solvable using ONLY the controls listed above
- Be specific with numbers/values (e.g., "Set X to produce Y" not "explore X")
- The challenge should test understanding of the topic, not just button-clicking
- Make it educational — solving it should teach something
- Difficulty: moderate (not trivial, not impossible)

Respond in EXACTLY this JSON format (no markdown, no code blocks):
{{"challengeText": "Your challenge description here — clear, specific, 1-2 sentences", "checkCriteria": "What to check: describe the expected control values or state that indicates success", "hint": "A subtle hint if the student gets stuck"}}"""

        ai_result = generate_with_fallback(prompt)

        if not ai_result['success']:
            return jsonify({'error': 'Failed to generate challenge'}), 500

        # Parse AI response as JSON
        response_text = ai_result['response'].strip()
        # Clean up potential markdown wrapping
        response_text = response_text.replace('```json', '').replace('```', '').strip()
        
        try:
            challenge = json.loads(response_text)
        except json.JSONDecodeError:
            # Try to extract JSON from response
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                challenge = json.loads(json_match.group())
            else:
                return jsonify({'error': 'Failed to parse challenge'}), 500

        return jsonify({
            'challenge': challenge,
            'model_used': ai_result.get('model_used', 'unknown')
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/check_visualization', methods=['POST'])
def check_visualization():
    """Legacy endpoint."""
    try:
        data = request.get_json()
        points = data.get('points', [])
        degree = data.get('degree', 1)

        if len(points) == 0:
            return jsonify({'feedback': "Place some points first!", 'model_used': 'system'})

        state = {'points': points, 'point_count': len(points), 'degree': degree}
        check_config = {
            'prompt': "Analyze student's polynomial fitting: {point_count} points, degree {degree}. Underfitting, overfitting, or balanced? Address student directly in 2-3 sentences."
        }

        prompt = create_check_prompt(state, check_config)
        ai_result = generate_with_fallback(prompt)

        if not ai_result['success']:
            return jsonify({'error': 'Error'}), 500

        return jsonify({'feedback': ai_result['response'], 'challenge_mode': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/start_quiz', methods=['POST'])
def start_quiz():
    questions = [
        {'id': 1, 'image': None, 'question': 'A model uses a STRAIGHT LINE (degree 1) to fit data with a clear CURVED pattern. What problem exists?',
         'options': ['A) Overfitting', 'B) Underfitting', 'C) Perfect fit', 'D) Not enough data'], 'correct_answer': 'B',
         'explanation': 'A straight line is too simple for a curved pattern - classic underfitting.'},
        {'id': 2, 'image': None, 'question': 'A degree-9 polynomial PERFECTLY fits all 10 data points with an extremely WIGGLY line. What issue?',
         'options': ['A) Underfitting', 'B) Balanced fit', 'C) Overfitting', 'D) Insufficient complexity'], 'correct_answer': 'C',
         'explanation': 'A degree-9 polynomial for 10 points memorizes noise - overfitting.'},
        {'id': 3, 'image': None, 'question': 'A degree-3 polynomial SMOOTHLY follows the data trend without excessive wiggling. This demonstrates:',
         'options': ['A) Severe underfitting', 'B) Good balanced fit', 'C) Severe overfitting', 'D) Random guessing'], 'correct_answer': 'B',
         'explanation': 'Captures the trend without memorizing noise - balanced fit.'},
        {'id': 4, 'image': None, 'question': 'You have 8 data points. Which polynomial degree will likely GENERALIZE BEST?',
         'options': ['A) Degree 1', 'B) Degree 3', 'C) Degree 7', 'D) All equal'], 'correct_answer': 'B',
         'explanation': 'Degree 3 balances complexity - not too simple, not too complex.'},
        {'id': 5, 'image': None, 'question': 'A model achieves ZERO training error. This MOST LIKELY means:',
         'options': ['A) Perfect model', 'B) Likely overfitting', 'C) Good performance guaranteed', 'D) Optimal complexity'], 'correct_answer': 'B',
         'explanation': 'Zero training error usually indicates overfitting.'}
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
            if is_correct: correct += 1
            results.append({'question_id': q['id'], 'question': q['question'], 'image': q['image'],
                           'selected': selected, 'correct': q['correct_answer'], 'is_correct': is_correct, 'explanation': q['explanation']})

        percentage = (correct / 5) * 100
        quiz_results = {'score': correct, 'total': 5, 'percentage': percentage, 'passed': percentage >= 60,
                       'time_taken': data.get('time_taken_seconds', 0), 'results': results}

        session_id = get_session_id()
        logger.save_quiz_result(session_id, quiz_results)
        return jsonify(quiz_results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/admin/monitor')
def admin_monitor():
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