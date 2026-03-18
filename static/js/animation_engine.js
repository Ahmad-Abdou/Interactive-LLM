/**
 * Animation Engine
 * Provides animation capabilities for element-driven scenes.
 * Supports: flow_along_path, pulse, animate_property, rotate.
 * Animations respond to control values for speed/intensity.
 */

class AnimationEngine {
    constructor(canvasEngine, animationDescs) {
        this.engine = canvasEngine;
        this.descs = animationDescs || [];
        this.running = false;
        this._rafId = null;
        this._particles = [];  // for flow_along_path
        this._startTime = 0;
        this._animations = []; // processed animation configs

        this._init();
    }

    _init() {
        this.descs.forEach(desc => {
            switch (desc.type) {
                case 'flow_along_path':
                    this._initFlowAlongPath(desc);
                    break;
                case 'pulse':
                case 'animate_property':
                case 'rotate':
                    this._animations.push({ ...desc, _phase: 0 });
                    break;
                default:
                    console.warn(`Unknown animation type: ${desc.type}`);
            }
        });
    }

    /* ═══════════════════════════════════════════
       FLOW ALONG PATH — particles moving along a path element
       ═══════════════════════════════════════════ */
    _initFlowAlongPath(desc) {
        const pathEl = this.engine.getElement(desc.pathId);
        if (!pathEl || !pathEl.el) {
            console.warn(`Animation: path element "${desc.pathId}" not found`);
            return;
        }

        // Get the SVG path node to use getPointAtLength()
        const pathNode = pathEl.el.select('path').node() || pathEl.el.node();
        if (!pathNode || !pathNode.getTotalLength) {
            console.warn(`Animation: "${desc.pathId}" is not a valid SVG path for flow`);
            return;
        }

        const totalLength = pathNode.getTotalLength();
        const count = desc.particleCount || 5;
        const color = desc.particleColor || '#FFD700';
        const radius = desc.particleRadius || 4;
        const particles = [];

        for (let i = 0; i < count; i++) {
            const offset = i / count; // evenly spaced 0-1
            const particleId = `_anim_p_${desc.pathId}_${i}`;
            const el = this.engine.addElement('circle', particleId, {
                cx: 0, cy: 0, r: radius,
                fill: color, stroke: 'none', strokeWidth: 0,
                opacity: 0.9
            });
            if (el) {
                el._tag = '_animation_particle';
                particles.push({ el, offset, totalLength, pathNode });
            }
        }

        this._animations.push({
            ...desc,
            type: 'flow_along_path',
            particles,
            totalLength,
            pathNode,
            _phase: 0
        });
    }

    /* ═══════════════════════════════════════════
       START / STOP / FRAME LOOP
       ═══════════════════════════════════════════ */
    start() {
        if (this.running) return;
        this.running = true;
        this._startTime = performance.now();
        this._tick();
    }

    stop() {
        this.running = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    toggle() {
        if (this.running) this.stop();
        else this.start();
        return this.running;
    }

    _tick() {
        if (!this.running) return;

        const now = performance.now();
        const dt = (now - this._startTime) / 1000; // seconds since start

        this._animations.forEach(anim => {
            const speed = this._getSpeed(anim);
            const reverse = this._getReverse(anim);

            switch (anim.type) {
                case 'flow_along_path':
                    this._tickFlow(anim, dt, speed, reverse);
                    break;
                case 'pulse':
                    this._tickPulse(anim, dt, speed);
                    break;
                case 'animate_property':
                    this._tickAnimateProperty(anim, dt, speed);
                    break;
                case 'rotate':
                    this._tickRotate(anim, dt, speed);
                    break;
            }
        });

        this._rafId = requestAnimationFrame(() => this._tick());
    }

    /* ═══════════════════════════════════════════
       ANIMATION TICK HANDLERS
       ═══════════════════════════════════════════ */

    _tickFlow(anim, dt, speed, reverse) {
        const baseSpeed = (anim.speedScale || 0.5) * speed;

        anim.particles.forEach(p => {
            // Update offset (0 to 1 position along path)
            p.offset += baseSpeed * 0.01 * (reverse ? -1 : 1);
            if (p.offset > 1) p.offset -= 1;
            if (p.offset < 0) p.offset += 1;

            try {
                const point = p.pathNode.getPointAtLength(p.offset * p.totalLength);
                p.el.update({ cx: point.x, cy: point.y });
            } catch (e) { /* ignore getBBox errors */ }
        });
    }

    _tickPulse(anim, dt, speed) {
        const el = this.engine.getElement(anim.elementId);
        if (!el || !el.el) return;

        const freq = (anim.frequency || 1) * speed;
        const phase = Math.sin(dt * freq * Math.PI * 2);
        const minScale = anim.minScale || 0.9;
        const maxScale = anim.maxScale || 1.15;
        const scale = minScale + (maxScale - minScale) * (phase * 0.5 + 0.5);

        // Apply scale transform
        const bounds = el.getBounds();
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        el.el.attr('transform', `translate(${cx},${cy}) scale(${scale}) translate(${-cx},${-cy})`);

        // Pulse opacity if configured
        if (anim.pulseOpacity) {
            const opacity = 0.5 + 0.5 * (phase * 0.5 + 0.5);
            el.el.style('opacity', opacity);
        }
    }

    _tickAnimateProperty(anim, dt, speed) {
        const el = this.engine.getElement(anim.elementId);
        if (!el) return;

        const freq = (anim.frequency || 0.5) * speed;
        const phase = Math.sin(dt * freq * Math.PI * 2);
        const min = anim.min !== undefined ? anim.min : 0;
        const max = anim.max !== undefined ? anim.max : 100;
        const value = min + (max - min) * (phase * 0.5 + 0.5);

        el.update({ [anim.prop]: value });
    }

    _tickRotate(anim, dt, speed) {
        const el = this.engine.getElement(anim.elementId);
        if (!el || !el.el) return;

        const rpm = (anim.rpm || 30) * speed;
        const degrees = (dt * rpm * 6) % 360; // rpm * 6 = degrees per second

        const bounds = el.getBounds();
        const cx = anim.centerX || (bounds.x + bounds.width / 2);
        const cy = anim.centerY || (bounds.y + bounds.height / 2);
        el.el.attr('transform', `rotate(${degrees},${cx},${cy})`);
    }

    /* ═══════════════════════════════════════════
       CONTROL-RESPONSIVE SPEED
       ═══════════════════════════════════════════ */
    _getSpeed(anim) {
        if (!anim.speedControl) return 1;
        const ctrl = this.engine.getControl(anim.speedControl);
        if (!ctrl) return 1;
        const val = ctrl.getValue();
        const scale = anim.speedScale || 1;
        // Normalize: assume control value is 0-100 by default
        const max = ctrl.config?.max || 100;
        return Math.max(0.05, (val / max) * scale * 2);
    }

    _getReverse(anim) {
        if (!anim.reverseControl) return false;
        const ctrl = this.engine.getControl(anim.reverseControl);
        if (!ctrl) return false;
        const val = ctrl.getValue();
        return val === true || val === 'on' || val === 1;
    }

    /* ═══════════════════════════════════════════
       CLEANUP
       ═══════════════════════════════════════════ */
    destroy() {
        this.stop();
        // Remove animation particles
        this._animations.forEach(anim => {
            if (anim.particles) {
                anim.particles.forEach(p => {
                    if (p.el) this.engine.removeElement(p.el.id);
                });
            }
        });
        this._animations = [];
    }
}
