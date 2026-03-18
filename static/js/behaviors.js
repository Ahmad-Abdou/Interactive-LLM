/**
 * Behavior Functions Registry
 * Reusable scene behaviors that the CanvasEngine triggers based on user interactions.
 * Each behavior function receives (engine, params) and modifies the scene.
 */

const BehaviorRegistry = {};

function registerBehavior(name, fn) {
    BehaviorRegistry[name] = fn;
}

/* ─── Polynomial Fitting Behaviors ─── */

// Add a data-point circle at click position
registerBehavior('add_circle', (engine, params, event) => {
    const counter = engine.getControl('points');
    const max = counter?.config?.max || 10;
    const count = engine.getElementsByTag('data-point').length;

    if (count >= max) return;

    const [mx, my] = d3.pointer(event, engine.svgContent.node());
    if (mx < 0 || my < 0 || mx > engine.innerWidth || my > engine.innerHeight) return;

    const id = `pt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const circle = createElement('circle', id, {
        cx: mx, cy: my,
        r: params.radius || 8,
        fill: params.color || '#4CAF50',
        stroke: '#fff', strokeWidth: 2,
        draggable: false
    });
    circle._tag = 'data-point';
    circle.render(engine.svgContent);
    circle.animateIn();

    // Click to remove
    if (params.removable) {
        circle.on('click', (ev) => {
            ev.stopPropagation();
            engine.removeElement(id);
            _afterPointChange(engine);
        });
    }

    engine.elements.set(id, circle);
    _afterPointChange(engine);
});

function _afterPointChange(engine) {
    const points = engine.getElementsByTag('data-point');
    const counter = engine.getControl('points');
    if (counter) counter.setCount(points.length);

    // Update slider max
    const slider = engine.getControl('degree');
    if (slider) {
        const maxDeg = Math.min(Math.max(1, points.length - 1), 6);
        slider.setMax(maxDeg);
        if (points.length < 2) {
            slider.setMessage('Place at least 2 points');
        } else if (maxDeg < 6) {
            slider.setMessage(`Add ${7 - points.length} more point(s) to unlock degree 6`);
        } else {
            slider.setMessage('');
        }
    }

    // Redraw fit line
    const degree = slider ? slider.getValue() : 1;
    if (points.length >= 2) {
        _drawFitLine(engine, points, degree);
    } else {
        engine.removeElement('fit-line');
    }
}

// Redraw polynomial fit line
registerBehavior('redraw_fit_line', (engine, params) => {
    const points = engine.getElementsByTag('data-point');
    const slider = engine.getControl('degree');
    const degree = slider ? slider.getValue() : 1;

    if (points.length >= 2) {
        _drawFitLine(engine, points, parseFloat(degree));
    }
});

function _drawFitLine(engine, pointElements, degree) {
    // Extract x,y from circle elements (raw SVG coords)
    const rawPoints = pointElements.map(el => ({ x: el.props.cx, y: el.props.cy }));
    degree = Math.min(degree, rawPoints.length - 1);

    const coefficients = _polynomialRegression(rawPoints, degree);
    if (!coefficients) return;

    // Generate path points
    const pathPts = [];
    for (let px = 0; px <= engine.innerWidth; px += 2) {
        let py = 0;
        for (let i = 0; i <= degree; i++) {
            py += coefficients[i] * Math.pow(px, i);
        }
        py = Math.max(0, Math.min(engine.innerHeight, py));
        pathPts.push({ x: px, y: py });
    }

    // Remove old line and draw new
    engine.removeElement('fit-line');
    const pathEl = createElement('path', 'fit-line', {
        points: pathPts,
        color: '#2196F3', thickness: 3,
        smooth: false, opacity: 0.8
    });
    pathEl._tag = 'fit-line';
    pathEl.render(engine.svgContent);
    pathEl.animateIn();
    engine.elements.set('fit-line', pathEl);
}

function _polynomialRegression(points, degree) {
    if (points.length < degree + 1) return null;
    const n = points.length;
    const X = [];
    const y = points.map(p => p.y);
    for (let i = 0; i < n; i++) {
        const row = [];
        for (let j = 0; j <= degree; j++) row.push(Math.pow(points[i].x, j));
        X.push(row);
    }
    return _gaussElim(X, y);
}

function _gaussElim(X, y) {
    const n = y.length;
    const k = X[0].length;
    const XtX = Array(k).fill(0).map(() => Array(k).fill(0));
    const Xty = Array(k).fill(0);
    for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
            for (let r = 0; r < n; r++) XtX[i][j] += X[r][i] * X[r][j];
        }
        for (let r = 0; r < n; r++) Xty[i] += X[r][i] * y[r];
    }
    // Gaussian elimination
    const Ab = XtX.map((row, i) => [...row, Xty[i]]);
    for (let i = 0; i < k; i++) {
        let maxR = i;
        for (let r = i + 1; r < k; r++) {
            if (Math.abs(Ab[r][i]) > Math.abs(Ab[maxR][i])) maxR = r;
        }
        [Ab[i], Ab[maxR]] = [Ab[maxR], Ab[i]];
        if (Math.abs(Ab[i][i]) < 1e-12) continue;
        for (let r = i + 1; r < k; r++) {
            const f = Ab[r][i] / Ab[i][i];
            for (let j = i; j <= k; j++) Ab[r][j] -= f * Ab[i][j];
        }
    }
    const x = Array(k).fill(0);
    for (let i = k - 1; i >= 0; i--) {
        x[i] = Ab[i][k];
        for (let j = i + 1; j < k; j++) x[i] -= Ab[i][j] * x[j];
        x[i] /= Ab[i][i] || 1;
    }
    return x;
}


/* ─── BST Behaviors ─── */

registerBehavior('bst_insert', (engine, params) => {
    const input = engine.getControl(params.valueFrom || 'node_value');
    if (!input) return;
    const val = parseInt(input.getValue());
    if (isNaN(val)) return;

    if (!engine._bstRoot) engine._bstRoot = null;
    engine._bstRoot = _bstInsertNode(engine._bstRoot, val);
    _bstRedraw(engine);
    input.clear();
});

registerBehavior('bst_delete', (engine, params) => {
    const input = engine.getControl(params.valueFrom || 'node_value');
    if (!input) return;
    const val = parseInt(input.getValue());
    if (isNaN(val)) return;

    if (engine._bstRoot) {
        engine._bstRoot = _bstDeleteNode(engine._bstRoot, val);
        _bstRedraw(engine);
    }
    input.clear();
});

registerBehavior('bst_search', (engine, params) => {
    const input = engine.getControl(params.valueFrom || 'node_value');
    if (!input) return;
    const val = parseInt(input.getValue());
    if (isNaN(val)) return;

    _bstHighlightSearch(engine, engine._bstRoot, val);
    input.clear();
});

// BST data structure helpers
function _bstInsertNode(node, val) {
    if (!node) return { val, left: null, right: null };
    if (val < node.val) node.left = _bstInsertNode(node.left, val);
    else if (val > node.val) node.right = _bstInsertNode(node.right, val);
    return node;
}

function _bstDeleteNode(node, val) {
    if (!node) return null;
    if (val < node.val) { node.left = _bstDeleteNode(node.left, val); return node; }
    if (val > node.val) { node.right = _bstDeleteNode(node.right, val); return node; }
    // Found
    if (!node.left) return node.right;
    if (!node.right) return node.left;
    let succ = node.right;
    while (succ.left) succ = succ.left;
    node.val = succ.val;
    node.right = _bstDeleteNode(node.right, succ.val);
    return node;
}

function _bstLayoutPositions(node, x, y, spread, positions = []) {
    if (!node) return positions;
    positions.push({ val: node.val, x, y, left: !!node.left, right: !!node.right });
    if (node.left) {
        positions.push({ type: 'edge', x1: x, y1: y, x2: x - spread, y2: y + 70 });
        _bstLayoutPositions(node.left, x - spread, y + 70, spread * 0.55, positions);
    }
    if (node.right) {
        positions.push({ type: 'edge', x1: x, y1: y, x2: x + spread, y2: y + 70 });
        _bstLayoutPositions(node.right, x + spread, y + 70, spread * 0.55, positions);
    }
    return positions;
}

function _bstRedraw(engine) {
    // Clear old BST elements
    engine.getElementsByTag('bst-node').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('bst-edge').forEach(el => engine.removeElement(el.id));

    if (!engine._bstRoot) return;

    const cx = engine.innerWidth / 2;
    const positions = _bstLayoutPositions(engine._bstRoot, cx, 40, engine.innerWidth * 0.22);

    // Draw edges first, then nodes on top
    positions.filter(p => p.type === 'edge').forEach((e, i) => {
        const id = `bst-edge-${i}-${Date.now()}`;
        const lineEl = createElement('line', id, {
            x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2,
            color: '#90A4AE', thickness: 2
        });
        lineEl._tag = 'bst-edge';
        lineEl.render(engine.svgContent);
        engine.elements.set(id, lineEl);
    });

    positions.filter(p => !p.type).forEach((p, i) => {
        const id = `bst-node-${p.val}-${Date.now()}`;
        const circle = createElement('circle', id, {
            cx: p.x, cy: p.y, r: 22,
            fill: '#667eea', stroke: '#4a5acf', strokeWidth: 2,
            label: String(p.val), labelColor: '#fff', labelSize: 14
        });
        circle._tag = 'bst-node';
        circle.render(engine.svgContent);
        circle.animateIn(250);
        engine.elements.set(id, circle);
    });

    // Update counter if present
    const counter = engine.getControl('node_count');
    if (counter) {
        const count = positions.filter(p => !p.type).length;
        counter.setCount(count);
    }
}

function _bstHighlightSearch(engine, node, val) {
    if (!node) return;

    // Reset all node colors
    engine.getElementsByTag('bst-node').forEach(el => {
        el.update({ fill: '#667eea', stroke: '#4a5acf' });
    });

    // Search path
    const path = [];
    let current = node;
    while (current) {
        path.push(current.val);
        if (val === current.val) break;
        current = val < current.val ? current.left : current.right;
    }

    // Animate search path
    let delay = 0;
    path.forEach((v, i) => {
        setTimeout(() => {
            const nodeEl = engine.getElementsByTag('bst-node').find(el => el.props.label === String(v));
            if (nodeEl) {
                const color = (v === val) ? '#4CAF50' : '#FFB74D';
                nodeEl.update({ fill: color, stroke: '#fff' });
            }
        }, delay);
        delay += 400;
    });

    // If not found, flash red on last
    if (!current || current.val !== val) {
        setTimeout(() => {
            const lastVal = path[path.length - 1];
            const nodeEl = engine.getElementsByTag('bst-node').find(el => el.props.label === String(lastVal));
            if (nodeEl) nodeEl.update({ fill: '#f5576c' });
        }, delay);
    }
}


/* ─── Sorting Behaviors ─── */

registerBehavior('sort_init', (engine, params) => {
    const values = params.values || [5, 3, 8, 1, 9, 2, 7, 4, 6];
    engine._sortArray = [...values];
    engine._sortStep = 0;
    _sortRedraw(engine);
});

registerBehavior('sort_step', (engine, params) => {
    if (!engine._sortArray) return;
    const arr = engine._sortArray;
    const algo = params.algorithm || 'bubble';

    if (algo === 'bubble') {
        // One pass of bubble sort
        let swapped = false;
        for (let i = 0; i < arr.length - 1 - engine._sortStep; i++) {
            if (arr[i] > arr[i + 1]) {
                [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                swapped = true;
                break; // One swap per step
            }
        }
        if (!swapped) engine._sortStep++;
        _sortRedraw(engine);
    }
});

registerBehavior('sort_reset', (engine, params) => {
    const values = params.values || [5, 3, 8, 1, 9, 2, 7, 4, 6];
    engine._sortArray = [...values];
    engine._sortStep = 0;
    _sortRedraw(engine);
});

function _sortRedraw(engine) {
    // Clear bars
    engine.getElementsByTag('sort-bar').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('sort-label').forEach(el => engine.removeElement(el.id));

    const arr = engine._sortArray || [];
    const maxVal = Math.max(...arr, 1);
    const barW = Math.min(50, (engine.innerWidth - 20) / arr.length - 4);
    const startX = (engine.innerWidth - (barW + 4) * arr.length) / 2;

    arr.forEach((v, i) => {
        const barH = (v / maxVal) * (engine.innerHeight - 60);
        const x = startX + i * (barW + 4);
        const y = engine.innerHeight - barH - 20;

        const barId = `sort-bar-${i}-${Date.now()}`;
        const bar = createElement('rect', barId, {
            x, y, width: barW, height: barH,
            fill: `hsl(${(v / maxVal) * 220}, 70%, 55%)`,
            stroke: '#fff', strokeWidth: 1,
            rx: 3, ry: 3
        });
        bar._tag = 'sort-bar';
        bar.render(engine.svgContent);
        engine.elements.set(barId, bar);

        const lblId = `sort-lbl-${i}-${Date.now()}`;
        const lbl = createElement('text', lblId, {
            x: x + barW / 2, y: engine.innerHeight - 5,
            text: String(v), fontSize: 12, color: '#333',
            anchor: 'middle'
        });
        lbl._tag = 'sort-label';
        lbl.render(engine.svgContent);
        engine.elements.set(lblId, lbl);
    });
}


/* ─── Generic Behaviors ─── */

registerBehavior('highlight_elements', (engine, params) => {
    const tag = params.tag;
    const color = params.color || '#FFD700';
    engine.getElementsByTag(tag).forEach(el => {
        if (el instanceof RectElement) el.highlight(color);
        else el.update({ fill: color });
    });
});

registerBehavior('reset_scene', (engine) => {
    // Clear all non-axis elements
    const toRemove = [];
    engine.elements.forEach((el, id) => { toRemove.push(id); });
    toRemove.forEach(id => engine.removeElement(id));

    // Reset all data structures
    engine._bstRoot = null;
    engine._sortArray = null;
    engine._graphNodes = null;
    engine._graphEdges = null;
    engine._stack = null;
    engine._queue = null;
    engine._linkedList = null;
    engine._hashTable = null;
    engine._nnLayers = null;
    engine._gdState = null;
    engine._kmeansState = null;

    // Reset controls
    engine.controls.forEach(ctrl => {
        if (ctrl instanceof PointCounterControl) ctrl.setCount(0);
        if (ctrl instanceof SliderControl) { ctrl.setValue(ctrl.config.min || 1); ctrl.setMax(1); }
    });
});


/* ═══════════════════════════════════════════════
   NEURAL NETWORK BEHAVIORS
   ═══════════════════════════════════════════════ */

registerBehavior('nn_init', (engine, params) => {
    engine._nnLayers = params.layers || [3, 4, 2];
    _nnRedraw(engine);
});

registerBehavior('nn_add_layer', (engine, params) => {
    if (!engine._nnLayers) engine._nnLayers = [3, 4, 2];
    const neurons = parseInt(params.neurons || 3);
    const input = engine.getControl(params.valueFrom || 'layer_neurons');
    const neuronsCount = input ? parseInt(input.getValue()) || 3 : neurons;
    // Insert before last layer (output)
    engine._nnLayers.splice(engine._nnLayers.length - 1, 0, neuronsCount);
    _nnRedraw(engine);
    if (input) input.clear();
});

registerBehavior('nn_remove_layer', (engine) => {
    if (!engine._nnLayers || engine._nnLayers.length <= 2) return;
    // Remove last hidden layer
    engine._nnLayers.splice(engine._nnLayers.length - 2, 1);
    _nnRedraw(engine);
});

registerBehavior('nn_forward_pass', (engine) => {
    if (!engine._nnLayers) return;
    _nnAnimateForwardPass(engine);
});

registerBehavior('nn_adjust_weights', (engine) => {
    // Randomly adjust connection colors to simulate weight changes
    engine.getElementsByTag('nn-connection').forEach(el => {
        const weight = (Math.random() - 0.5) * 2;
        const color = weight > 0
            ? `rgba(76, 175, 80, ${Math.abs(weight)})`
            : `rgba(244, 67, 54, ${Math.abs(weight)})`;
        const thickness = 1 + Math.abs(weight) * 3;
        el.update({ color, thickness });
    });
});

function _nnRedraw(engine) {
    engine.getElementsByTag('nn-node').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('nn-connection').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('nn-label').forEach(el => engine.removeElement(el.id));

    const layers = engine._nnLayers;
    if (!layers || layers.length === 0) return;

    const layerGap = engine.innerWidth / (layers.length + 1);
    const maxNeurons = Math.max(...layers);

    // Draw connections first
    for (let l = 0; l < layers.length - 1; l++) {
        const x1 = layerGap * (l + 1);
        const x2 = layerGap * (l + 2);
        for (let i = 0; i < layers[l]; i++) {
            const y1 = _nnNeuronY(engine, layers[l], i);
            for (let j = 0; j < layers[l + 1]; j++) {
                const y2 = _nnNeuronY(engine, layers[l + 1], j);
                const id = `nn-conn-${l}-${i}-${j}-${Date.now()}`;
                const weight = (Math.random() - 0.5) * 2;
                const conn = createElement('line', id, {
                    x1, y1, x2, y2,
                    color: `rgba(150, 150, 150, 0.4)`,
                    thickness: 1
                });
                conn._tag = 'nn-connection';
                conn.render(engine.svgContent);
                engine.elements.set(id, conn);
            }
        }
    }

    // Draw neurons
    const layerColors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#FF5722'];
    const layerNames = ['Input', ...Array(layers.length - 2).fill(0).map((_, i) => `Hidden ${i + 1}`), 'Output'];

    layers.forEach((count, l) => {
        const x = layerGap * (l + 1);
        const color = layerColors[l % layerColors.length];

        for (let i = 0; i < count; i++) {
            const y = _nnNeuronY(engine, count, i);
            const id = `nn-node-${l}-${i}-${Date.now()}`;
            const node = createElement('circle', id, {
                cx: x, cy: y, r: 16,
                fill: color, stroke: '#fff', strokeWidth: 2,
                label: '', labelColor: '#fff', labelSize: 10
            });
            node._tag = 'nn-node';
            node._layerIdx = l;
            node.render(engine.svgContent);
            node.animateIn(200);
            engine.elements.set(id, node);
        }

        // Layer label
        const lblId = `nn-lbl-${l}-${Date.now()}`;
        const lbl = createElement('text', lblId, {
            x, y: engine.innerHeight - 5,
            text: layerNames[l] || `Layer ${l}`,
            fontSize: 11, color: '#666', anchor: 'middle'
        });
        lbl._tag = 'nn-label';
        lbl.render(engine.svgContent);
        engine.elements.set(lblId, lbl);
    });

    // Update counter
    const counter = engine.getControl('layer_count');
    if (counter) counter.setCount(layers.length);
}

function _nnNeuronY(engine, layerSize, index) {
    const totalH = engine.innerHeight - 40;
    const gap = Math.min(50, totalH / (layerSize + 1));
    const startY = (totalH - gap * (layerSize - 1)) / 2;
    return startY + index * gap;
}

function _nnAnimateForwardPass(engine) {
    const layers = engine._nnLayers;
    if (!layers) return;

    // Reset all nodes
    engine.getElementsByTag('nn-node').forEach(el => {
        const color = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4'][el._layerIdx % 6];
        el.update({ fill: color });
    });

    // Animate layer by layer
    let delay = 0;
    for (let l = 0; l < layers.length; l++) {
        setTimeout(() => {
            engine.getElementsByTag('nn-node')
                .filter(el => el._layerIdx === l)
                .forEach(el => {
                    el.update({ fill: '#FFD700', stroke: '#FFA000' });
                    setTimeout(() => {
                        const color = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4'][l % 6];
                        el.update({ fill: color, stroke: '#fff' });
                    }, 600);
                });
        }, delay);
        delay += 500;
    }
}


/* ═══════════════════════════════════════════════
   GRAPH BEHAVIORS
   ═══════════════════════════════════════════════ */

registerBehavior('graph_init', (engine, params) => {
    engine._graphNodes = [];
    engine._graphEdges = [];
    engine._graphNextId = 0;
    if (params.nodes) {
        params.nodes.forEach(n => {
            engine._graphNodes.push({ id: engine._graphNextId++, label: String(n.label || n), x: n.x || 0, y: n.y || 0 });
        });
    }
    if (params.edges) {
        params.edges.forEach(e => engine._graphEdges.push(e));
    }
    _graphRedraw(engine);
});

registerBehavior('graph_add_node', (engine, params) => {
    if (!engine._graphNodes) { engine._graphNodes = []; engine._graphEdges = []; engine._graphNextId = 0; }
    const input = engine.getControl(params.valueFrom || 'node_label');
    const label = input ? (input.getValue() || String(engine._graphNextId)) : String(engine._graphNextId);

    // Place in a circle layout
    const n = engine._graphNodes.length;
    const angle = (n / Math.max(n + 1, 6)) * 2 * Math.PI - Math.PI / 2;
    const cx = engine.innerWidth / 2 + Math.cos(angle) * Math.min(engine.innerWidth, engine.innerHeight) * 0.3;
    const cy = engine.innerHeight / 2 + Math.sin(angle) * Math.min(engine.innerWidth, engine.innerHeight) * 0.3;

    engine._graphNodes.push({ id: engine._graphNextId++, label, x: cx, y: cy });
    _graphRedraw(engine);
    if (input) input.clear();
});

registerBehavior('graph_add_edge', (engine, params) => {
    if (!engine._graphNodes || engine._graphNodes.length < 2) return;
    const fromInput = engine.getControl(params.fromControl || 'edge_from');
    const toInput = engine.getControl(params.toControl || 'edge_to');
    if (!fromInput || !toInput) return;

    const from = fromInput.getValue();
    const to = toInput.getValue();
    if (from === '' || to === '' || from === to) return;

    const fromNode = engine._graphNodes.find(n => String(n.label) === String(from) || String(n.id) === String(from));
    const toNode = engine._graphNodes.find(n => String(n.label) === String(to) || String(n.id) === String(to));
    if (!fromNode || !toNode) return;

    engine._graphEdges.push({ from: fromNode.id, to: toNode.id });
    _graphRedraw(engine);
    fromInput.clear();
    toInput.clear();
});

registerBehavior('graph_bfs', (engine, params) => {
    const input = engine.getControl(params.valueFrom || 'start_node');
    const startLabel = input ? input.getValue() : '0';
    _graphTraverse(engine, startLabel, 'bfs');
    if (input) input.clear();
});

registerBehavior('graph_dfs', (engine, params) => {
    const input = engine.getControl(params.valueFrom || 'start_node');
    const startLabel = input ? input.getValue() : '0';
    _graphTraverse(engine, startLabel, 'dfs');
    if (input) input.clear();
});

function _graphRedraw(engine) {
    engine.getElementsByTag('graph-node').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('graph-edge').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('graph-label').forEach(el => engine.removeElement(el.id));

    const nodes = engine._graphNodes || [];
    const edges = engine._graphEdges || [];

    // Draw edges
    edges.forEach((e, i) => {
        const from = nodes.find(n => n.id === e.from);
        const to = nodes.find(n => n.id === e.to);
        if (!from || !to) return;
        const id = `graph-edge-${i}-${Date.now()}`;
        const line = createElement('line', id, {
            x1: from.x, y1: from.y, x2: to.x, y2: to.y,
            color: '#90A4AE', thickness: 2
        });
        line._tag = 'graph-edge';
        line.render(engine.svgContent);
        engine.elements.set(id, line);
    });

    // Draw nodes
    nodes.forEach((n, i) => {
        const id = `graph-node-${n.id}-${Date.now()}`;
        const node = createElement('circle', id, {
            cx: n.x, cy: n.y, r: 24,
            fill: '#667eea', stroke: '#4a5acf', strokeWidth: 2,
            label: String(n.label), labelColor: '#fff', labelSize: 14,
            draggable: true
        });
        node._tag = 'graph-node';
        node._graphId = n.id;
        node.on('drag', (data) => {
            n.x = data.x;
            n.y = data.y;
            _graphRedraw(engine);
        });
        node.render(engine.svgContent);
        node.animateIn(200);
        engine.elements.set(id, node);
    });
}

function _graphTraverse(engine, startLabel, algorithm) {
    const nodes = engine._graphNodes || [];
    const edges = engine._graphEdges || [];
    const startNode = nodes.find(n => String(n.label) === String(startLabel) || String(n.id) === String(startLabel));
    if (!startNode) return;

    // Build adjacency list
    const adj = {};
    nodes.forEach(n => { adj[n.id] = []; });
    edges.forEach(e => {
        adj[e.from] = adj[e.from] || [];
        adj[e.to] = adj[e.to] || [];
        adj[e.from].push(e.to);
        adj[e.to].push(e.from);
    });

    // Reset colors
    engine.getElementsByTag('graph-node').forEach(el => el.update({ fill: '#667eea', stroke: '#4a5acf' }));

    const visited = new Set();
    const order = [];

    if (algorithm === 'bfs') {
        const queue = [startNode.id];
        visited.add(startNode.id);
        while (queue.length > 0) {
            const curr = queue.shift();
            order.push(curr);
            (adj[curr] || []).forEach(neighbor => {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            });
        }
    } else {
        // DFS
        const dfs = (nodeId) => {
            visited.add(nodeId);
            order.push(nodeId);
            (adj[nodeId] || []).forEach(neighbor => {
                if (!visited.has(neighbor)) dfs(neighbor);
            });
        };
        dfs(startNode.id);
    }

    // Animate traversal
    order.forEach((nodeId, i) => {
        setTimeout(() => {
            const el = engine.getElementsByTag('graph-node').find(e => e._graphId === nodeId);
            if (el) {
                el.update({ fill: '#4CAF50', stroke: '#2E7D32' });
            }
        }, i * 500);
    });
}


/* ═══════════════════════════════════════════════
   STACK BEHAVIORS
   ═══════════════════════════════════════════════ */

registerBehavior('stack_init', (engine, params) => {
    engine._stack = params.values ? [...params.values] : [];
    _stackRedraw(engine);
});

registerBehavior('stack_push', (engine, params) => {
    if (!engine._stack) engine._stack = [];
    const input = engine.getControl(params.valueFrom || 'stack_value');
    const val = input ? input.getValue() : params.value || '?';
    if (val === '' || val === undefined) return;
    if (engine._stack.length >= 10) return;
    engine._stack.push(val);
    _stackRedraw(engine);
    if (input) input.clear();
});

registerBehavior('stack_pop', (engine) => {
    if (!engine._stack || engine._stack.length === 0) return;
    engine._stack.pop();
    _stackRedraw(engine);
});

function _stackRedraw(engine) {
    engine.getElementsByTag('stack-cell').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('stack-label').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('stack-pointer').forEach(el => engine.removeElement(el.id));

    const stack = engine._stack || [];
    const cellW = 80;
    const cellH = 40;
    const startX = engine.innerWidth / 2 - cellW / 2;
    const bottomY = engine.innerHeight - 40;

    // Draw "bottom" label
    const bottomId = `stack-lbl-bottom-${Date.now()}`;
    const bottom = createElement('text', bottomId, {
        x: engine.innerWidth / 2, y: bottomY + 20,
        text: '── Bottom ──', fontSize: 12, color: '#999', anchor: 'middle'
    });
    bottom._tag = 'stack-label';
    bottom.render(engine.svgContent);
    engine.elements.set(bottomId, bottom);

    stack.forEach((val, i) => {
        const y = bottomY - (i + 1) * cellH;
        const hue = (i / Math.max(stack.length, 1)) * 200 + 120;
        const cellId = `stack-cell-${i}-${Date.now()}`;
        const cell = createElement('rect', cellId, {
            x: startX, y, width: cellW, height: cellH - 2,
            fill: `hsl(${hue}, 60%, 55%)`, stroke: '#fff', strokeWidth: 2,
            rx: 4, ry: 4, label: String(val), labelColor: '#fff', labelSize: 16
        });
        cell._tag = 'stack-cell';
        cell.render(engine.svgContent);
        engine.elements.set(cellId, cell);
    });

    // Top pointer
    if (stack.length > 0) {
        const topY = bottomY - stack.length * cellH;
        const ptrId = `stack-ptr-${Date.now()}`;
        const ptr = createElement('text', ptrId, {
            x: startX + cellW + 15, y: topY + cellH / 2,
            text: '← TOP', fontSize: 13, color: '#f5576c', fontWeight: 'bold', anchor: 'start'
        });
        ptr._tag = 'stack-pointer';
        ptr.render(engine.svgContent);
        engine.elements.set(ptrId, ptr);
    }

    const counter = engine.getControl('stack_count');
    if (counter) counter.setCount(stack.length);
}


/* ═══════════════════════════════════════════════
   QUEUE BEHAVIORS
   ═══════════════════════════════════════════════ */

registerBehavior('queue_init', (engine, params) => {
    engine._queue = params.values ? [...params.values] : [];
    _queueRedraw(engine);
});

registerBehavior('queue_enqueue', (engine, params) => {
    if (!engine._queue) engine._queue = [];
    const input = engine.getControl(params.valueFrom || 'queue_value');
    const val = input ? input.getValue() : params.value || '?';
    if (val === '' || val === undefined) return;
    if (engine._queue.length >= 10) return;
    engine._queue.push(val);
    _queueRedraw(engine);
    if (input) input.clear();
});

registerBehavior('queue_dequeue', (engine) => {
    if (!engine._queue || engine._queue.length === 0) return;
    engine._queue.shift();
    _queueRedraw(engine);
});

function _queueRedraw(engine) {
    engine.getElementsByTag('queue-cell').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('queue-label').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('queue-pointer').forEach(el => engine.removeElement(el.id));

    const queue = engine._queue || [];
    const cellW = 55;
    const cellH = 50;
    const totalW = queue.length * (cellW + 4);
    const startX = (engine.innerWidth - totalW) / 2;
    const y = engine.innerHeight / 2 - cellH / 2;

    queue.forEach((val, i) => {
        const x = startX + i * (cellW + 4);
        const hue = (i / Math.max(queue.length, 1)) * 180 + 180;
        const cellId = `queue-cell-${i}-${Date.now()}`;
        const cell = createElement('rect', cellId, {
            x, y, width: cellW, height: cellH,
            fill: `hsl(${hue}, 60%, 55%)`, stroke: '#fff', strokeWidth: 2,
            rx: 4, ry: 4, label: String(val), labelColor: '#fff', labelSize: 16
        });
        cell._tag = 'queue-cell';
        cell.render(engine.svgContent);
        engine.elements.set(cellId, cell);
    });

    if (queue.length > 0) {
        // Front pointer
        const frontId = `queue-ptr-front-${Date.now()}`;
        const front = createElement('text', frontId, {
            x: startX + cellW / 2, y: y + cellH + 25,
            text: '↑ FRONT', fontSize: 12, color: '#4CAF50', fontWeight: 'bold', anchor: 'middle'
        });
        front._tag = 'queue-pointer';
        front.render(engine.svgContent);
        engine.elements.set(frontId, front);

        // Rear pointer
        const rearX = startX + (queue.length - 1) * (cellW + 4) + cellW / 2;
        const rearId = `queue-ptr-rear-${Date.now()}`;
        const rear = createElement('text', rearId, {
            x: rearX, y: y - 10,
            text: '↓ REAR', fontSize: 12, color: '#f5576c', fontWeight: 'bold', anchor: 'middle'
        });
        rear._tag = 'queue-pointer';
        rear.render(engine.svgContent);
        engine.elements.set(rearId, rear);
    }

    const counter = engine.getControl('queue_count');
    if (counter) counter.setCount(queue.length);
}


/* ═══════════════════════════════════════════════
   LINKED LIST BEHAVIORS
   ═══════════════════════════════════════════════ */

registerBehavior('ll_init', (engine, params) => {
    engine._linkedList = params.values ? [...params.values] : [];
    _llRedraw(engine);
});

registerBehavior('ll_insert', (engine, params) => {
    if (!engine._linkedList) engine._linkedList = [];
    const input = engine.getControl(params.valueFrom || 'll_value');
    const val = input ? input.getValue() : params.value || '?';
    if (val === '' || val === undefined) return;
    if (engine._linkedList.length >= 8) return;
    engine._linkedList.push(val);
    _llRedraw(engine);
    if (input) input.clear();
});

registerBehavior('ll_insert_front', (engine, params) => {
    if (!engine._linkedList) engine._linkedList = [];
    const input = engine.getControl(params.valueFrom || 'll_value');
    const val = input ? input.getValue() : params.value || '?';
    if (val === '' || val === undefined) return;
    if (engine._linkedList.length >= 8) return;
    engine._linkedList.unshift(val);
    _llRedraw(engine);
    if (input) input.clear();
});

registerBehavior('ll_delete', (engine, params) => {
    if (!engine._linkedList || engine._linkedList.length === 0) return;
    const input = engine.getControl(params.valueFrom || 'll_value');
    const val = input ? input.getValue() : null;
    if (val !== null && val !== '') {
        const idx = engine._linkedList.indexOf(val);
        if (idx >= 0) engine._linkedList.splice(idx, 1);
    } else {
        engine._linkedList.pop();
    }
    _llRedraw(engine);
    if (input) input.clear();
});

function _llRedraw(engine) {
    engine.getElementsByTag('ll-node').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('ll-arrow').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('ll-label').forEach(el => engine.removeElement(el.id));

    const list = engine._linkedList || [];
    const nodeW = 60;
    const gapW = 40;
    const totalW = list.length * nodeW + (list.length - 1) * gapW;
    const startX = Math.max(20, (engine.innerWidth - totalW) / 2);
    const y = engine.innerHeight / 2 - 20;

    // Head label
    if (list.length > 0) {
        const headId = `ll-head-${Date.now()}`;
        const head = createElement('text', headId, {
            x: startX + nodeW / 2, y: y - 25,
            text: 'HEAD', fontSize: 12, color: '#4CAF50', fontWeight: 'bold', anchor: 'middle'
        });
        head._tag = 'll-label';
        head.render(engine.svgContent);
        engine.elements.set(headId, head);
    }

    list.forEach((val, i) => {
        const x = startX + i * (nodeW + gapW);

        // Node box (data + next pointer)
        const nodeId = `ll-node-${i}-${Date.now()}`;
        const node = createElement('rect', nodeId, {
            x, y, width: nodeW, height: 40,
            fill: '#667eea', stroke: '#4a5acf', strokeWidth: 2,
            rx: 6, ry: 6, label: String(val), labelColor: '#fff', labelSize: 16
        });
        node._tag = 'll-node';
        node.render(engine.svgContent);
        engine.elements.set(nodeId, node);

        // Arrow to next
        if (i < list.length - 1) {
            const arrowId = `ll-arrow-${i}-${Date.now()}`;
            const arrow = createElement('arrow', arrowId, {
                x1: x + nodeW, y1: y + 20,
                x2: x + nodeW + gapW, y2: y + 20,
                color: '#90A4AE', thickness: 2, headSize: 8
            });
            arrow._tag = 'll-arrow';
            arrow.render(engine.svgContent);
            engine.elements.set(arrowId, arrow);
        }
    });

    // NULL at end
    if (list.length > 0) {
        const nullX = startX + list.length * (nodeW + gapW) - gapW + nodeW + 10;
        const nullId = `ll-null-${Date.now()}`;
        const nullEl = createElement('text', nullId, {
            x: nullX, y: y + 24,
            text: 'NULL', fontSize: 13, color: '#999', fontWeight: 'bold', anchor: 'start'
        });
        nullEl._tag = 'll-label';
        nullEl.render(engine.svgContent);
        engine.elements.set(nullId, nullEl);
    }

    const counter = engine.getControl('ll_count');
    if (counter) counter.setCount(list.length);
}


/* ═══════════════════════════════════════════════
   HASH TABLE BEHAVIORS
   ═══════════════════════════════════════════════ */

registerBehavior('hash_init', (engine, params) => {
    const size = params.size || 7;
    engine._hashTable = Array(size).fill(null).map(() => []);
    engine._hashSize = size;
    _hashRedraw(engine);
});

registerBehavior('hash_insert', (engine, params) => {
    if (!engine._hashTable) { engine._hashTable = Array(7).fill(null).map(() => []); engine._hashSize = 7; }
    const input = engine.getControl(params.valueFrom || 'hash_value');
    const val = input ? input.getValue() : params.value;
    if (val === '' || val === undefined) return;

    const key = typeof val === 'number' ? val : parseInt(val) || val.toString().charCodeAt(0);
    const bucket = key % engine._hashSize;
    engine._hashTable[bucket].push({ key, val: String(val) });
    _hashRedraw(engine, bucket);
    if (input) input.clear();
});

registerBehavior('hash_lookup', (engine, params) => {
    if (!engine._hashTable) return;
    const input = engine.getControl(params.valueFrom || 'hash_value');
    const val = input ? input.getValue() : params.value;
    if (val === '' || val === undefined) return;

    const key = typeof val === 'number' ? val : parseInt(val) || val.toString().charCodeAt(0);
    const bucket = key % engine._hashSize;

    // Highlight the bucket
    engine.getElementsByTag('hash-bucket').forEach(el => el.update({ fill: '#E3F2FD', stroke: '#90CAF9' }));
    const targetEl = engine.getElementsByTag('hash-bucket').find(el => el._bucketIdx === bucket);
    if (targetEl) targetEl.update({ fill: '#C8E6C9', stroke: '#4CAF50' });

    // Highlight found items
    engine.getElementsByTag('hash-item').forEach(el => {
        if (el._bucketIdx === bucket && el.props.label === String(val)) {
            el.update({ fill: '#4CAF50' });
        }
    });
    if (input) input.clear();
});

function _hashRedraw(engine, highlightBucket = -1) {
    engine.getElementsByTag('hash-bucket').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('hash-item').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('hash-label').forEach(el => engine.removeElement(el.id));

    const table = engine._hashTable || [];
    const bucketW = 80;
    const bucketH = 40;
    const totalW = table.length * (bucketW + 10);
    const startX = (engine.innerWidth - totalW) / 2;
    const bucketY = engine.innerHeight / 2 - 20;

    table.forEach((bucket, i) => {
        const x = startX + i * (bucketW + 10);
        const isHighlighted = i === highlightBucket;

        // Bucket box
        const bId = `hash-bucket-${i}-${Date.now()}`;
        const bEl = createElement('rect', bId, {
            x, y: bucketY, width: bucketW, height: bucketH,
            fill: isHighlighted ? '#C8E6C9' : '#E3F2FD',
            stroke: isHighlighted ? '#4CAF50' : '#90CAF9',
            strokeWidth: 2, rx: 4, ry: 4,
            label: `[${i}]`, labelColor: '#333', labelSize: 14
        });
        bEl._tag = 'hash-bucket';
        bEl._bucketIdx = i;
        bEl.render(engine.svgContent);
        engine.elements.set(bId, bEl);

        // Items in bucket (chaining)
        bucket.forEach((item, j) => {
            const itemId = `hash-item-${i}-${j}-${Date.now()}`;
            const itemEl = createElement('rect', itemId, {
                x, y: bucketY + bucketH + 8 + j * 32,
                width: bucketW, height: 28,
                fill: '#667eea', stroke: '#4a5acf', strokeWidth: 1,
                rx: 4, ry: 4, label: item.val, labelColor: '#fff', labelSize: 12
            });
            itemEl._tag = 'hash-item';
            itemEl._bucketIdx = i;
            itemEl.render(engine.svgContent);
            engine.elements.set(itemId, itemEl);
        });
    });

    // Title
    const titleId = `hash-title-${Date.now()}`;
    const title = createElement('text', titleId, {
        x: engine.innerWidth / 2, y: bucketY - 20,
        text: `Hash Table (size ${table.length})`, fontSize: 14, color: '#333', fontWeight: 'bold', anchor: 'middle'
    });
    title._tag = 'hash-label';
    title.render(engine.svgContent);
    engine.elements.set(titleId, title);
}


/* ═══════════════════════════════════════════════
   GRADIENT DESCENT BEHAVIORS
   ═══════════════════════════════════════════════ */

registerBehavior('gd_init', (engine, params) => {
    // Simple 1D gradient descent on f(x) = x^2 + noise
    const startX = params.startX || 4;
    engine._gdState = {
        x: startX,
        lr: params.lr || 0.1,
        history: [startX],
        func: (x) => x * x  // f(x) = x^2
    };
    _gdRedraw(engine);
});

registerBehavior('gradient_descent_step', (engine) => {
    if (!engine._gdState) return;
    const s = engine._gdState;
    // Gradient of x^2 is 2x
    const grad = 2 * s.x;
    s.x = s.x - s.lr * grad;
    s.history.push(s.x);
    _gdRedraw(engine);
});

registerBehavior('gd_adjust_lr', (engine, params) => {
    if (!engine._gdState) return;
    engine._gdState.lr = parseFloat(params.value) || 0.1;
});

registerBehavior('gd_reset', (engine, params) => {
    const startX = params.startX || 4;
    engine._gdState = {
        x: startX,
        lr: engine._gdState?.lr || 0.1,
        history: [startX],
        func: (x) => x * x
    };
    _gdRedraw(engine);
});

function _gdRedraw(engine) {
    engine.getElementsByTag('gd-curve').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('gd-point').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('gd-path').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('gd-label').forEach(el => engine.removeElement(el.id));

    const s = engine._gdState;
    if (!s) return;

    const w = engine.innerWidth;
    const h = engine.innerHeight;
    const xRange = [-5, 5];
    const yMax = 25;

    const toSvgX = (x) => ((x - xRange[0]) / (xRange[1] - xRange[0])) * w;
    const toSvgY = (y) => h - 30 - (y / yMax) * (h - 60);

    // Draw curve f(x) = x^2
    const curvePts = [];
    for (let x = xRange[0]; x <= xRange[1]; x += 0.1) {
        curvePts.push({ x: toSvgX(x), y: toSvgY(s.func(x)) });
    }
    const curveId = `gd-curve-${Date.now()}`;
    const curve = createElement('path', curveId, {
        points: curvePts, color: '#2196F3', thickness: 3, smooth: true, fill: 'none'
    });
    curve._tag = 'gd-curve';
    curve.render(engine.svgContent);
    engine.elements.set(curveId, curve);

    // Draw history path
    if (s.history.length > 1) {
        const pathPts = s.history.map(x => ({ x: toSvgX(x), y: toSvgY(s.func(x)) }));
        const pathId = `gd-path-${Date.now()}`;
        const path = createElement('path', pathId, {
            points: pathPts, color: '#FF9800', thickness: 2, smooth: false, dashed: true, fill: 'none'
        });
        path._tag = 'gd-path';
        path.render(engine.svgContent);
        engine.elements.set(pathId, path);
    }

    // Draw current point
    const ptId = `gd-point-${Date.now()}`;
    const pt = createElement('circle', ptId, {
        cx: toSvgX(s.x), cy: toSvgY(s.func(s.x)), r: 10,
        fill: '#f5576c', stroke: '#fff', strokeWidth: 2,
        label: s.x.toFixed(2), labelColor: '#333', labelSize: 10
    });
    pt._tag = 'gd-point';
    pt.render(engine.svgContent);
    pt.animateIn(200);
    engine.elements.set(ptId, pt);

    // Info label
    const lblId = `gd-info-${Date.now()}`;
    const lbl = createElement('text', lblId, {
        x: 10, y: 20,
        text: `Step ${s.history.length - 1} | x = ${s.x.toFixed(3)} | f(x) = ${s.func(s.x).toFixed(3)} | lr = ${s.lr}`,
        fontSize: 13, color: '#333', fontWeight: 'bold'
    });
    lbl._tag = 'gd-label';
    lbl.render(engine.svgContent);
    engine.elements.set(lblId, lbl);
}


/* ═══════════════════════════════════════════════
   K-MEANS CLUSTERING BEHAVIORS
   ═══════════════════════════════════════════════ */

registerBehavior('kmeans_init', (engine, params) => {
    // Generate random data points
    const k = params.k || 3;
    const n = params.numPoints || 30;
    const points = [];
    const clusterColors = ['#f5576c', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0'];

    // Generate clusters with some spread
    for (let c = 0; c < k; c++) {
        const cx = 80 + Math.random() * (engine.innerWidth - 160);
        const cy = 60 + Math.random() * (engine.innerHeight - 120);
        for (let i = 0; i < Math.floor(n / k); i++) {
            points.push({
                x: cx + (Math.random() - 0.5) * 120,
                y: cy + (Math.random() - 0.5) * 120,
                cluster: -1
            });
        }
    }

    // Random initial centroids
    const centroids = [];
    for (let i = 0; i < k; i++) {
        centroids.push({
            x: 80 + Math.random() * (engine.innerWidth - 160),
            y: 60 + Math.random() * (engine.innerHeight - 120)
        });
    }

    engine._kmeansState = { points, centroids, k, colors: clusterColors, step: 0 };
    _kmeansRedraw(engine);
});

registerBehavior('kmeans_step', (engine) => {
    const s = engine._kmeansState;
    if (!s) return;

    // Assignment step — assign each point to nearest centroid
    s.points.forEach(p => {
        let minDist = Infinity;
        s.centroids.forEach((c, i) => {
            const d = Math.sqrt((p.x - c.x) ** 2 + (p.y - c.y) ** 2);
            if (d < minDist) { minDist = d; p.cluster = i; }
        });
    });

    // Update step — move centroids to mean of assigned points
    s.centroids.forEach((c, i) => {
        const assigned = s.points.filter(p => p.cluster === i);
        if (assigned.length > 0) {
            c.x = assigned.reduce((sum, p) => sum + p.x, 0) / assigned.length;
            c.y = assigned.reduce((sum, p) => sum + p.y, 0) / assigned.length;
        }
    });

    s.step++;
    _kmeansRedraw(engine);
});

registerBehavior('kmeans_reset', (engine, params) => {
    registerBehavior._tempInit = BehaviorRegistry['kmeans_init'];
    BehaviorRegistry['kmeans_init'](engine, params || { k: 3, numPoints: 30 });
});

function _kmeansRedraw(engine) {
    engine.getElementsByTag('km-point').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('km-centroid').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('km-label').forEach(el => engine.removeElement(el.id));

    const s = engine._kmeansState;
    if (!s) return;

    // Draw points
    s.points.forEach((p, i) => {
        const color = p.cluster >= 0 ? s.colors[p.cluster % s.colors.length] : '#ccc';
        const id = `km-pt-${i}-${Date.now()}`;
        const pt = createElement('circle', id, {
            cx: p.x, cy: p.y, r: 5,
            fill: color, stroke: 'rgba(255,255,255,0.6)', strokeWidth: 1
        });
        pt._tag = 'km-point';
        pt.render(engine.svgContent);
        engine.elements.set(id, pt);
    });

    // Draw centroids
    s.centroids.forEach((c, i) => {
        const color = s.colors[i % s.colors.length];
        const id = `km-centroid-${i}-${Date.now()}`;
        const centroid = createElement('circle', id, {
            cx: c.x, cy: c.y, r: 14,
            fill: color, stroke: '#fff', strokeWidth: 3,
            label: `C${i + 1}`, labelColor: '#fff', labelSize: 10
        });
        centroid._tag = 'km-centroid';
        centroid.render(engine.svgContent);
        centroid.animateIn(200);
        engine.elements.set(id, centroid);
    });

    // Step counter label
    const lblId = `km-step-${Date.now()}`;
    const lbl = createElement('text', lblId, {
        x: 10, y: 20,
        text: `K-Means Step ${s.step} | K = ${s.k} | Points = ${s.points.length}`,
        fontSize: 13, color: '#333', fontWeight: 'bold'
    });
    lbl._tag = 'km-label';
    lbl.render(engine.svgContent);
    engine.elements.set(lblId, lbl);
}


/* ═══════════════════════════════════════════════
   ACTIVATION FUNCTION BEHAVIORS
   ═══════════════════════════════════════════════ */

registerBehavior('activation_init', (engine, params) => {
    engine._activationFunc = params.func || 'sigmoid';
    _activationRedraw(engine);
});

registerBehavior('activation_change', (engine, params) => {
    engine._activationFunc = params.value || 'sigmoid';
    _activationRedraw(engine);
});

function _activationRedraw(engine) {
    engine.getElementsByTag('act-curve').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('act-label').forEach(el => engine.removeElement(el.id));
    engine.getElementsByTag('act-axis').forEach(el => engine.removeElement(el.id));

    const funcName = engine._activationFunc || 'sigmoid';
    const w = engine.innerWidth;
    const h = engine.innerHeight;

    const funcs = {
        sigmoid: { fn: x => 1 / (1 + Math.exp(-x)), range: [-6, 6], yRange: [-0.2, 1.2], color: '#2196F3', label: 'σ(x) = 1 / (1 + e⁻ˣ)' },
        relu: { fn: x => Math.max(0, x), range: [-4, 4], yRange: [-1, 5], color: '#4CAF50', label: 'ReLU(x) = max(0, x)' },
        tanh: { fn: x => Math.tanh(x), range: [-4, 4], yRange: [-1.3, 1.3], color: '#FF9800', label: 'tanh(x)' },
        leaky_relu: { fn: x => x > 0 ? x : 0.1 * x, range: [-4, 4], yRange: [-1, 5], color: '#9C27B0', label: 'LeakyReLU(x) = max(0.1x, x)' },
        softplus: { fn: x => Math.log(1 + Math.exp(x)), range: [-4, 4], yRange: [-0.5, 5], color: '#E91E63', label: 'Softplus(x) = ln(1 + eˣ)' }
    };

    const f = funcs[funcName] || funcs.sigmoid;

    const toSvgX = (x) => ((x - f.range[0]) / (f.range[1] - f.range[0])) * (w - 60) + 30;
    const toSvgY = (y) => h - 40 - ((y - f.yRange[0]) / (f.yRange[1] - f.yRange[0])) * (h - 80);

    // Draw axes
    const xAxisId = `act-xaxis-${Date.now()}`;
    const xAxis = createElement('line', xAxisId, {
        x1: 20, y1: toSvgY(0), x2: w - 20, y2: toSvgY(0),
        color: '#ccc', thickness: 1
    });
    xAxis._tag = 'act-axis';
    xAxis.render(engine.svgContent);
    engine.elements.set(xAxisId, xAxis);

    const yAxisId = `act-yaxis-${Date.now()}`;
    const yAxis = createElement('line', yAxisId, {
        x1: toSvgX(0), y1: 20, x2: toSvgX(0), y2: h - 20,
        color: '#ccc', thickness: 1
    });
    yAxis._tag = 'act-axis';
    yAxis.render(engine.svgContent);
    engine.elements.set(yAxisId, yAxis);

    // Draw curve
    const curvePts = [];
    for (let x = f.range[0]; x <= f.range[1]; x += 0.05) {
        curvePts.push({ x: toSvgX(x), y: toSvgY(f.fn(x)) });
    }
    const curveId = `act-curve-${Date.now()}`;
    const curve = createElement('path', curveId, {
        points: curvePts, color: f.color, thickness: 3, smooth: true, fill: 'none'
    });
    curve._tag = 'act-curve';
    curve.render(engine.svgContent);
    engine.elements.set(curveId, curve);

    // Label
    const lblId = `act-title-${Date.now()}`;
    const lbl = createElement('text', lblId, {
        x: w / 2, y: 20,
        text: f.label, fontSize: 16, color: f.color, fontWeight: 'bold', anchor: 'middle'
    });
    lbl._tag = 'act-label';
    lbl.render(engine.svgContent);
    engine.elements.set(lblId, lbl);
}


/* ═══════════════════════════════════════════════
   GENERIC INTERACTIVE BEHAVIORS
   These work with element-driven scenes to make controls
   actually affect the visuals on the canvas.
   ═══════════════════════════════════════════════ */

// ─── update_element ───
// Updates a single element's property based on a control value.
// params: { elementId, prop, scale?, offset?, valueMap? }
// The control value is passed in params.value by the engine.
// Final value = (value * scale) + offset
// If valueMap is provided, maps specific control values to element prop values.
registerBehavior('update_element', (engine, params) => {
    const el = engine.getElement(params.elementId);
    if (!el) return;

    let newValue = params.value;

    // If valueMap exists, use it for discrete mapping
    if (params.valueMap && params.valueMap[String(newValue)] !== undefined) {
        newValue = params.valueMap[String(newValue)];
    } else {
        // Apply scale and offset for numeric values
        const scale = params.scale !== undefined ? params.scale : 1;
        const offset = params.offset !== undefined ? params.offset : 0;
        if (typeof newValue === 'number') {
            newValue = (newValue * scale) + offset;
        }
    }

    el.update({ [params.prop]: newValue });
});

// ─── update_elements ───
// Updates multiple elements from a single control. 
// params: { updates: [ {elementId, prop, scale?, offset?, valueMap?} ] }
registerBehavior('update_elements', (engine, params) => {
    if (!params.updates) return;
    params.updates.forEach(u => {
        const el = engine.getElement(u.elementId);
        if (!el) return;

        let newValue = params.value;
        if (u.valueMap && u.valueMap[String(newValue)] !== undefined) {
            newValue = u.valueMap[String(newValue)];
        } else {
            const scale = u.scale !== undefined ? u.scale : 1;
            const offset = u.offset !== undefined ? u.offset : 0;
            if (typeof newValue === 'number') {
                newValue = (newValue * scale) + offset;
            }
        }
        el.update({ [u.prop]: newValue });
    });
});

// ─── set_text ───
// Updates a text element's content using a template string.
// params: { elementId, template } — template can include {value} placeholder
// e.g. template: "Radius: {value}px" with value=50 → "Radius: 50px"
registerBehavior('set_text', (engine, params) => {
    const el = engine.getElement(params.elementId);
    if (!el) return;

    let text = params.template || '{value}';
    const val = params.value;

    // Replace {value} and formatted variants
    text = text.replace(/\{value\}/g, typeof val === 'number' ? val.toFixed(params.decimals || 0) : val);
    text = text.replace(/\{value2\}/g, typeof val === 'number' ? (val * val).toFixed(params.decimals || 0) : val);
    text = text.replace(/\{half\}/g, typeof val === 'number' ? (val / 2).toFixed(params.decimals || 0) : val);
    text = text.replace(/\{double\}/g, typeof val === 'number' ? (val * 2).toFixed(params.decimals || 0) : val);

    el.update({ text });
});

// ─── toggle_elements ───
// Shows/hides elements with a given tag or by element IDs based on toggle value.
// params: { tag?, elementIds?, showWhen? } — showWhen: "on" (default) or "off"
registerBehavior('toggle_elements', (engine, params) => {
    const showWhen = params.showWhen || 'on';
    const isOn = params.value === true || params.value === 'on' || params.value === 1;
    const shouldShow = (showWhen === 'on') ? isOn : !isOn;

    // Support toggling by element IDs
    if (params.elementIds && Array.isArray(params.elementIds)) {
        params.elementIds.forEach(elId => {
            const el = engine.getElement(elId);
            if (el && el.el) {
                el.el.style('opacity', shouldShow ? 1 : 0);
                el.el.style('pointer-events', shouldShow ? 'auto' : 'none');
            }
        });
    }
    // Also support toggling by single elementId
    if (params.elementId) {
        const el = engine.getElement(params.elementId);
        if (el && el.el) {
            el.el.style('opacity', shouldShow ? 1 : 0);
            el.el.style('pointer-events', shouldShow ? 'auto' : 'none');
        }
    }
    // Support toggling by tag
    if (params.tag) {
        engine.elements.forEach(el => {
            if (el._tag === params.tag && el.el) {
                el.el.style('opacity', shouldShow ? 1 : 0);
                el.el.style('pointer-events', shouldShow ? 'auto' : 'none');
            }
        });
    }
});

// Alias: toggle_visibility — same as toggle_elements
registerBehavior('toggle_visibility', (engine, params) => {
    BehaviorRegistry['toggle_elements'](engine, params);
});

// Alias: show_hide — same as toggle_elements
registerBehavior('show_hide', (engine, params) => {
    BehaviorRegistry['toggle_elements'](engine, params);
});

// ─── show_step ───
// For step-by-step explanations: shows elements tagged "step_1", "step_2", etc.
// based on a slider value. Lower step elements stay visible.
// params: { maxSteps }
registerBehavior('show_step', (engine, params) => {
    const currentStep = Math.floor(params.value);
    const maxSteps = params.maxSteps || 10;

    for (let i = 1; i <= maxSteps; i++) {
        const tag = `step_${i}`;
        engine.elements.forEach(el => {
            if (el._tag === tag && el.el) {
                el.el.style('opacity', i <= currentStep ? 1 : 0.15);
                el.el.style('pointer-events', i <= currentStep ? 'auto' : 'none');
            }
        });
    }
});

// ─── highlight_element ───
// Highlights an element (changes fill/stroke) when button is clicked.
// params: { elementId, fill?, stroke?, duration? }
registerBehavior('highlight_element', (engine, params) => {
    const el = engine.getElement(params.elementId);
    if (!el || !el.el) return;

    const origFill = el.el.attr('fill') || el.el.select('rect,circle,path').attr('fill');

    if (params.fill) el.update({ fill: params.fill });
    if (params.stroke) el.update({ stroke: params.stroke, strokeWidth: 3 });

    // Reset after duration
    setTimeout(() => {
        if (origFill) el.update({ fill: origFill });
        el.update({ strokeWidth: 1 });
    }, params.duration || 1500);
});

// ─── calculate_and_display ───
// Evaluates a simple formula and displays the result in a text element.
// params: { elementId, formula, controlIds: {a: "slider1", b: "slider2"} }
// formula: "a * b", "a + b", "Math.sqrt(a*a + b*b)", etc.
registerBehavior('calculate_and_display', (engine, params) => {
    if (!params.formula || !params.controlIds || !params.elementId) return;

    const el = engine.getElement(params.elementId);
    if (!el) return;

    // Build variable values from controls
    const vars = {};
    for (const [varName, ctrlId] of Object.entries(params.controlIds)) {
        const ctrl = engine.getControl(ctrlId);
        if (ctrl) vars[varName] = ctrl.getValue();
    }

    try {
        // Create function from formula string
        const varNames = Object.keys(vars);
        const varValues = Object.values(vars);
        const formula = params.formula;
        let fn;
        try {
            // Try as simple expression first: "voltage / resistance"
            fn = new Function(...varNames, `return (${formula})`);
            fn(...varValues); // test it
        } catch {
            // If that fails, try as function body: "const i = v / r; return i;" or "const i = v / r; i"
            // If the formula doesn't have 'return', wrap the last expression
            let body = formula;
            if (!body.includes('return')) {
                // Find the last statement/expression and make it a return
                const parts = body.split(';').map(s => s.trim()).filter(Boolean);
                if (parts.length > 1) {
                    parts[parts.length - 1] = 'return ' + parts[parts.length - 1];
                    body = parts.join('; ');
                } else {
                    body = 'return ' + body;
                }
            }
            fn = new Function(...varNames, body);
        }
        const result = fn(...varValues);

        const template = params.template || 'Result: {result}';
        const decimals = params.decimals || 2;
        // Handle both {result} and Python-style {result:.2f}, {result:d}, etc.
        const text = template
            .replace(/\{result(?::\.?(\d+)f?)?\}/g, (match, d) => {
                const dec = d !== undefined ? parseInt(d) : decimals;
                return typeof result === 'number' ? result.toFixed(dec) : result;
            });
        el.update({ text });
    } catch (e) {
        // Only log once per unique formula to avoid console spam
        if (!engine._formulaErrors) engine._formulaErrors = new Set();
        if (!engine._formulaErrors.has(params.formula)) {
            engine._formulaErrors.add(params.formula);
            console.warn('calculate_and_display formula error:', e.message, '| formula:', params.formula);
        }
    }
});
