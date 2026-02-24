// Sequencer: manages pattern state, Web Audio scheduled playback, and UI
class Sequencer {
    constructor(audioEngine, visualiser) {
        this.audio = audioEngine;
        this.visualiser = visualiser;
        this.tempo = DEFAULT_TEMPO;
        this.swing = DEFAULT_SWING;
        this.stepCount = STEP_COUNT;
        this.isPlaying = false;
        this.currentStep = 0;

        // Scheduler state
        this._schedulerId = null;
        this._nextStepTime = 0;

        // B1: rAF-based step highlight
        this._stepTimes = [];
        this._rafId = null;

        // O1: Cached solo flag
        this._anySolo = false;

        // O2+O3: Cached step button DOM refs
        this._stepBtnCache = {};

        // Per-instrument state
        this.pattern = {};
        this.volume = {};
        this.pitch = {};
        this.decay = {};
        this.probability = {};
        this.mute = {};
        this.solo = {};
        DRUMS.forEach(drum => {
            this.pattern[drum.id] = new Array(this.stepCount).fill(0);
            this.probability[drum.id] = new Array(MAX_STEPS).fill(100);
            this.volume[drum.id] = DEFAULT_VOLUME;
            this.pitch[drum.id] = DEFAULT_PITCH;
            this.decay[drum.id] = DEFAULT_DECAY;
            this.mute[drum.id] = false;
            this.solo[drum.id] = false;
        });

        this._buildSequencerDOM();
        this._bindEvents();
        this.loadPreset(DEFAULT_PRESET);
    }

    // --- DOM generation ---

    _buildSequencerDOM() {
        const sequencer = document.querySelector('.sequencer');
        sequencer.innerHTML = '';

        this._updateGridColumns();
        this._stepBtnCache = {};

        // Step numbers row
        const numbersRow = document.createElement('div');
        numbersRow.className = 'step-numbers';
        for (let i = 1; i <= this.stepCount; i++) {
            const num = document.createElement('div');
            num.className = 'step-number';
            num.textContent = i;
            numbersRow.appendChild(num);
        }
        sequencer.appendChild(numbersRow);

        // Drum rows
        DRUMS.forEach(drum => {
            const row = document.createElement('div');
            row.className = 'drum-row';
            row.dataset.drum = drum.id;

            // Label + knobs
            const label = document.createElement('div');
            label.className = 'drum-label';
            label.innerHTML = `
                <span class="drum-name">${drum.label.toUpperCase()}</span>
                <div class="drum-knobs">
                    <div class="rotary-knob">
                        <span class="rotary-label">VOL</span>
                        <div class="rotary-wrap">
                            <input type="range" class="vol-slider" min="0" max="100"
                                   value="${this.volume[drum.id] * 100}" data-drum="${drum.id}">
                            <div class="rotary-visual"></div>
                            <div class="rotary-indicator"></div>
                        </div>
                    </div>
                    <div class="rotary-knob">
                        <span class="rotary-label">PIT</span>
                        <div class="rotary-wrap">
                            <input type="range" class="pitch-slider" min="-12" max="12"
                                   value="${this.pitch[drum.id]}" data-drum="${drum.id}">
                            <div class="rotary-visual"></div>
                            <div class="rotary-indicator"></div>
                        </div>
                    </div>
                    <div class="rotary-knob">
                        <span class="rotary-label">DEC</span>
                        <div class="rotary-wrap">
                            <input type="range" class="decay-slider" min="0" max="100"
                                   value="${this.decay[drum.id] * 100}" data-drum="${drum.id}">
                            <div class="rotary-visual"></div>
                            <div class="rotary-indicator"></div>
                        </div>
                    </div>
                    <div class="btn-grid">
                        <button class="euclid-btn" data-drum="${drum.id}" title="Euclidean fill">E</button>
                        <button class="random-row-btn" data-drum="${drum.id}" title="Randomize row">R</button>
                        <button class="mute-btn${this.mute[drum.id] ? ' active' : ''}" data-drum="${drum.id}" title="Mute">M</button>
                        <button class="solo-btn${this.solo[drum.id] ? ' active' : ''}" data-drum="${drum.id}" title="Solo">S</button>
                    </div>
                </div>
            `;
            row.appendChild(label);

            // Step buttons — cache refs for O2+O3
            const buttons = document.createElement('div');
            buttons.className = 'step-buttons';
            const btnArr = [];
            for (let i = 0; i < this.stepCount; i++) {
                const btn = document.createElement('button');
                btn.className = 'step-btn';
                btn.dataset.step = i;
                buttons.appendChild(btn);
                btnArr.push(btn);
            }
            this._stepBtnCache[drum.id] = btnArr;
            row.appendChild(buttons);

            sequencer.appendChild(row);
        });
    }

    _updateGridColumns() {
        const col = `120px repeat(${this.stepCount}, 1fr)`;
        document.documentElement.style.setProperty('--grid-cols', col);
    }

    setStepCount(count) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.stop();

        const oldCount = this.stepCount;
        this.stepCount = count;

        // Resize pattern arrays (preserve existing data)
        DRUMS.forEach(drum => {
            const old = this.pattern[drum.id];
            const arr = new Array(count).fill(0);
            for (let i = 0; i < Math.min(oldCount, count); i++) arr[i] = old[i];
            this.pattern[drum.id] = arr;
        });

        // Rebuild DOM and re-bind step events
        this._buildSequencerDOM();
        this._bindStepEvents();
        this._bindKnobEvents();
        this._refreshAllSteps();
        initRotaryKnobs();

        if (wasPlaying) this.play();
    }

    // --- Event binding ---

    _bindEvents() {
        // Playback
        document.getElementById('play-btn').addEventListener('click', () => this.togglePlay());
        document.getElementById('stop-btn').addEventListener('click', () => this.stop());
        document.getElementById('clear-btn').addEventListener('click', () => this.clearPattern());
        document.getElementById('random-btn').addEventListener('click', () => this.randomizeAll());

        // Preset selector
        document.getElementById('preset-select').addEventListener('change', (e) => {
            this.loadPreset(e.target.value);
        });

        // Tempo
        const tempoSlider = document.getElementById('tempo');
        const tempoDisplay = document.getElementById('tempo-display');
        tempoSlider.addEventListener('input', (e) => {
            this.tempo = parseInt(e.target.value);
            tempoDisplay.textContent = this.tempo;
            this._updateDelayTime();
        });

        // Swing
        const swingSlider = document.getElementById('swing');
        const swingDisplay = document.getElementById('swing-display');
        swingSlider.addEventListener('input', (e) => {
            this.swing = parseInt(e.target.value) / 100;
            swingDisplay.textContent = e.target.value + '%';
        });

        // Step count
        const stepsSlider = document.getElementById('steps');
        const stepsDisplay = document.getElementById('steps-display');
        stepsSlider.addEventListener('input', (e) => {
            const count = parseInt(e.target.value);
            stepsDisplay.textContent = count;
            this.setStepCount(count);
        });

        // Master volume (F4)
        const masterVolSlider = document.getElementById('master-vol');
        this.audio.master.gain.value = parseInt(masterVolSlider.value) / 100;
        masterVolSlider.addEventListener('input', (e) => {
            this.audio.master.gain.setTargetAtTime(parseInt(e.target.value) / 100, this.audio.now, 0.01);
        });

        // Compressor (F13)
        document.getElementById('comp-threshold').addEventListener('input', (e) => {
            this.audio.setCompThreshold(parseFloat(e.target.value));
        });
        document.getElementById('comp-ratio').addEventListener('input', (e) => {
            this.audio.setCompRatio(parseFloat(e.target.value));
        });
        document.getElementById('comp-knee').addEventListener('input', (e) => {
            this.audio.setCompKnee(parseFloat(e.target.value));
        });

        // Distortion
        document.getElementById('distortion-drive').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value) / 100;
            this.audio.setDistortion(v * v * 100);
        });

        // Global filter
        document.getElementById('filter-type').addEventListener('change', (e) => {
            this.audio.setFilterType(e.target.value);
        });
        document.getElementById('filter-cutoff').addEventListener('input', (e) => {
            const freq = 20 * Math.pow(1000, parseFloat(e.target.value) / 100);
            this.audio.setFilterCutoff(freq);
        });
        document.getElementById('filter-res').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value) / 30;
            this.audio.setFilterResonance(v * v * 30);
        });

        // Reverb
        document.getElementById('reverb-mix').addEventListener('input', (e) => {
            this.audio.setReverbMix(Math.sqrt(parseFloat(e.target.value) / 100));
        });

        // Delay (tempo-synced)
        this._delaySubdiv = 0.125; // default 1/8 note fraction
        const delayTimeSelect = document.getElementById('delay-time');
        delayTimeSelect.addEventListener('change', (e) => {
            this._delaySubdiv = parseFloat(e.target.value);
            this._updateDelayTime();
        });
        document.getElementById('delay-feedback').addEventListener('input', (e) => {
            this.audio.setDelayFeedback(parseFloat(e.target.value) / 100);
        });
        document.getElementById('delay-mix').addEventListener('input', (e) => {
            this.audio.setDelayMix(parseFloat(e.target.value) / 100);
        });

        // Save / Load / Delete
        document.getElementById('save-btn').addEventListener('click', () => this._savePattern());
        document.getElementById('load-select').addEventListener('change', (e) => {
            if (e.target.value) this._loadSavedPattern(e.target.value);
        });
        document.getElementById('delete-btn').addEventListener('click', () => this._deleteSavedPattern());
        this._refreshSaveList();

        // Knob + step events (re-bindable after grid rebuild)
        this._bindKnobEvents();
        this._bindStepEvents();
    }

    _bindKnobEvents() {
        // Volume sliders
        document.querySelectorAll('.vol-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                this.volume[e.target.dataset.drum] = parseInt(e.target.value) / 100;
            });
        });

        // Pitch sliders
        document.querySelectorAll('.pitch-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                this.pitch[e.target.dataset.drum] = parseInt(e.target.value);
            });
            slider.addEventListener('dblclick', (e) => {
                e.target.value = 0;
                this.pitch[e.target.dataset.drum] = 0;
                updateRotaryKnob(e.target);
            });
        });

        // Decay sliders
        document.querySelectorAll('.decay-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                this.decay[e.target.dataset.drum] = parseInt(e.target.value) / 100;
            });
        });
    }

    _bindStepEvents() {
        document.querySelectorAll('.drum-row').forEach(row => {
            const drumId = row.dataset.drum;
            row.querySelectorAll('.step-btn').forEach((btn, step) => {
                btn.addEventListener('click', () => {
                    const cur = this.pattern[drumId][step];
                    const next = cur >= MAX_VELOCITY ? 0 : cur + 1;
                    this.pattern[drumId][step] = next;
                    this._setStepClass(btn, next);
                });

                btn.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const cur = this.pattern[drumId][step];
                    const next = cur <= 0 ? MAX_VELOCITY : cur - 1;
                    this.pattern[drumId][step] = next;
                    this._setStepClass(btn, next);
                });
            });
        });

        // Euclidean fill buttons
        document.querySelectorAll('.euclid-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const drumId = btn.dataset.drum;
                this._euclideanFill(drumId);
            });
        });

        // Per-row randomize buttons
        document.querySelectorAll('.random-row-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.randomizeRow(btn.dataset.drum);
            });
        });

        // Mute buttons
        document.querySelectorAll('.mute-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const drumId = btn.dataset.drum;
                this.toggleMute(drumId);
            });
        });

        // Solo buttons
        document.querySelectorAll('.solo-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const drumId = btn.dataset.drum;
                this.toggleSolo(drumId);
            });
        });
    }

    _euclideanFill(drumId) {
        // Each press cycles to the next hit count for interesting Euclidean patterns
        if (!this._euclidHits) this._euclidHits = {};
        const prev = this._euclidHits[drumId] || 0;
        const next = (prev % this.stepCount) + 1;
        this._euclidHits[drumId] = next;

        const rhythm = euclidean(next, this.stepCount);
        for (let i = 0; i < this.stepCount; i++) {
            this.pattern[drumId][i] = rhythm[i] ? MAX_VELOCITY : 0;
        }
        this._refreshAllSteps();
    }

    // --- Randomize ---

    randomizeAll() {
        const densityMap = {
            kick: 0.25, snare: 0.25, hihat: 0.5,
            openhat: 0.15, clap: 0.15, cowbell: 0.1,
            tomlo: 0.15, tommi: 0.15, tomhi: 0.15,
            rimshot: 0.1, maracas: 0.2
        };
        DRUMS.forEach(drum => {
            const density = densityMap[drum.id] || 0.2;
            for (let i = 0; i < this.stepCount; i++) {
                this.pattern[drum.id][i] = Math.random() < density
                    ? Math.floor(Math.random() * MAX_VELOCITY) + 1 : 0;
            }
        });
        this._refreshAllSteps();
    }

    randomizeRow(drumId) {
        for (let i = 0; i < this.stepCount; i++) {
            this.pattern[drumId][i] = Math.random() < 0.3
                ? Math.floor(Math.random() * MAX_VELOCITY) + 1 : 0;
        }
        this._refreshAllSteps();
    }

    // --- Delay tempo sync ---

    _updateDelayTime() {
        if (!this._delaySubdiv) return;
        const beatSec = 60.0 / this.tempo;
        const delaySec = beatSec * (this._delaySubdiv / 0.25);
        this.audio.setDelayTime(delaySec);
    }

    // --- Mute / Solo ---

    toggleMute(drumId) {
        this.mute[drumId] = !this.mute[drumId];
        this._updateMuteSoloUI();
    }

    toggleSolo(drumId) {
        this.solo[drumId] = !this.solo[drumId];
        this._anySolo = Object.values(this.solo).some(v => v);
        this._updateMuteSoloUI();
    }

    _isDrumAudible(drumId) {
        if (this._anySolo && !this.solo[drumId]) return false;
        if (this.mute[drumId]) return false;
        return true;
    }

    _updateMuteSoloUI() {
        DRUMS.forEach(drum => {
            const row = document.querySelector(`.drum-row[data-drum="${drum.id}"]`);
            if (!row) return;
            const audible = this._isDrumAudible(drum.id);
            row.classList.toggle('muted', !audible);
            const mBtn = row.querySelector('.mute-btn');
            const sBtn = row.querySelector('.solo-btn');
            if (mBtn) mBtn.classList.toggle('active', this.mute[drum.id]);
            if (sBtn) sBtn.classList.toggle('active', this.solo[drum.id]);
        });
    }

    // --- Save / Load ---

    _getStorage() {
        try {
            return JSON.parse(localStorage.getItem('tr808-saves') || '{}');
        } catch { return {}; }
    }

    _setStorage(data) {
        localStorage.setItem('tr808-saves', JSON.stringify(data));
    }

    serialize() {
        return {
            pattern: this.pattern,
            volume: this.volume,
            pitch: this.pitch,
            decay: this.decay,
            probability: this.probability,
            mute: this.mute,
            solo: this.solo,
            tempo: this.tempo,
            swing: this.swing,
            stepCount: this.stepCount,
            fx: {
                masterVol: parseFloat(document.getElementById('master-vol').value),
                compThreshold: parseFloat(document.getElementById('comp-threshold').value),
                compRatio: parseFloat(document.getElementById('comp-ratio').value),
                compKnee: parseFloat(document.getElementById('comp-knee').value),
                distortion: parseFloat(document.getElementById('distortion-drive').value),
                filterType: document.getElementById('filter-type').value,
                cutoff: parseFloat(document.getElementById('filter-cutoff').value),
                resonance: parseFloat(document.getElementById('filter-res').value),
                reverb: parseFloat(document.getElementById('reverb-mix').value),
                delaySubdiv: this._delaySubdiv,
                delayFeedback: parseFloat(document.getElementById('delay-feedback').value),
                delayMix: parseFloat(document.getElementById('delay-mix').value)
            }
        };
    }

    deserialize(data) {
        // Restore step count first (rebuilds DOM)
        if (data.stepCount && data.stepCount !== this.stepCount) {
            this.stepCount = data.stepCount;
        }

        // Restore pattern data
        DRUMS.forEach(drum => {
            if (data.pattern && data.pattern[drum.id]) {
                this.pattern[drum.id] = data.pattern[drum.id].slice();
            }
            if (data.volume && data.volume[drum.id] !== undefined) this.volume[drum.id] = data.volume[drum.id];
            if (data.pitch && data.pitch[drum.id] !== undefined) this.pitch[drum.id] = data.pitch[drum.id];
            if (data.decay && data.decay[drum.id] !== undefined) this.decay[drum.id] = data.decay[drum.id];
            if (data.probability && data.probability[drum.id]) this.probability[drum.id] = data.probability[drum.id].slice();
            if (data.mute) this.mute[drum.id] = !!data.mute[drum.id];
            if (data.solo) this.solo[drum.id] = !!data.solo[drum.id];
        });

        // Restore tempo / swing
        if (data.tempo) this.tempo = data.tempo;
        if (data.swing !== undefined) this.swing = data.swing;

        // O1: Recalculate cached solo flag
        this._anySolo = Object.values(this.solo).some(v => v);

        // Restore FX
        if (data.fx) {
            const fx = data.fx;
            if (fx.masterVol !== undefined) {
                document.getElementById('master-vol').value = fx.masterVol;
                this.audio.master.gain.setTargetAtTime(fx.masterVol / 100, this.audio.now, 0.01);
            }
            if (fx.compThreshold !== undefined) {
                document.getElementById('comp-threshold').value = fx.compThreshold;
                this.audio.setCompThreshold(fx.compThreshold);
            }
            if (fx.compRatio !== undefined) {
                document.getElementById('comp-ratio').value = fx.compRatio;
                this.audio.setCompRatio(fx.compRatio);
            }
            if (fx.compKnee !== undefined) {
                document.getElementById('comp-knee').value = fx.compKnee;
                this.audio.setCompKnee(fx.compKnee);
            }
            if (fx.distortion !== undefined) {
                document.getElementById('distortion-drive').value = fx.distortion;
                const v = fx.distortion / 100;
                this.audio.setDistortion(v * v * 100);
            }
            if (fx.filterType) {
                document.getElementById('filter-type').value = fx.filterType;
                this.audio.setFilterType(fx.filterType);
            }
            if (fx.cutoff !== undefined) {
                document.getElementById('filter-cutoff').value = fx.cutoff;
                this.audio.setFilterCutoff(20 * Math.pow(1000, fx.cutoff / 100));
            }
            if (fx.resonance !== undefined) {
                document.getElementById('filter-res').value = fx.resonance;
                this.audio.setFilterResonance(fx.resonance);
            }
            if (fx.reverb !== undefined) {
                document.getElementById('reverb-mix').value = fx.reverb;
                this.audio.setReverbMix(Math.sqrt(fx.reverb / 100));
            }
            if (fx.delaySubdiv !== undefined) {
                this._delaySubdiv = fx.delaySubdiv;
                document.getElementById('delay-time').value = fx.delaySubdiv;
                this._updateDelayTime();
            }
            if (fx.delayFeedback !== undefined) {
                document.getElementById('delay-feedback').value = fx.delayFeedback;
                this.audio.setDelayFeedback(fx.delayFeedback / 100);
            }
            if (fx.delayMix !== undefined) {
                document.getElementById('delay-mix').value = fx.delayMix;
                this.audio.setDelayMix(fx.delayMix / 100);
            }
        }

        // Update UI
        document.getElementById('tempo').value = this.tempo;
        document.getElementById('tempo-display').textContent = this.tempo;
        document.getElementById('swing').value = Math.round(this.swing * 100);
        document.getElementById('swing-display').textContent = Math.round(this.swing * 100) + '%';
        document.getElementById('steps').value = this.stepCount;
        document.getElementById('steps-display').textContent = this.stepCount;

        // Rebuild grid and refresh
        this._buildSequencerDOM();
        this._bindStepEvents();
        this._bindKnobEvents();
        this._refreshAllSteps();
        this._updateMuteSoloUI();
        this._updateGridColumns();
        initRotaryKnobs();
    }

    _savePattern() {
        const name = prompt('Save name:');
        if (!name || !name.trim()) return;
        const saves = this._getStorage();
        saves[name.trim()] = this.serialize();
        this._setStorage(saves);
        this._refreshSaveList();
    }

    _loadSavedPattern(name) {
        const saves = this._getStorage();
        if (!saves[name]) return;
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.stop();
        this.deserialize(saves[name]);
        if (wasPlaying) this.play();
        document.getElementById('load-select').value = '';
    }

    _deleteSavedPattern() {
        const select = document.getElementById('load-select');
        const name = select.value;
        if (!name) return;
        const saves = this._getStorage();
        delete saves[name];
        this._setStorage(saves);
        this._refreshSaveList();
    }

    _refreshSaveList() {
        const select = document.getElementById('load-select');
        const saves = this._getStorage();
        select.innerHTML = '<option value="">-- load --</option>';
        Object.keys(saves).sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    }

    // --- Preset loading ---

    loadPreset(name) {
        const preset = PRESETS[name];
        if (!preset) return;

        DRUMS.forEach(drum => this.pattern[drum.id].fill(0));

        Object.keys(preset.pattern).forEach(drumId => {
            const src = preset.pattern[drumId];
            for (let i = 0; i < this.stepCount; i++) {
                this.pattern[drumId][i] = src[i % src.length];
            }
        });

        if (preset.tempo) {
            this.tempo = preset.tempo;
            const tempoSlider = document.getElementById('tempo');
            tempoSlider.value = this.tempo;
            document.getElementById('tempo-display').textContent = this.tempo;
            updateRotaryKnob(tempoSlider);
        }

        // B12: Reset per-instrument knobs to defaults
        DRUMS.forEach(drum => {
            this.volume[drum.id] = DEFAULT_VOLUME;
            this.pitch[drum.id] = DEFAULT_PITCH;
            this.decay[drum.id] = DEFAULT_DECAY;
        });

        // Update knob slider values in DOM
        document.querySelectorAll('.vol-slider').forEach(s => {
            s.value = DEFAULT_VOLUME * 100;
            updateRotaryKnob(s);
        });
        document.querySelectorAll('.pitch-slider').forEach(s => {
            s.value = DEFAULT_PITCH;
            updateRotaryKnob(s);
        });
        document.querySelectorAll('.decay-slider').forEach(s => {
            s.value = DEFAULT_DECAY * 100;
            updateRotaryKnob(s);
        });

        // Reset compressor to defaults on preset load
        const compThreshEl = document.getElementById('comp-threshold');
        const compRatioEl = document.getElementById('comp-ratio');
        const compKneeEl = document.getElementById('comp-knee');
        compThreshEl.value = -12;
        compRatioEl.value = 4;
        compKneeEl.value = 10;
        updateRotaryKnob(compThreshEl);
        updateRotaryKnob(compRatioEl);
        updateRotaryKnob(compKneeEl);
        this.audio.setCompThreshold(-12);
        this.audio.setCompRatio(4);
        this.audio.setCompKnee(10);

        this._refreshAllSteps();
    }

    // --- Transport (Web Audio clock scheduling) ---

    togglePlay() {
        this.isPlaying ? this.stop() : this.play();
    }

    async play() {
        if (this.isPlaying) return;
        await this.audio.resume();

        this.isPlaying = true;
        this.currentStep = 0;
        this._nextStepTime = this.audio.now + 0.05;
        this._stepTimes = [];
        this._highlightIdx = 0;
        document.getElementById('play-btn').classList.add('active');

        this._startHighlightLoop();
        this._scheduler();
        if (this.visualiser) this.visualiser.start();
    }

    stop() {
        this.isPlaying = false;
        document.getElementById('play-btn').classList.remove('active');

        if (this._schedulerId) {
            clearTimeout(this._schedulerId);
            this._schedulerId = null;
        }
        this._stopHighlightLoop();
        this._stepTimes = [];
        this._highlightIdx = 0;
        this.currentStep = 0;
        this._clearStepHighlight();
        if (this.visualiser) this.visualiser.stop();
    }

    _startHighlightLoop() {
        const loop = () => {
            if (!this.isPlaying) return;
            const now = this.audio.now;
            while (this._highlightIdx < this._stepTimes.length &&
                   this._stepTimes[this._highlightIdx].time <= now) {
                this._highlightStep(this._stepTimes[this._highlightIdx].step);
                this._highlightIdx++;
            }
            this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }

    _stopHighlightLoop() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    _scheduler() {
        while (this._nextStepTime < this.audio.now + SCHEDULE_AHEAD_TIME) {
            this._scheduleStep(this.currentStep, this._nextStepTime);
            this._advanceStep();
        }
        this._schedulerId = setTimeout(() => this._scheduler(), SCHEDULE_INTERVAL);
    }

    _advanceStep() {
        const secondsPerStep = 60.0 / (this.tempo * 4);
        const nextStep = (this.currentStep + 1) % this.stepCount;

        // Swing shifts odd steps forward, but the gap between steps stays constant.
        // Compute swing offsets for current and next step independently.
        const curSwing = (this.currentStep % 2 === 1) ? secondsPerStep * this.swing * 0.66 : 0;
        const nxtSwing = (nextStep % 2 === 1) ? secondsPerStep * this.swing * 0.66 : 0;

        // Time from current step's swung position to next step's swung position
        this._nextStepTime += secondsPerStep + (nxtSwing - curSwing);
        this.currentStep = nextStep;
    }

    _scheduleStep(step, time) {
        // Schedule audio (with mute/solo and probability check)
        DRUMS.forEach(drum => {
            if (!this._isDrumAudible(drum.id)) return;
            const vel = this.pattern[drum.id][step];
            if (vel > 0) {
                const prob = this.probability[drum.id][step];
                if (prob < 100 && Math.random() * 100 >= prob) return;
                const gain = this.volume[drum.id] * VELOCITY_MAP[vel];
                this.audio.play(
                    drum.id, time, gain,
                    this.pitch[drum.id],
                    this.decay[drum.id]
                );
            }
        });

        // B1: Push to step times array for rAF-based highlight
        this._stepTimes.push({ step, time });
    }

    clearPattern() {
        DRUMS.forEach(drum => this.pattern[drum.id].fill(0));
        this._refreshAllSteps();
    }

    // --- UI helpers ---

    _setStepClass(btn, velocity) {
        btn.classList.remove('vel-1', 'vel-2', 'vel-3');
        if (velocity > 0) btn.classList.add(`vel-${velocity}`);
    }

    _refreshAllSteps() {
        DRUMS.forEach(drum => {
            const btns = this._stepBtnCache[drum.id];
            if (!btns) return;
            for (let i = 0; i < btns.length; i++) {
                this._setStepClass(btns[i], this.pattern[drum.id][i]);
            }
        });
    }

    _highlightStep(step) {
        this._clearStepHighlight();
        this._lastHighlightedStep = step;
        DRUMS.forEach(drum => {
            const btns = this._stepBtnCache[drum.id];
            if (btns && btns[step]) btns[step].classList.add('current');
        });
    }

    _clearStepHighlight() {
        const prev = this._lastHighlightedStep;
        if (prev !== undefined && prev !== null) {
            DRUMS.forEach(drum => {
                const btns = this._stepBtnCache[drum.id];
                if (btns && btns[prev]) btns[prev].classList.remove('current');
            });
        }
        this._lastHighlightedStep = null;
    }
}
