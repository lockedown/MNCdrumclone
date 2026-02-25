// Application entry point
document.addEventListener('DOMContentLoaded', () => {
    const audioEngine = new AudioEngine();
    const visualiser = new Visualiser('visualiser', audioEngine);
    const sequencer = new Sequencer(audioEngine, visualiser);
    const colorWheel = new ColorWheel();
    const keyboard = new KeyboardController(sequencer);
    initRotaryKnobs();
    visualiser._drawIdle();
    document.getElementById('app-version').textContent = 'v' + APP_VERSION;

    // Settings panel toggle
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPopup = document.getElementById('settings-popup');
    settingsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPopup.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!settingsPopup.contains(e.target) && e.target !== settingsToggle) {
            settingsPopup.classList.remove('open');
        }
    });

    // Knob direction preference
    const knobDirSelect = document.getElementById('pref-knob-dir');
    knobDirSelect.value = knobDirection;
    knobDirSelect.addEventListener('change', (e) => {
        knobDirection = e.target.value;
        localStorage.setItem('tr808-knob-dir', knobDirection);
        // Update cursor on all existing knob wraps
        document.querySelectorAll('.rotary-wrap').forEach(wrap => {
            wrap.style.cursor = knobDirection === 'horizontal' ? 'ew-resize' : 'ns-resize';
        });
    });

    // B13: iOS Safari requires AudioContext.resume() + silent buffer inside a user gesture
    const unlockAudio = () => {
        const ctx = audioEngine.context;
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        // Play a silent buffer to fully unlock iOS audio pipeline
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        document.removeEventListener('touchstart', unlockAudio);
        document.removeEventListener('touchend', unlockAudio);
        document.removeEventListener('click', unlockAudio);
    };
    document.addEventListener('touchstart', unlockAudio);
    document.addEventListener('touchend', unlockAudio);
    document.addEventListener('click', unlockAudio);

    // F15: Register service worker for PWA / offline support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
});
