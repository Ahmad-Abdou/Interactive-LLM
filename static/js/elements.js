/**
 * Element Primitives Library
 * Reusable SVG drawing primitives for the Interactive AI canvas system.
 * Each element renders via D3, supports update/remove/serialize.
 */

/* ─── Shared Tooltip ─── */
let _tooltipDiv = null;
function _getTooltip() {
    if (!_tooltipDiv) {
        _tooltipDiv = document.createElement('div');
        _tooltipDiv.className = 'el-tooltip';
        _tooltipDiv.style.cssText = `
            position: fixed; pointer-events: none; z-index: 10000;
            background: rgba(30,30,30,0.92); color: #fff; padding: 8px 12px;
            border-radius: 6px; font-size: 13px; max-width: 260px;
            line-height: 1.4; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            opacity: 0; transition: opacity 0.15s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        document.body.appendChild(_tooltipDiv);
    }
    return _tooltipDiv;
}

/* ─── Base Element ─── */
class BaseElement {
    constructor(id, props = {}) {
        this.id = id;
        this.props = { ...props };
        this.el = null;       // D3 selection
        this.group = null;    // parent SVG group
        this._listeners = {};
    }

    render(svgGroup) {
        this.group = svgGroup;
    }

    update(newProps) {
        Object.assign(this.props, newProps);
        if (this.el) this._applyProps();
    }

    remove() {
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
    }

    getBounds() {
        if (!this.el) return { x: 0, y: 0, width: 0, height: 0 };
        try {
            const node = this.el.node();
            const bbox = node.getBBox();
            return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
        } catch {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
    }

    on(event, callback) {
        this._listeners[event] = callback;
        if (this.el) this.el.on(event, callback);
        return this;
    }

    emit(event, data) {
        if (this._listeners[event]) this._listeners[event](data);
    }

    toJSON() {
        return { type: this.constructor.elementType, id: this.id, props: { ...this.props } };
    }

    _applyProps() { /* override */ }

    /* ─── Tooltip support ─── */
    _setupTooltip() {
        if (!this.props.tooltip || !this.el) return;
        const tip = _getTooltip();
        this.el
            .on('mouseenter.tooltip', (event) => {
                tip.textContent = this.props.tooltip;
                tip.style.opacity = '1';
                tip.style.left = (event.clientX + 12) + 'px';
                tip.style.top = (event.clientY - 8) + 'px';
            })
            .on('mousemove.tooltip', (event) => {
                tip.style.left = (event.clientX + 12) + 'px';
                tip.style.top = (event.clientY - 8) + 'px';
            })
            .on('mouseleave.tooltip', () => {
                tip.style.opacity = '0';
            });
    }

    /* ─── Generic draggable support ─── */
    _makeDraggable() {
        if (!this.el) return;
        const self = this;
        const drag = d3.drag()
            .on('start', function () {
                d3.select(this).style('cursor', 'grabbing');
            })
            .on('drag', function (event) {
                // Detect position props based on element type
                if (self.props.cx !== undefined) {
                    self.props.cx = event.x;
                    self.props.cy = event.y;
                } else if (self.props.x !== undefined) {
                    self.props.x = event.x;
                    self.props.y = event.y;
                }
                self._applyProps();
                self.emit('drag', { id: self.id, x: event.x, y: event.y });
            })
            .on('end', function () {
                d3.select(this).style('cursor', self.props.draggable ? 'grab' : 'pointer');
            });
        this.el.call(drag);
        this.el.style('cursor', 'grab');
    }
}


/* ─── Circle Element ─── */
class CircleElement extends BaseElement {
    static elementType = 'circle';

    constructor(id, props = {}) {
        super(id, {
            cx: 0, cy: 0, r: 8,
            fill: '#4CAF50', stroke: '#fff', strokeWidth: 2,
            label: '', labelColor: '#fff', labelSize: 12,
            draggable: false, opacity: 1,
            ...props
        });
    }

    render(svgGroup) {
        super.render(svgGroup);
        const g = svgGroup.append('g').attr('class', `el-circle el-${this.id}`);

        this._circle = g.append('circle');
        this._label = g.append('text')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .style('pointer-events', 'none')
            .style('user-select', 'none');

        this.el = g;
        this._applyProps();

        if (this.props.draggable) this._makeDraggable();
        this._setupTooltip();

        // Re-bind listeners
        Object.entries(this._listeners).forEach(([evt, cb]) => {
            this.el.on(evt, cb);
        });

        return this;
    }

    _applyProps() {
        const p = this.props;
        this._circle
            .attr('cx', p.cx).attr('cy', p.cy).attr('r', p.r)
            .style('fill', p.fill).style('stroke', p.stroke)
            .style('stroke-width', p.strokeWidth).style('opacity', p.opacity)
            .style('cursor', p.draggable ? 'grab' : 'pointer');

        this._label
            .attr('x', p.cx).attr('y', p.cy)
            .text(p.label)
            .style('fill', p.labelColor).style('font-size', `${p.labelSize}px`)
            .style('font-weight', '600');
    }

    // CircleElement uses the generic _makeDraggable from BaseElement

    animateIn(duration = 300) {
        if (this._circle) {
            const finalR = this.props.r;
            this._circle.attr('r', 0).transition().duration(duration).attr('r', finalR);
        }
        return this;
    }
}


/* ─── Rectangle Element ─── */
class RectElement extends BaseElement {
    static elementType = 'rect';

    constructor(id, props = {}) {
        super(id, {
            x: 0, y: 0, width: 40, height: 40,
            fill: '#2196F3', stroke: '#1565C0', strokeWidth: 2,
            rx: 4, ry: 4,
            label: '', labelColor: '#fff', labelSize: 14,
            opacity: 1,
            ...props
        });
    }

    render(svgGroup) {
        super.render(svgGroup);
        const g = svgGroup.append('g').attr('class', `el-rect el-${this.id}`);

        this._rect = g.append('rect');
        this._label = g.append('text')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .style('pointer-events', 'none')
            .style('user-select', 'none');

        this.el = g;
        this._applyProps();
        if (this.props.draggable) this._makeDraggable();
        this._setupTooltip();
        Object.entries(this._listeners).forEach(([evt, cb]) => this.el.on(evt, cb));
        return this;
    }

    _applyProps() {
        const p = this.props;
        this._rect
            .attr('x', p.x).attr('y', p.y)
            .attr('width', p.width).attr('height', p.height)
            .attr('rx', p.rx).attr('ry', p.ry)
            .style('fill', p.fill).style('stroke', p.stroke)
            .style('stroke-width', p.strokeWidth).style('opacity', p.opacity);

        this._label
            .attr('x', p.x + p.width / 2).attr('y', p.y + p.height / 2)
            .text(p.label)
            .style('fill', p.labelColor).style('font-size', `${p.labelSize}px`)
            .style('font-weight', '600');
    }

    highlight(color = '#FFD700', duration = 500) {
        if (this._rect) {
            const orig = this.props.fill;
            this._rect.transition().duration(duration / 2).style('fill', color)
                .transition().duration(duration / 2).style('fill', orig);
        }
    }
}


/* ─── Line Element ─── */
class LineElement extends BaseElement {
    static elementType = 'line';

    constructor(id, props = {}) {
        super(id, {
            x1: 0, y1: 0, x2: 100, y2: 100,
            color: '#333', thickness: 2,
            dashed: false, opacity: 1,
            ...props
        });
    }

    render(svgGroup) {
        super.render(svgGroup);
        this.el = svgGroup.append('line').attr('class', `el-line el-${this.id}`);
        this._applyProps();
        Object.entries(this._listeners).forEach(([evt, cb]) => this.el.on(evt, cb));
        return this;
    }

    _applyProps() {
        const p = this.props;
        this.el
            .attr('x1', p.x1).attr('y1', p.y1)
            .attr('x2', p.x2).attr('y2', p.y2)
            .style('stroke', p.color).style('stroke-width', p.thickness)
            .style('opacity', p.opacity)
            .style('stroke-dasharray', p.dashed ? '6,4' : 'none');
    }
}


/* ─── Arrow Element ─── */
class ArrowElement extends BaseElement {
    static elementType = 'arrow';

    constructor(id, props = {}) {
        super(id, {
            x1: 0, y1: 0, x2: 100, y2: 100,
            color: '#333', thickness: 2,
            label: '', labelColor: '#333', labelSize: 12,
            headSize: 8, opacity: 1, curved: false,
            ...props
        });
    }

    render(svgGroup) {
        super.render(svgGroup);
        const g = svgGroup.append('g').attr('class', `el-arrow el-${this.id}`);

        // Arrowhead marker
        const markerId = `arrowhead-${this.id}`;
        const defs = svgGroup.select('defs').empty()
            ? svgGroup.append('defs')
            : svgGroup.select('defs');

        defs.append('marker')
            .attr('id', markerId)
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 10).attr('refY', 5)
            .attr('markerWidth', this.props.headSize)
            .attr('markerHeight', this.props.headSize)
            .attr('orient', 'auto-start-reverse')
            .append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z')
            .style('fill', this.props.color);

        if (this.props.curved) {
            this._line = g.append('path');
        } else {
            this._line = g.append('line');
        }

        this._label = g.append('text')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .style('pointer-events', 'none')
            .style('user-select', 'none');

        this._markerId = markerId;
        this.el = g;
        this._applyProps();
        Object.entries(this._listeners).forEach(([evt, cb]) => this.el.on(evt, cb));
        return this;
    }

    _applyProps() {
        const p = this.props;

        if (p.curved) {
            const mx = (p.x1 + p.x2) / 2;
            const my = Math.min(p.y1, p.y2) - 40;
            this._line
                .attr('d', `M ${p.x1} ${p.y1} Q ${mx} ${my} ${p.x2} ${p.y2}`)
                .style('fill', 'none')
                .style('stroke', p.color).style('stroke-width', p.thickness)
                .style('opacity', p.opacity)
                .attr('marker-end', `url(#${this._markerId})`);
        } else {
            this._line
                .attr('x1', p.x1).attr('y1', p.y1)
                .attr('x2', p.x2).attr('y2', p.y2)
                .style('stroke', p.color).style('stroke-width', p.thickness)
                .style('opacity', p.opacity)
                .attr('marker-end', `url(#${this._markerId})`);
        }

        const lx = (p.x1 + p.x2) / 2;
        const ly = (p.y1 + p.y2) / 2 - 10;
        this._label.attr('x', lx).attr('y', ly)
            .text(p.label)
            .style('fill', p.labelColor).style('font-size', `${p.labelSize}px`);
    }
}


/* ─── Text Element ─── */
class TextElement extends BaseElement {
    static elementType = 'text';

    constructor(id, props = {}) {
        super(id, {
            x: 0, y: 0,
            text: '', fontSize: 14, color: '#333',
            fontWeight: 'normal', anchor: 'start',
            opacity: 1,
            ...props
        });
    }

    render(svgGroup) {
        super.render(svgGroup);
        this.el = svgGroup.append('text').attr('class', `el-text el-${this.id}`);
        this._applyProps();
        if (this.props.draggable) this._makeDraggable();
        this._setupTooltip();
        Object.entries(this._listeners).forEach(([evt, cb]) => this.el.on(evt, cb));
        return this;
    }

    _applyProps() {
        const p = this.props;
        this.el
            .attr('x', p.x).attr('y', p.y)
            .text(p.text)
            .style('fill', p.color).style('font-size', `${p.fontSize}px`)
            .style('font-weight', p.fontWeight)
            .attr('text-anchor', p.anchor)
            .style('opacity', p.opacity)
            .style('user-select', 'none');
    }
}


/* ─── Path Element (curves, polynomials) ─── */
class PathElement extends BaseElement {
    static elementType = 'path';

    constructor(id, props = {}) {
        super(id, {
            points: [],    // [{x, y}, ...]
            color: '#2196F3', thickness: 3,
            smooth: true, dashed: false,
            fill: 'none', opacity: 0.8,
            ...props
        });
    }

    render(svgGroup) {
        super.render(svgGroup);
        this.el = svgGroup.append('path').attr('class', `el-path el-${this.id}`);
        this._applyProps();
        Object.entries(this._listeners).forEach(([evt, cb]) => this.el.on(evt, cb));
        return this;
    }

    _applyProps() {
        const p = this.props;
        if (!p.points || p.points.length < 2) {
            this.el.attr('d', '');
            return;
        }

        const lineGen = d3.line()
            .x(d => d.x).y(d => d.y);
        if (p.smooth) lineGen.curve(d3.curveNatural);

        this.el
            .attr('d', lineGen(p.points))
            .style('fill', p.fill).style('stroke', p.color)
            .style('stroke-width', p.thickness)
            .style('opacity', p.opacity)
            .style('stroke-dasharray', p.dashed ? '8,5' : 'none');
    }

    animateIn(duration = 500) {
        if (this.el) {
            this.el.style('opacity', 0).transition().duration(duration).style('opacity', this.props.opacity);
        }
        return this;
    }
}


/* ─── Group Element (container) ─── */
class GroupElement extends BaseElement {
    static elementType = 'group';

    constructor(id, props = {}) {
        super(id, {
            x: 0, y: 0, ...props
        });
        this.children = [];
    }

    render(svgGroup) {
        super.render(svgGroup);
        this.el = svgGroup.append('g')
            .attr('class', `el-group el-${this.id}`)
            .attr('transform', `translate(${this.props.x},${this.props.y})`);

        this.children.forEach(child => child.render(this.el));
        if (this.props.draggable) this._makeDraggable();
        this._setupTooltip();
        return this;
    }

    addChild(element) {
        this.children.push(element);
        if (this.el) element.render(this.el);
        return this;
    }

    removeChild(id) {
        const idx = this.children.findIndex(c => c.id === id);
        if (idx >= 0) {
            this.children[idx].remove();
            this.children.splice(idx, 1);
        }
        return this;
    }

    getChild(id) {
        return this.children.find(c => c.id === id);
    }

    _applyProps() {
        if (this.el) {
            this.el.attr('transform', `translate(${this.props.x},${this.props.y})`);
        }
    }

    remove() {
        this.children.forEach(c => c.remove());
        super.remove();
    }

    toJSON() {
        return {
            ...super.toJSON(),
            children: this.children.map(c => c.toJSON())
        };
    }
}


/* ─── Element Factory ─── */
const ElementRegistry = {
    circle: CircleElement,
    rect: RectElement,
    line: LineElement,
    arrow: ArrowElement,
    text: TextElement,
    path: PathElement,
    group: GroupElement
};

function createElement(type, id, props) {
    const Cls = ElementRegistry[type];
    if (!Cls) {
        console.warn(`Unknown element type: "${type}", skipping element "${id}"`);
        return null;
    }
    return new Cls(id, props);
}
