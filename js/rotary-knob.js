// Rotary knob helper: syncs input[type=range] value to --val CSS variable
// --val is normalized 0-1 for the conic-gradient and indicator rotation
// Uses vertical drag for fine-grained control (200px drag = full range)

const KNOB_SENSITIVITY_DEFAULT = 200; // pixels for full min→max sweep

function updateRotaryKnob(input) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const val = parseFloat(input.value);
    const norm = max === min ? 0 : (val - min) / (max - min);
    const wrap = input.closest('.rotary-wrap');
    if (wrap) wrap.style.setProperty('--val', norm);
}

function _bindRotaryDrag(input) {
    const wrap = input.closest('.rotary-wrap');
    if (!wrap) return;

    let dragging = false;
    let startY = 0;
    let startVal = 0;
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const step = parseFloat(input.step) || ((max - min) > 100 ? 1 : (max - min) / 200);
    const sensitivity = parseFloat(input.dataset.sensitivity) || KNOB_SENSITIVITY_DEFAULT;

    // Prevent native slider interaction — we handle it ourselves
    input.style.pointerEvents = 'none';
    wrap.style.cursor = 'ns-resize';

    wrap.addEventListener('mousedown', (e) => {
        e.preventDefault();
        dragging = true;
        startY = e.clientY;
        startVal = parseFloat(input.value);
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    });

    wrap.style.touchAction = 'none';
    wrap.addEventListener('touchstart', (e) => {
        e.preventDefault();
        dragging = true;
        startY = e.touches[0].clientY;
        startVal = parseFloat(input.value);
    }, { passive: false });

    function onMove(clientY) {
        if (!dragging) return;
        const dy = startY - clientY; // up = positive = increase
        const range = max - min;
        const delta = (dy / sensitivity) * range;
        let newVal = startVal + delta;
        // Snap to step
        newVal = Math.round(newVal / step) * step;
        newVal = Math.max(min, Math.min(max, newVal));
        if (parseFloat(input.value) !== newVal) {
            input.value = newVal;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    document.addEventListener('mousemove', (e) => onMove(e.clientY));
    document.addEventListener('touchmove', (e) => {
        if (dragging) {
            e.preventDefault();
            onMove(e.touches[0].clientY);
        }
    }, { passive: false });

    function onEnd() {
        if (dragging) {
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    }
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);

    // Double-click to reset to default (midpoint or 0 for bipolar knobs)
    wrap.addEventListener('dblclick', () => {
        const defaultVal = input.dataset.default !== undefined
            ? parseFloat(input.dataset.default)
            : (min < 0 ? 0 : min);
        input.value = defaultVal;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function initRotaryKnobs() {
    document.querySelectorAll('.rotary-knob input[type="range"]').forEach(input => {
        updateRotaryKnob(input);
        if (!input._rotaryBound) {
            input.addEventListener('input', () => updateRotaryKnob(input));
            _bindRotaryDrag(input);
            input._rotaryBound = true;
        }
    });
}
