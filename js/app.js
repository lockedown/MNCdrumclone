// Application entry point
document.addEventListener('DOMContentLoaded', () => {
    const audioEngine = new AudioEngine();
    const sequencer = new Sequencer(audioEngine);
    const colorWheel = new ColorWheel();
    const keyboard = new KeyboardController(sequencer);
    initRotaryKnobs();
    document.getElementById('app-version').textContent = 'v' + APP_VERSION;
});
