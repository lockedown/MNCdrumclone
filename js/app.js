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
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
});
