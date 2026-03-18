/**
 * Interactive Control Primitives
 * HTML-based controls that modify scene state via the CanvasEngine.
 */

/* ─── Base Control ─── */
class BaseControl {
    constructor(id, config = {}) {
        this.id = id;
        this.config = { label: '', ...config };
        this.container = null;
        this._onChange = null;
        this.value = config.value ?? config.defaultValue ?? null;
    }

    render(parentEl) {
        this.container = document.createElement('div');
        this.container.className = 'ctrl-item';
        this.container.id = `ctrl-${this.id}`;
        this.container.style.cssText = `
      background: white; padding: 15px; border-radius: 6px;
      border: 1px solid #ddd;
    `;
        parentEl.appendChild(this.container);
        return this;
    }

    getValue() { return this.value; }

    setValue(v) { this.value = v; }

    onChange(cb) { this._onChange = cb; return this; }

    _emit(value) {
        this.value = value;
        if (this._onChange) this._onChange(this.id, value);
    }

    destroy() {
        if (this.container) this.container.remove();
    }

    toJSON() {
        return { type: this.constructor.controlType, id: this.id, value: this.value };
    }
}


/* ─── Slider Control ─── */
class SliderControl extends BaseControl {
    static controlType = 'slider';

    constructor(id, config = {}) {
        super(id, {
            min: 0, max: 100, step: 1, value: 0,
            label: 'Slider', showValue: true,
            minLabel: '', maxLabel: '',
            ...config
        });
    }

    render(parentEl) {
        super.render(parentEl);
        const c = this.config;
        this.container.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="font-weight:bold;font-size:14px">${c.label}</span>
        <span class="slider-val" style="background:#2196F3;color:white;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold">${c.value}</span>
      </div>
      <input type="range" class="slider-input" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}" style="width:100%">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#888;margin-top:5px">
        <span>${c.minLabel || c.min}</span>
        <span>${c.maxLabel || c.max}</span>
      </div>
      <div class="slider-msg" style="font-size:12px;color:#ff9800;margin-top:8px;min-height:16px;font-style:italic"></div>
    `;

        const input = this.container.querySelector('.slider-input');
        const valDisplay = this.container.querySelector('.slider-val');
        this._inputEl = input;
        this._valDisplay = valDisplay;
        this._msgEl = this.container.querySelector('.slider-msg');

        input.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            valDisplay.textContent = v;
            this._emit(v);
        });

        return this;
    }

    setMax(max) {
        this.config.max = max;
        if (this._inputEl) {
            this._inputEl.max = max;
            if (parseFloat(this._inputEl.value) > max) {
                this._inputEl.value = max;
                this._valDisplay.textContent = max;
                this._emit(max);
            }
        }
    }

    setMessage(msg, color = '#ff9800') {
        if (this._msgEl) {
            this._msgEl.textContent = msg;
            this._msgEl.style.color = color;
        }
    }

    setValue(v) {
        super.setValue(v);
        if (this._inputEl) {
            this._inputEl.value = v;
            this._valDisplay.textContent = v;
        }
    }
}


/* ─── Button Control ─── */
class ButtonControl extends BaseControl {
    static controlType = 'button';

    constructor(id, config = {}) {
        super(id, {
            label: 'Button',
            style: 'primary',    // primary | secondary | danger | success
            icon: '',
            ...config
        });
    }

    render(parentEl) {
        // Don't call super — button is just a <button>
        const btn = document.createElement('button');
        btn.id = `ctrl-${this.id}`;
        btn.className = `ctrl-btn ctrl-btn-${this.config.style}`;

        const styles = {
            primary: 'background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none',
            secondary: 'background:white;color:#667eea;border:1px solid #667eea',
            danger: 'background:#f5576c;color:white;border:none',
            success: 'background:#4CAF50;color:white;border:none'
        };

        btn.style.cssText = `
      padding:15px;border-radius:6px;font-size:16px;font-weight:bold;
      cursor:pointer;transition:all 0.3s;width:100%;
      ${styles[this.config.style] || styles.primary}
    `;

        btn.innerHTML = this.config.icon
            ? `<span style="margin-right:6px">${this.config.icon}</span>${this.config.label}`
            : this.config.label;

        btn.addEventListener('click', () => this._emit('clicked'));
        btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.85'; });
        btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });

        this.container = btn;
        this._btnEl = btn;
        parentEl.appendChild(btn);
        return this;
    }

    setDisabled(disabled) {
        if (this._btnEl) {
            this._btnEl.disabled = disabled;
            this._btnEl.style.opacity = disabled ? '0.5' : '1';
            this._btnEl.style.cursor = disabled ? 'not-allowed' : 'pointer';
        }
    }

    setLoading(loading) {
        if (!this._btnEl) return;
        if (loading) {
            this._origHTML = this._btnEl.innerHTML;
            this._btnEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;gap:8px">
          <div style="width:16px;height:16px;border:3px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 1s linear infinite"></div>
          <span>Analyzing...</span>
        </div>`;
            this._btnEl.disabled = true;
            this._btnEl.style.cursor = 'wait';
        } else {
            this._btnEl.innerHTML = this._origHTML || this.config.label;
            this._btnEl.disabled = false;
            this._btnEl.style.cursor = 'pointer';
        }
    }
}


/* ─── Input Control ─── */
class InputControl extends BaseControl {
    static controlType = 'input';

    constructor(id, config = {}) {
        super(id, {
            label: 'Input',
            placeholder: 'Enter value...',
            inputType: 'text',    // text | number
            value: '',
            ...config
        });
    }

    render(parentEl) {
        super.render(parentEl);
        const c = this.config;
        this.container.innerHTML = `
      <div style="font-weight:bold;font-size:14px;margin-bottom:8px">${c.label}</div>
      <input type="${c.inputType}" class="ctrl-input-field" placeholder="${c.placeholder}" value="${c.value || ''}"
        style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box;outline:none">
    `;

        const input = this.container.querySelector('.ctrl-input-field');
        this._inputEl = input;

        input.addEventListener('input', (e) => {
            const v = c.inputType === 'number' ? parseFloat(e.target.value) : e.target.value;
            this._emit(v);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const v = c.inputType === 'number' ? parseFloat(input.value) : input.value;
                this._emit(v);
                if (this._onSubmit) this._onSubmit(this.id, v);
            }
        });

        return this;
    }

    onSubmit(cb) { this._onSubmit = cb; return this; }

    clear() {
        if (this._inputEl) { this._inputEl.value = ''; this.value = ''; }
    }
}


/* ─── Toggle Control ─── */
class ToggleControl extends BaseControl {
    static controlType = 'toggle';

    constructor(id, config = {}) {
        super(id, {
            label: 'Toggle', value: false, ...config
        });
    }

    render(parentEl) {
        super.render(parentEl);
        const c = this.config;
        this.container.style.cssText += 'display:flex;align-items:center;justify-content:space-between;';
        this.container.innerHTML = `
      <span style="font-weight:bold;font-size:14px">${c.label}</span>
      <label style="position:relative;display:inline-block;width:48px;height:26px;cursor:pointer">
        <input type="checkbox" class="ctrl-toggle-cb" ${c.value ? 'checked' : ''} style="opacity:0;width:0;height:0">
        <span class="toggle-track" style="position:absolute;inset:0;background:${c.value ? '#4CAF50' : '#ccc'};border-radius:13px;transition:0.3s"></span>
        <span class="toggle-thumb" style="position:absolute;height:22px;width:22px;left:${c.value ? '24px' : '2px'};bottom:2px;background:white;border-radius:50%;transition:0.3s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span>
      </label>
    `;

        const cb = this.container.querySelector('.ctrl-toggle-cb');
        const track = this.container.querySelector('.toggle-track');
        const thumb = this.container.querySelector('.toggle-thumb');

        cb.addEventListener('change', () => {
            const v = cb.checked;
            track.style.background = v ? '#4CAF50' : '#ccc';
            thumb.style.left = v ? '24px' : '2px';
            this._emit(v);
        });

        return this;
    }
}


/* ─── Dropdown Control ─── */
class DropdownControl extends BaseControl {
    static controlType = 'dropdown';

    constructor(id, config = {}) {
        super(id, {
            label: 'Select',
            options: [],
            value: '',
            ...config
        });
        if (!this.value && config.options?.length) this.value = config.options[0];
    }

    render(parentEl) {
        super.render(parentEl);
        const c = this.config;
        const optionsHTML = c.options.map(o =>
            `<option value="${o}" ${o === c.value ? 'selected' : ''}>${o}</option>`
        ).join('');

        this.container.innerHTML = `
      <div style="font-weight:bold;font-size:14px;margin-bottom:8px">${c.label}</div>
      <select class="ctrl-select" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;outline:none;background:white;cursor:pointer">
        ${optionsHTML}
      </select>
    `;

        const select = this.container.querySelector('.ctrl-select');
        select.addEventListener('change', (e) => this._emit(e.target.value));
        return this;
    }
}


/* ─── Point Counter Control ─── */
class PointCounterControl extends BaseControl {
    static controlType = 'point_counter';

    constructor(id, config = {}) {
        super(id, {
            label: 'Points Placed', current: 0, max: 10,
            color: '#4CAF50',
            ...config
        });
        this.value = config.current || 0;
    }

    render(parentEl) {
        super.render(parentEl);
        const c = this.config;
        this.container.innerHTML = `
      <div style="font-weight:bold;margin-bottom:8px;font-size:14px">${c.label}</div>
      <div class="counter-value" style="font-size:24px;color:${c.color};font-weight:bold">${c.current} / ${c.max}</div>
      <div style="font-size:12px;color:#666;margin-top:5px">Max ${c.max}</div>
    `;
        this._counterEl = this.container.querySelector('.counter-value');
        return this;
    }

    setCount(n) {
        this.value = n;
        if (this._counterEl) {
            this._counterEl.textContent = `${n} / ${this.config.max}`;
        }
    }
}


/* ─── Control Factory ─── */
const ControlRegistry = {
    slider: SliderControl,
    button: ButtonControl,
    input: InputControl,
    toggle: ToggleControl,
    checkbox: ToggleControl,      // alias
    dropdown: DropdownControl,
    select: DropdownControl,      // alias
    point_counter: PointCounterControl
};

function createControl(type, id, config) {
    // Infer type from config if missing
    if (!type && config) {
        if (config.min !== undefined && config.max !== undefined && config.options === undefined) type = 'slider';
        else if (config.options) type = 'dropdown';
        else if (config.inputType) type = 'input';
        else if (config.onLabel || config.offLabel) type = 'toggle';
        else if (config.style || config.icon) type = 'button';
        else if (config.current !== undefined && config.max !== undefined) type = 'point_counter';
    }
    const Cls = ControlRegistry[type];
    if (!Cls) {
        console.warn(`Unknown control type: ${type}, skipping control "${id}"`);
        return new BaseControl(id, config);
    }
    return new Cls(id, config);
}
