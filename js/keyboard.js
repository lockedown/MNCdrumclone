// Keyboard shortcuts for live performance
class KeyboardController {
    constructor(sequencer) {
        this.seq = sequencer;
        this._drumKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];
        this._bind();
    }

    _bind() {
        document.addEventListener('keydown', (e) => {
            // Ignore if user is typing in an input/select
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

            const key = e.key;

            // Space — play/stop
            if (key === ' ') {
                e.preventDefault();
                this.seq.togglePlay();
                return;
            }

            // Arrow Up/Down — nudge tempo
            if (key === 'ArrowUp' || key === 'ArrowDown') {
                e.preventDefault();
                const delta = key === 'ArrowUp' ? 1 : -1;
                const tempoEl = document.getElementById('tempo');
                const displayEl = document.getElementById('tempo-display');
                const newTempo = Math.max(parseInt(tempoEl.min), Math.min(parseInt(tempoEl.max), this.seq.tempo + delta));
                this.seq.tempo = newTempo;
                tempoEl.value = newTempo;
                displayEl.textContent = newTempo;
                updateRotaryKnob(tempoEl);
                return;
            }

            // 1-9, 0, - keys — trigger drums or toggle mute
            const idx = this._drumKeys.indexOf(key);
            if (idx !== -1 && idx < DRUMS.length) {
                const drum = DRUMS[idx];
                if (e.shiftKey) {
                    // Shift+number — toggle mute
                    this.seq.toggleMute(drum.id);
                } else {
                    // Number key — trigger drum sound
                    this.seq.audio.play(
                        drum.id,
                        this.seq.audio.now,
                        this.seq.volume[drum.id],
                        this.seq.pitch[drum.id],
                        this.seq.decay[drum.id]
                    );
                }
                return;
            }
        });
    }
}
