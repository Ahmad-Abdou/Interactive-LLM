/**
 * Canvas Engine — The Core Scene Orchestrator
 * Parses AI-generated scene descriptors, instantiates elements/controls,
 * routes interactions to behavior functions, and provides state for checking.
 */

class CanvasEngine {
    /**
     * @param {HTMLElement} parentEl — the DOM element to render into
     * @param {Object} descriptor — scene descriptor JSON from the AI
     * @param {Object} options — { onStateChange, onCheck }
     */
    constructor(parentEl, descriptor, options = {}) {
        this.parentEl = parentEl;
        this.descriptor = descriptor;
        this.options = options;

        // Scene graph
        this.elements = new Map();   // id → element instance
        this.controls = new Map();   // id → control instance

        // SVG & layout
        this.svg = null;
        this.svgContent = null;      // inner <g> for drawing
        this.canvasWidth = descriptor.canvas?.width || 600;
        this.canvasHeight = descriptor.canvas?.height || 500;
        this.margin = { top: 20, right: 20, bottom: 40, left: 40 };
        this.innerWidth = this.canvasWidth - this.margin.left - this.margin.right;
        this.innerHeight = this.canvasHeight - this.margin.top - this.margin.bottom;

        // Scales (optional axes)
        this.xScale = null;
        this.yScale = null;

        // Main containers
        this.vizContainer = null;
        this.canvasContainer = null;
        this.controlsContainer = null;

        // Internal data
        this._bstRoot = null;
        this._sortArray = null;
        this._sortStep = 0;
        this._graphNodes = null;
        this._graphEdges = null;
        this._graphNextId = 0;
        this._stack = null;
        this._queue = null;
        this._linkedList = null;
        this._hashTable = null;
        this._hashSize = 7;
        this._nnLayers = null;
        this._gdState = null;
        this._kmeansState = null;
        this._activationFunc = null;

        this._build();
    }

    /* ─── Build Layout ─── */

    _build() {
        const d = this.descriptor;

        // Main flex container
        this.vizContainer = document.createElement('div');
        this.vizContainer.style.cssText = `
      display:flex;gap:15px;margin-top:15px;padding:15px;
      background:#f5f5f5;border-radius:8px;border:1px solid #ddd;
    `;

        // Canvas area (SVG)
        this.canvasContainer = document.createElement('div');
        this.canvasContainer.style.cssText = 'flex:1;min-width:0;';
        this.vizContainer.appendChild(this.canvasContainer);

        // Controls panel
        this.controlsContainer = document.createElement('div');
        this.controlsContainer.style.cssText = `
      width:280px;display:flex;flex-direction:column;gap:12px;flex-shrink:0;
    `;
        this.vizContainer.appendChild(this.controlsContainer);

        this.parentEl.appendChild(this.vizContainer);

        // Create SVG
        this.svg = d3.select(this.canvasContainer)
            .append('svg')
            .attr('width', this.canvasWidth)
            .attr('height', this.canvasHeight)
            .style('background', '#fafafa')
            .style('border-radius', '6px')
            .style('border', '1px solid #e0e0e0')
            .style('overflow', 'hidden');

        // Defs for markers
        this.svg.append('defs');

        this.svgContent = this.svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        // Draw axes if specified
        if (d.axes) this._drawAxes(d.axes);

        // Set up interaction
        if (d.interactionMode === 'click_to_add_points') {
            this.svg.style('cursor', 'crosshair');
            this.svg.on('click', (event) => this._handleCanvasClick(event));
        }

        // Build controls from descriptor
        this._buildControls(d.controls || []);

        // Build initial elements (recursive for groups with children)
        const buildElement = (elDesc, parentSvg) => {
            const elId = elDesc.id || `el_${Math.random().toString(36).substr(2, 6)}`;
            const el = createElement(elDesc.type, elId, elDesc.props || {});
            if (!el) return;
            if (elDesc.tag) el._tag = elDesc.tag;
            el.render(parentSvg);
            this.elements.set(elId, el);
            // Recursively build children for group elements
            const children = elDesc.children || (elDesc.props && elDesc.props.children) || [];
            if (children.length > 0 && el.el) {
                children.forEach(childDesc => buildElement(childDesc, el.el));
            }
        };
        (d.elements || []).forEach(elDesc => buildElement(elDesc, this.svgContent));

        // Wire up behaviors
        this._wireBehaviors(d.behaviors || []);

        // Initialize behaviors that have trigger 'init'
        (d.behaviors || []).filter(b => b.trigger === 'init').forEach(b => {
            this._executeBehavior(b.action, b.params || {});
        });

        // Initialize animation engine if animations are defined
        this._animationEngine = null;
        if (d.animations && d.animations.length > 0 && typeof AnimationEngine !== 'undefined') {
            this._animationEngine = new AnimationEngine(this, d.animations);
            // Add animate toggle button
            const animBtn = createControl('button', '_animate_btn', {
                type: 'button',
                label: '▶ Animate',
                style: 'primary',
                icon: '🎬'
            });
            animBtn.render(this.controlsContainer);
            this.controls.set('_animate_btn', animBtn);
            animBtn.onChange(() => {
                const isRunning = this._animationEngine.toggle();
                // Update button label
                const btnEl = animBtn.container?.querySelector('button');
                if (btnEl) {
                    btnEl.textContent = isRunning ? '⏸ Pause' : '▶ Animate';
                }
            });
        }
    }

    /* ─── Axes ─── */

    _drawAxes(axes) {
        const xRange = axes.xRange || [0, 100];
        const yRange = axes.yRange || [0, 100];

        this.xScale = d3.scaleLinear().domain(xRange).range([0, this.innerWidth]);
        this.yScale = d3.scaleLinear().domain(yRange).range([this.innerHeight, 0]);

        // Grid
        this.svgContent.append('g').attr('class', 'grid')
            .attr('transform', `translate(0,${this.innerHeight})`)
            .call(d3.axisBottom(this.xScale).tickSize(-this.innerHeight).tickFormat(''))
            .selectAll('line').style('stroke', '#e8e8e8');

        this.svgContent.append('g').attr('class', 'grid')
            .call(d3.axisLeft(this.yScale).tickSize(-this.innerWidth).tickFormat(''))
            .selectAll('line').style('stroke', '#e8e8e8');

        // Axes
        this.svgContent.append('g').attr('class', 'x-axis')
            .attr('transform', `translate(0,${this.innerHeight})`)
            .call(d3.axisBottom(this.xScale));

        this.svgContent.append('g').attr('class', 'y-axis')
            .call(d3.axisLeft(this.yScale));

        // Labels
        if (axes.xLabel) {
            this.svgContent.append('text')
                .attr('x', this.innerWidth / 2).attr('y', this.innerHeight + 35)
                .attr('text-anchor', 'middle').style('font-size', '12px').style('fill', '#666')
                .text(axes.xLabel);
        }
        if (axes.yLabel) {
            this.svgContent.append('text')
                .attr('transform', 'rotate(-90)')
                .attr('x', -this.innerHeight / 2).attr('y', -30)
                .attr('text-anchor', 'middle').style('font-size', '12px').style('fill', '#666')
                .text(axes.yLabel);
        }
    }

    /* ─── Canvas Interaction ─── */

    _handleCanvasClick(event) {
        // Find the behavior for canvas_click
        const behavior = (this.descriptor.behaviors || []).find(b => b.trigger === 'canvas_click');
        if (behavior) {
            const fn = BehaviorRegistry[behavior.action];
            if (fn) fn(this, behavior.props || behavior.params || {}, event);
        }
    }

    /* ─── Controls ─── */

    _buildControls(controlDescs) {
        controlDescs.forEach(cd => {
            const ctrl = createControl(cd.type, cd.id, cd);
            ctrl.render(this.controlsContainer);
            this.controls.set(cd.id, ctrl);
        });
    }

    getControl(id) {
        return this.controls.get(id) || null;
    }

    /* ─── Behaviors ─── */

    _wireBehaviors(behaviorDescs) {
        // Phase 1: Wire explicit triggers
        behaviorDescs.forEach(bd => {
            if (bd.trigger.startsWith('control_change:')) {
                const ctrlId = bd.trigger.split(':')[1];
                const ctrl = this.controls.get(ctrlId);
                if (ctrl) {
                    const existingCb = ctrl._onChange;
                    ctrl.onChange((id, value) => {
                        if (existingCb) existingCb(id, value);
                        this._executeBehavior(bd.action, { ...bd.params, value });
                    });
                } else {
                    console.warn(`Behavior trigger references unknown control: "${ctrlId}". Available: ${[...this.controls.keys()].join(', ')}`);
                }
            }
            else if (bd.trigger.startsWith('button_click:')) {
                const ctrlId = bd.trigger.split(':')[1];
                const ctrl = this.controls.get(ctrlId);
                if (ctrl) {
                    ctrl.onChange(() => {
                        this._executeBehavior(bd.action, bd.params || {});
                    });
                }
            }
        });

        // Phase 2: Auto-wire — for calculate_and_display behaviors, 
        // ensure ALL referenced controls trigger a re-calculation
        behaviorDescs.forEach(bd => {
            if (bd.action === 'calculate_and_display' && bd.params?.controlIds) {
                Object.values(bd.params.controlIds).forEach(ctrlId => {
                    const ctrl = this.controls.get(ctrlId);
                    if (ctrl) {
                        const existingCb = ctrl._onChange;
                        ctrl.onChange((id, value) => {
                            if (existingCb) existingCb(id, value);
                            this._executeBehavior(bd.action, { ...bd.params, value });
                        });
                    }
                });
            }
        });

        // Phase 3: Fallback auto-wire — if a behavior trigger didn't match a control,
        // try to match by checking if any control's ID contains the trigger ID or vice versa
        behaviorDescs.forEach(bd => {
            if (!bd.trigger.startsWith('control_change:')) return;
            const ctrlId = bd.trigger.split(':')[1];
            if (this.controls.has(ctrlId)) return; // already wired

            // Fuzzy match: find a control whose ID is similar
            for (const [existingId, ctrl] of this.controls) {
                if (existingId.includes(ctrlId) || ctrlId.includes(existingId)) {
                    console.info(`Auto-wiring: "${ctrlId}" → "${existingId}"`);
                    const existingCb = ctrl._onChange;
                    ctrl.onChange((id, value) => {
                        if (existingCb) existingCb(id, value);
                        this._executeBehavior(bd.action, { ...bd.params, value });
                    });
                    break;
                }
            }
        });

        // Phase 4: Auto-wire toggle controls that have no behaviors — detect toggle
        // controls and auto-wire them to toggle_elements if they seem related to element visibility.
        // This catches AI scenes that use toggles but forget proper behavior wiring.
        this.controls.forEach((ctrl, ctrlId) => {
            // Only handle toggle/checkbox controls
            if (ctrl.config?.type !== 'toggle' && ctrl.config?.type !== 'checkbox') return;

            // Check if this toggle already has a behavior wired
            const hasExplicitBehavior = behaviorDescs.some(bd => {
                const triggerId = bd.trigger.split(':')[1];
                return triggerId === ctrlId;
            });
            if (hasExplicitBehavior) return;

            // Auto-find elements whose IDs relate to this toggle's label or ID
            const label = (ctrl.config?.label || ctrlId).toLowerCase().replace(/[^a-z0-9]/g, '_');
            const keywords = label.split('_').filter(w => w.length > 2);
            const matchingElementIds = [];

            this.elements.forEach((el, elId) => {
                const elIdLower = elId.toLowerCase();
                if (keywords.some(kw => elIdLower.includes(kw))) {
                    matchingElementIds.push(elId);
                }
            });

            if (matchingElementIds.length > 0) {
                console.info(`Auto-wiring toggle "${ctrlId}" → toggle_elements for: ${matchingElementIds.join(', ')}`);
                ctrl.onChange((id, value) => {
                    this._executeBehavior('toggle_elements', { elementIds: matchingElementIds, value });
                });
            }
        });
    }

    _executeBehavior(actionName, params) {
        let fn = BehaviorRegistry[actionName];

        // If behavior not found, try common aliases/patterns
        if (!fn) {
            const lower = actionName.toLowerCase();
            // Redirect toggle/show/hide patterns to toggle_elements
            if (lower.includes('toggle') || lower.includes('show') || lower.includes('hide') || lower.includes('visibility')) {
                fn = BehaviorRegistry['toggle_elements'];
                if (fn) console.info(`Redirecting unknown behavior "${actionName}" → toggle_elements`);
            }
        }

        if (fn) {
            fn(this, params);
        } else {
            console.warn(`Behavior not found: ${actionName}`);
        }
    }

    /* ─── Element Access ─── */

    addElement(type, id, props) {
        const el = createElement(type, id, props);
        el.render(this.svgContent);
        this.elements.set(id, el);
        return el;
    }

    removeElement(id) {
        const el = this.elements.get(id);
        if (el) {
            el.remove();
            this.elements.delete(id);
        }
    }

    updateElement(id, props) {
        const el = this.elements.get(id);
        if (el) el.update(props);
    }

    getElement(id) {
        return this.elements.get(id) || null;
    }

    getElementsByTag(tag) {
        const result = [];
        this.elements.forEach(el => {
            if (el._tag === tag) result.push(el);
        });
        return result;
    }

    /* ─── State for Check System ─── */

    getState() {
        const state = { topic: this.descriptor.topic };
        const checkConfig = this.descriptor.checkConfig || {};
        const stateKeys = checkConfig.stateKeys || [];

        // Polynomial fitting
        if (stateKeys.includes('points') || stateKeys.includes('point_count')) {
            const pts = this.getElementsByTag('data-point');
            state.points = pts.map(el => ({ x: el.props.cx, y: el.props.cy }));
            state.point_count = pts.length;
        }
        if (stateKeys.includes('degree')) {
            const slider = this.getControl('degree');
            state.degree = slider ? slider.getValue() : 1;
        }

        // BST
        if (stateKeys.includes('tree_nodes') || stateKeys.includes('tree_structure')) {
            state.tree_nodes = this._bstGetNodes();
            state.tree_structure = this._bstGetStructure();
        }

        // Sorting
        if (stateKeys.includes('sort_array')) {
            state.sort_array = this._sortArray ? [...this._sortArray] : [];
        }

        // Stack
        if (stateKeys.includes('stack')) {
            state.stack = this._stack ? [...this._stack] : [];
            state.stack_size = (this._stack || []).length;
        }

        // Queue
        if (stateKeys.includes('queue')) {
            state.queue = this._queue ? [...this._queue] : [];
            state.queue_size = (this._queue || []).length;
        }

        // Linked list
        if (stateKeys.includes('linked_list')) {
            state.linked_list = this._linkedList ? [...this._linkedList] : [];
            state.list_size = (this._linkedList || []).length;
        }

        // Graph
        if (stateKeys.includes('graph_nodes') || stateKeys.includes('graph_edges')) {
            state.graph_nodes = (this._graphNodes || []).map(n => n.label);
            state.graph_edges = (this._graphEdges || []).length;
            state.graph_node_count = (this._graphNodes || []).length;
        }

        // Hash table
        if (stateKeys.includes('hash_table')) {
            state.hash_table = (this._hashTable || []).map(b => b.map(i => i.val));
            state.hash_size = this._hashSize;
        }

        // Neural network
        if (stateKeys.includes('nn_layers')) {
            state.nn_layers = this._nnLayers ? [...this._nnLayers] : [];
            state.nn_depth = (this._nnLayers || []).length;
        }

        // Gradient descent
        if (stateKeys.includes('gd_state')) {
            const gd = this._gdState;
            state.gd_x = gd ? gd.x.toFixed(4) : 'N/A';
            state.gd_step = gd ? gd.history.length - 1 : 0;
            state.gd_lr = gd ? gd.lr : 0;
        }

        // K-means
        if (stateKeys.includes('kmeans_state')) {
            const km = this._kmeansState;
            state.kmeans_step = km ? km.step : 0;
            state.kmeans_k = km ? km.k : 0;
        }

        // Control values
        this.controls.forEach((ctrl, id) => {
            state[`control_${id}`] = ctrl.getValue();
        });

        return state;
    }

    getCheckPrompt() {
        const checkConfig = this.descriptor.checkConfig || {};
        let prompt = checkConfig.prompt || 'Analyze the student\'s work.';
        const state = this.getState();

        // Replace template variables
        Object.entries(state).forEach(([key, value]) => {
            const placeholder = `{${key}}`;
            if (typeof value === 'object') {
                prompt = prompt.replace(placeholder, JSON.stringify(value));
            } else {
                prompt = prompt.replace(placeholder, String(value));
            }
        });

        return prompt;
    }

    /* ─── BST State Helpers ─── */

    _bstGetNodes() {
        const nodes = [];
        this._bstInOrder(this._bstRoot, nodes);
        return nodes;
    }

    _bstInOrder(node, result) {
        if (!node) return;
        this._bstInOrder(node.left, result);
        result.push(node.val);
        this._bstInOrder(node.right, result);
    }

    _bstGetStructure() {
        return this._bstSerialize(this._bstRoot);
    }

    _bstSerialize(node) {
        if (!node) return null;
        return { val: node.val, left: this._bstSerialize(node.left), right: this._bstSerialize(node.right) };
    }

    /* ─── Scene Summary (for challenge generation) ─── */

    getSceneSummary() {
        return {
            topic: this.descriptor.topic || this.descriptor.title || 'unknown topic',
            controls: (this.descriptor.controls || []).map(c => ({
                type: c.type, id: c.id, label: c.label,
                min: c.min, max: c.max, step: c.step,
                options: c.options, value: c.value
            })),
            elementIds: [...this.elements.keys()],
            checkConfig: this.descriptor.checkConfig || {}
        };
    }

    /* ─── Reset & Destroy ─── */

    onReset(cb) {
        if (!this._resetCallbacks) this._resetCallbacks = [];
        this._resetCallbacks.push(cb);
    }

    reset() {
        // Destroy current state
        if (this._animationEngine) {
            this._animationEngine.destroy();
            this._animationEngine = null;
        }
        this.elements.forEach(el => el.remove());
        this.controls.forEach(ctrl => ctrl.destroy());
        if (this.vizContainer) this.vizContainer.remove();
        this.vizContainer = null;
        this.canvasContainer = null;
        this.controlsContainer = null;
        this.svg = null;
        this.svgContent = null;
        this.elements = new Map();
        this.controls = new Map();

        // Reset internal data structures
        this._bstRoot = null;
        this._sortArray = null;
        this._graphNodes = null;
        this._graphEdges = null;
        this._stack = null;
        this._queue = null;
        this._linkedList = null;
        this._hashTable = null;
        this._nnLayers = null;
        this._gdState = null;
        this._kmeansState = null;
        this._formulaErrors = null;

        // Rebuild from original descriptor
        this._build();

        // Re-wire external callbacks (check/reset/feedback buttons)
        if (this._resetCallbacks) {
            this._resetCallbacks.forEach(cb => cb(this));
        }
    }

    destroy() {
        if (this._animationEngine) {
            this._animationEngine.destroy();
            this._animationEngine = null;
        }
        this.elements.forEach(el => el.remove());
        this.controls.forEach(ctrl => ctrl.destroy());
        if (this.vizContainer) this.vizContainer.remove();
    }
}
