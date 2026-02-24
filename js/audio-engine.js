// Audio synthesis engine for TR-808 drum sounds
// Supports scheduled playback, per-instrument pitch/decay, and a master output bus.
class AudioEngine {
    constructor() {
        // iOS: set audio session to 'playback' so sound plays even with silent switch on
        if (navigator.audioSession) {
            navigator.audioSession.type = 'playback';
        }
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this._noiseBuffer = this._createNoiseBuffer();

        // FX chain: master → compressor → distortion → filter → reverb → delay → analyser → destination
        this.master = this.context.createGain();

        // Compressor (F13)
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -12;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;

        // Distortion (waveshaper)
        this.distortion = this.context.createWaveShaper();
        this.distortion.curve = this._makeDistortionCurve(0);
        this.distortion.oversample = '4x';

        // Filter
        this.filter = this.context.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 20000;
        this.filter.Q.value = 0;

        // Reverb (convolver on a send bus)
        this._reverbDry = this.context.createGain();
        this._reverbWet = this.context.createGain();
        this._reverbConvolver = this.context.createConvolver();
        this._reverbConvolver.buffer = this._createReverbIR(2, 2);
        this._reverbDry.gain.value = 1;
        this._reverbWet.gain.value = 0;

        // Reverb merge point (collects dry + wet before delay)
        this._reverbOut = this.context.createGain();

        // Delay (stereo ping-pong)
        this._delayDry = this.context.createGain();
        this._delayWet = this.context.createGain();
        this._delayL = this.context.createDelay(2);
        this._delayR = this.context.createDelay(2);
        this._feedbackL = this.context.createGain();
        this._feedbackR = this.context.createGain();
        this._delayMerge = this.context.createChannelMerger(2);

        this._delayL.delayTime.value = 0.25;
        this._delayR.delayTime.value = 0.25;
        this._feedbackL.gain.value = 0;
        this._feedbackR.gain.value = 0;
        this._delayDry.gain.value = 1;
        this._delayWet.gain.value = 0;

        // Analyser (F14)
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 2048;

        // Wire: master → compressor → distortion → filter → reverbDry  → reverbOut
        //                                                 → reverbWet → convolver → reverbOut
        this.master.connect(this.compressor);
        this.compressor.connect(this.distortion);
        this.distortion.connect(this.filter);
        this.filter.connect(this._reverbDry);
        this.filter.connect(this._reverbWet);
        this._reverbWet.connect(this._reverbConvolver);
        this._reverbConvolver.connect(this._reverbOut);
        this._reverbDry.connect(this._reverbOut);

        // reverbOut → delayDry → destination (clean path)
        // reverbOut → delayL → feedbackL → delayR → feedbackR → delayL (ping-pong)
        //             delayL → merger(L), delayR → merger(R) → delayWet → destination
        this._reverbOut.connect(this._delayDry);
        this._delayDry.connect(this.analyser);

        this._reverbOut.connect(this._delayL);
        this._delayL.connect(this._feedbackL);
        this._feedbackL.connect(this._delayR);
        this._delayR.connect(this._feedbackR);
        this._feedbackR.connect(this._delayL);

        this._delayL.connect(this._delayMerge, 0, 0);
        this._delayR.connect(this._delayMerge, 0, 1);
        this._delayMerge.connect(this._delayWet);
        this._delayWet.connect(this.analyser);
        this.analyser.connect(this.context.destination);
    }

    // --- Compressor control (F13) ---

    setCompThreshold(value) {
        this.compressor.threshold.setTargetAtTime(value, this.now, 0.01);
    }

    setCompRatio(value) {
        this.compressor.ratio.setTargetAtTime(value, this.now, 0.01);
    }

    setCompKnee(value) {
        this.compressor.knee.setTargetAtTime(value, this.now, 0.01);
    }

    // --- Analyser (F14) ---

    getWaveformData() {
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(data);
        return data;
    }

    // --- Distortion control ---

    setDistortion(amount) {
        // amount: 0-100
        this.distortion.curve = this._makeDistortionCurve(amount);
    }

    _makeDistortionCurve(amount) {
        const samples = 8192;
        const curve = new Float32Array(samples);
        const k = amount * 4;
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = k === 0 ? x : ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    // --- Global filter control ---

    setFilterType(type) {
        this.filter.type = type;
    }

    setFilterCutoff(freq) {
        this.filter.frequency.setTargetAtTime(freq, this.now, 0.01);
    }

    setFilterResonance(q) {
        this.filter.Q.setTargetAtTime(q, this.now, 0.01);
    }

    // --- Delay control ---

    setDelayTime(seconds) {
        this._delayL.delayTime.setTargetAtTime(seconds, this.now, 0.01);
        this._delayR.delayTime.setTargetAtTime(seconds, this.now, 0.01);
    }

    setDelayFeedback(amount) {
        // amount: 0-0.9 (capped to prevent runaway)
        const fb = Math.min(amount, 0.9);
        this._feedbackL.gain.setTargetAtTime(fb, this.now, 0.01);
        this._feedbackR.gain.setTargetAtTime(fb, this.now, 0.01);
    }

    setDelayMix(wet) {
        // wet: 0-1
        this._delayDry.gain.setTargetAtTime(1 - wet, this.now, 0.01);
        this._delayWet.gain.setTargetAtTime(wet, this.now, 0.01);
    }

    // --- Reverb control ---

    setReverbMix(wet) {
        // wet: 0-1
        this._reverbDry.gain.setTargetAtTime(1 - wet, this.now, 0.01);
        this._reverbWet.gain.setTargetAtTime(wet, this.now, 0.01);
    }

    _createReverbIR(duration, decayRate) {
        const length = this.context.sampleRate * duration;
        const buffer = this.context.createBuffer(2, length, this.context.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decayRate);
            }
        }
        return buffer;
    }

    async resume() {
        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    get now() {
        return this.context.currentTime;
    }

    // --- Public: play a named drum at a scheduled time ---
    // time:  AudioContext time to start (for lookahead scheduling)
    // gain:  0-1 combined volume * velocity
    // pitch: -24 to +24 semitones (0 = default)
    // decay: 0-1 multiplier on envelope length (0.5 = default)

    play(drumType, time, gain, pitch, decay) {
        switch (drumType) {
            case 'kick':    this._playKick(time, gain, pitch, decay); break;
            case 'snare':   this._playSnare(time, gain, pitch, decay); break;
            case 'hihat':   this._playHiHat(false, time, gain, pitch, decay); break;
            case 'openhat': this._playHiHat(true, time, gain, pitch, decay); break;
            case 'clap':    this._playClap(time, gain, pitch, decay); break;
            case 'cowbell': this._playCowbell(time, gain, pitch, decay); break;
            case 'tomlo':   this._playTom(time, gain, pitch, decay, 100); break;
            case 'tommi':   this._playTom(time, gain, pitch, decay, 160); break;
            case 'tomhi':   this._playTom(time, gain, pitch, decay, 240); break;
            case 'rimshot': this._playRimshot(time, gain, pitch, decay); break;
            case 'maracas': this._playMaracas(time, gain, pitch, decay); break;
        }
    }

    // --- Pitch helper: semitones to frequency ratio ---

    _pitchRatio(semitones) {
        return Math.pow(2, semitones / 12);
    }

    // --- Private: individual drum synthesis ---

    _playKick(t, gain, pitch, decay) {
        const ratio = this._pitchRatio(pitch);
        const dur = 0.5 * (0.2 + decay * 1.6);

        const osc = this.context.createOscillator();
        const env = this.context.createGain();

        osc.frequency.setValueAtTime(60 * ratio, t);
        osc.frequency.exponentialRampToValueAtTime(0.01, t + dur);

        env.gain.setValueAtTime(gain, t);
        env.gain.exponentialRampToValueAtTime(0.01, t + dur);

        osc.connect(env).connect(this.master);
        osc.start(t);
        osc.stop(t + dur);

        this._playClickNoise(t, 0.01, gain);
    }

    _playSnare(t, gain, pitch, decay) {
        const ratio = this._pitchRatio(pitch);
        const noiseDur = 0.2 * (0.3 + decay * 1.4);
        const toneDur = 0.1 * (0.3 + decay * 1.4);

        // Noise layer
        const noiseSrc = this._createNoiseSource();
        const noiseEnv = this.context.createGain();
        const noiseHPF = this.context.createBiquadFilter();

        noiseHPF.type = 'highpass';
        noiseHPF.frequency.value = 1000 * ratio;
        noiseEnv.gain.setValueAtTime(0.5 * gain, t);
        noiseEnv.gain.exponentialRampToValueAtTime(0.01, t + noiseDur);

        noiseSrc.connect(noiseHPF).connect(noiseEnv).connect(this.master);
        noiseSrc.start(t);
        noiseSrc.stop(t + noiseDur);

        // Tone layer
        const osc = this.context.createOscillator();
        const toneEnv = this.context.createGain();

        osc.frequency.value = 200 * ratio;
        toneEnv.gain.setValueAtTime(0.2 * gain, t);
        toneEnv.gain.exponentialRampToValueAtTime(0.01, t + toneDur);

        osc.connect(toneEnv).connect(this.master);
        osc.start(t);
        osc.stop(t + toneDur);
    }

    _playHiHat(isOpen, t, gain, pitch, decay) {
        const ratio = this._pitchRatio(pitch);
        const baseDur = isOpen ? 0.3 : 0.05;
        const dur = baseDur * (0.3 + decay * 1.4);
        const freq = (isOpen ? 7000 : 10000) * ratio;

        const noiseSrc = this._createNoiseSource();
        const env = this.context.createGain();
        const hpf = this.context.createBiquadFilter();

        hpf.type = 'highpass';
        hpf.frequency.value = Math.min(freq, 20000);
        env.gain.setValueAtTime(0.3 * gain, t);
        env.gain.exponentialRampToValueAtTime(0.01, t + dur);

        noiseSrc.connect(hpf).connect(env).connect(this.master);
        noiseSrc.start(t);
        noiseSrc.stop(t + dur);
    }

    _playClap(t, gain, pitch, decay) {
        const BURST_COUNT = 3;
        const BURST_GAP = 0.03 * (0.5 + decay);

        for (let i = 0; i < BURST_COUNT; i++) {
            const offset = i * BURST_GAP;
            const noiseSrc = this._createNoiseSource();
            const env = this.context.createGain();
            const bpf = this.context.createBiquadFilter();

            bpf.type = 'bandpass';
            bpf.frequency.value = 1000 * this._pitchRatio(pitch);
            bpf.Q.value = 1;
            env.gain.setValueAtTime(0.5 * gain, t + offset);
            env.gain.exponentialRampToValueAtTime(0.01, t + offset + BURST_GAP);

            noiseSrc.connect(bpf).connect(env).connect(this.master);
            noiseSrc.start(t + offset);
            noiseSrc.stop(t + offset + BURST_GAP);
        }
    }

    _playCowbell(t, gain, pitch, decay) {
        const ratio = this._pitchRatio(pitch);
        const dur = 0.1 * (0.3 + decay * 1.4);

        const osc1 = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        const env = this.context.createGain();

        osc1.frequency.value = 800 * ratio;
        osc2.frequency.value = 540 * ratio;
        env.gain.setValueAtTime(0.5 * gain, t);
        env.gain.exponentialRampToValueAtTime(0.01, t + dur);

        osc1.connect(env);
        osc2.connect(env);
        env.connect(this.master);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + dur);
        osc2.stop(t + dur);
    }

    _playTom(t, gain, pitch, decay, baseFreq) {
        const ratio = this._pitchRatio(pitch);
        const dur = 0.25 * (0.2 + decay * 1.6);
        const freq = baseFreq * ratio;

        const osc = this.context.createOscillator();
        const env = this.context.createGain();

        osc.frequency.setValueAtTime(freq * 1.5, t);
        osc.frequency.exponentialRampToValueAtTime(freq, t + 0.03);

        env.gain.setValueAtTime(gain, t);
        env.gain.exponentialRampToValueAtTime(0.01, t + dur);

        osc.connect(env).connect(this.master);
        osc.start(t);
        osc.stop(t + dur);
    }

    _playRimshot(t, gain, pitch, decay) {
        const ratio = this._pitchRatio(pitch);
        const dur = 0.03 * (0.3 + decay * 1.4);

        // Triangle oscillator for metallic ring
        const osc = this.context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 3400 * ratio;
        const oscEnv = this.context.createGain();
        oscEnv.gain.setValueAtTime(0.4 * gain, t);
        oscEnv.gain.exponentialRampToValueAtTime(0.01, t + dur * 2);
        osc.connect(oscEnv).connect(this.master);
        osc.start(t);
        osc.stop(t + dur * 2);

        // Short noise burst
        const noiseSrc = this._createNoiseSource();
        const noiseEnv = this.context.createGain();
        const bpf = this.context.createBiquadFilter();
        bpf.type = 'bandpass';
        bpf.frequency.value = 4000 * ratio;
        bpf.Q.value = 2;
        noiseEnv.gain.setValueAtTime(0.5 * gain, t);
        noiseEnv.gain.exponentialRampToValueAtTime(0.01, t + dur);
        noiseSrc.connect(bpf).connect(noiseEnv).connect(this.master);
        noiseSrc.start(t);
        noiseSrc.stop(t + dur);
    }

    _playMaracas(t, gain, pitch, decay) {
        const ratio = this._pitchRatio(pitch);
        const dur = 0.04 * (0.3 + decay * 1.4);

        const noiseSrc = this._createNoiseSource();
        const env = this.context.createGain();
        const hpf = this.context.createBiquadFilter();

        hpf.type = 'highpass';
        hpf.frequency.value = Math.min(12000 * ratio, 20000);
        env.gain.setValueAtTime(0.25 * gain, t);
        env.gain.exponentialRampToValueAtTime(0.01, t + dur);

        noiseSrc.connect(hpf).connect(env).connect(this.master);
        noiseSrc.start(t);
        noiseSrc.stop(t + dur);
    }

    _playClickNoise(time, duration, gain) {
        const noiseSrc = this._createNoiseSource();
        const env = this.context.createGain();
        const hpf = this.context.createBiquadFilter();

        hpf.type = 'highpass';
        hpf.frequency.value = 5000;
        env.gain.setValueAtTime(0.5 * gain, time);
        env.gain.exponentialRampToValueAtTime(0.01, time + duration);

        noiseSrc.connect(hpf).connect(env).connect(this.master);
        noiseSrc.start(time);
        noiseSrc.stop(time + duration);
    }

    // --- Noise buffer utilities ---

    _createNoiseSource() {
        const src = this.context.createBufferSource();
        src.buffer = this._noiseBuffer;
        return src;
    }

    _createNoiseBuffer() {
        const length = this.context.sampleRate * 2;
        const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }
}
