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

    // B13: iOS Safari requires AudioContext.resume() inside a user gesture
    const unlockAudio = () => {
        if (audioEngine.context.state === 'suspended') {
            audioEngine.context.resume();
        }
        document.removeEventListener('touchstart', unlockAudio);
        document.removeEventListener('click', unlockAudio);
    };
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('click', unlockAudio, { once: true });

    // F15: Register service worker for PWA / offline support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
});
