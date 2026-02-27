// WAV Export: renders the current pattern to a downloadable .wav file
// Uses OfflineAudioContext for faster-than-realtime rendering

class WavExporter {
    constructor(sequencer) {
        this.seq = sequencer;
    }

    // Main entry: render and download
    async export({ loops = 1, withFX = false }) {
        const sampleRate = this.seq.audio.context.sampleRate;
        const duration = this._calculateDuration(loops);
        // Add tail for FX decay (reverb/delay)
        const tailSeconds = withFX ? 2.5 : 0.1;
        const totalSeconds = duration + tailSeconds;
        const totalSamples = Math.ceil(totalSeconds * sampleRate);

        const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

        // Build a temporary audio engine on the offline context
        const engine = this._buildOfflineEngine(offlineCtx, withFX);

        // Schedule all steps
        this._scheduleAllSteps(engine, offlineCtx, loops);

        // Render
        const renderedBuffer = await offlineCtx.startRendering();

        // Encode and download
        const wavBlob = this._encodeWAV(renderedBuffer);
        this._download(wavBlob);
    }

    // Calculate total duration in seconds for N loops of the pattern
    _calculateDuration(loops) {
        const secondsPerStep = 60.0 / (this.seq.tempo * 4);
        return secondsPerStep * this.seq.stepCount * loops;
    }

    // Build a minimal AudioEngine-like object on the offline context
    _buildOfflineEngine(ctx, withFX) {
        const noiseBuffer = this._createNoiseBuffer(ctx);
        const master = ctx.createGain();
        const state = this.seq.serialize();
        const fx = state.fx || {};

        master.gain.value = (fx.masterVol !== undefined ? fx.masterVol : 80) / 100;

        let output;

        if (withFX) {
            // Compressor
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = fx.compThreshold !== undefined ? fx.compThreshold : -12;
            compressor.knee.value = fx.compKnee !== undefined ? fx.compKnee : 10;
            compressor.ratio.value = fx.compRatio !== undefined ? fx.compRatio : 4;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;

            // Distortion
            const distortion = ctx.createWaveShaper();
            const driveRaw = fx.distortion !== undefined ? fx.distortion : 0;
            const driveNorm = driveRaw / 100;
            distortion.curve = this._makeDistortionCurve(driveNorm * driveNorm * 100);
            distortion.oversample = '4x';

            // Filter
            const filter = ctx.createBiquadFilter();
            filter.type = fx.filterType || 'lowpass';
            filter.frequency.value = fx.cutoff !== undefined ? 20 * Math.pow(1000, fx.cutoff / 100) : 20000;
            filter.Q.value = fx.resonance !== undefined ? fx.resonance : 0;

            // Reverb
            const reverbDry = ctx.createGain();
            const reverbWet = ctx.createGain();
            const reverbConv = ctx.createConvolver();
            const reverbMix = fx.reverb !== undefined ? Math.sqrt(fx.reverb / 100) : 0;
            reverbDry.gain.value = 1 - reverbMix;
            reverbWet.gain.value = reverbMix;
            const reverbSize = fx.reverbSize !== undefined ? fx.reverbSize : 50;
            const rvDuration = 0.2 + (reverbSize / 100) * 4.8;
            const rvDecay = 4 - (reverbSize / 100) * 2.8;
            reverbConv.buffer = this._createReverbIR(ctx, rvDuration, rvDecay);
            const reverbOut = ctx.createGain();

            // Delay
            const delayDry = ctx.createGain();
            const delayWet = ctx.createGain();
            const delayL = ctx.createDelay(2);
            const delayR = ctx.createDelay(2);
            const feedbackL = ctx.createGain();
            const feedbackR = ctx.createGain();
            const delayMerge = ctx.createChannelMerger(2);

            const subdivFrac = fx.delaySubdiv !== undefined ? fx.delaySubdiv : 0.125;
            const delayTimeSec = (60 / this.seq.tempo) * (subdivFrac * 4);
            delayL.delayTime.value = delayTimeSec;
            delayR.delayTime.value = delayTimeSec;

            const fb = fx.delayFeedback !== undefined ? Math.min(fx.delayFeedback / 100, 0.9) : 0;
            feedbackL.gain.value = fb;
            feedbackR.gain.value = fb;

            const delayMixVal = fx.delayMix !== undefined ? fx.delayMix / 100 : 0;
            delayDry.gain.value = 1 - delayMixVal;
            delayWet.gain.value = delayMixVal;

            // Wire FX chain
            master.connect(compressor);
            compressor.connect(distortion);
            distortion.connect(filter);

            filter.connect(reverbDry);
            filter.connect(reverbWet);
            reverbWet.connect(reverbConv);
            reverbConv.connect(reverbOut);
            reverbDry.connect(reverbOut);

            reverbOut.connect(delayDry);
            delayDry.connect(ctx.destination);

            reverbOut.connect(delayL);
            delayL.connect(feedbackL);
            feedbackL.connect(delayR);
            delayR.connect(feedbackR);
            feedbackR.connect(delayL);

            delayL.connect(delayMerge, 0, 0);
            delayR.connect(delayMerge, 0, 1);
            delayMerge.connect(delayWet);
            delayWet.connect(ctx.destination);

            output = master;
        } else {
            // Clean: master straight to destination
            master.connect(ctx.destination);
            output = master;
        }

        // Build a thin engine facade that the play methods can use
        const engine = {
            context: ctx,
            master: master,
            voiceMode: state.voiceMode || '808',
            _noiseBuffer: noiseBuffer,
            get now() { return ctx.currentTime; },
        };

        // Copy all prototype methods from AudioEngine onto the facade
        const proto = AudioEngine.prototype;
        Object.getOwnPropertyNames(proto).forEach(name => {
            if (name === 'constructor') return;
            const desc = Object.getOwnPropertyDescriptor(proto, name);
            // Skip getters/setters (e.g. 'now') — handled on facade directly
            if (desc.get || desc.set) return;
            if (typeof desc.value === 'function') {
                engine[name] = desc.value.bind(engine);
            }
        });

        return engine;
    }

    // Schedule all pattern steps onto the offline engine
    _scheduleAllSteps(engine, ctx, loops) {
        const seq = this.seq;
        const secondsPerStep = 60.0 / (seq.tempo * 4);
        let time = 0.05; // small offset to avoid t=0 issues

        for (let loop = 0; loop < loops; loop++) {
            for (let step = 0; step < seq.stepCount; step++) {
                const globalStep = loop * seq.stepCount + step;
                // Apply swing
                const swingOffset = (globalStep % 2 === 1) ? secondsPerStep * seq.swing * 0.66 : 0;
                const stepTime = time + swingOffset;

                // Schedule each drum
                DRUMS.forEach(drum => {
                    if (!seq._isDrumAudible(drum.id)) return;
                    const vel = seq.pattern[drum.id][step];
                    if (vel > 0) {
                        const prob = seq.probability[drum.id][step];
                        if (prob < 100 && Math.random() * 100 >= prob) return;
                        const gain = seq.volume[drum.id] * VELOCITY_MAP[vel];
                        engine.play(drum.id, stepTime, gain, seq.pitch[drum.id], seq.decay[drum.id]);
                    }
                });

                time += secondsPerStep;
            }
        }
    }

    // WAV encoding (16-bit PCM, stereo)
    _encodeWAV(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const length = buffer.length;
        const bytesPerSample = 2;
        const blockAlign = numChannels * bytesPerSample;
        const dataSize = length * blockAlign;
        const headerSize = 44;
        const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
        const view = new DataView(arrayBuffer);

        // RIFF header
        this._writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        this._writeString(view, 8, 'WAVE');

        // fmt chunk
        this._writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);           // chunk size
        view.setUint16(20, 1, true);            // PCM format
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);           // bits per sample

        // data chunk
        this._writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // Interleave channels and write samples
        const channels = [];
        for (let ch = 0; ch < numChannels; ch++) {
            channels.push(buffer.getChannelData(ch));
        }

        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, channels[ch][i]));
                const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, int16, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    _writeString(view, offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    _download(blob) {
        const seq = this.seq;
        const mode = seq.audio.voiceMode || '808';

        // Try to get pattern name from load-select
        const loadSelect = document.getElementById('load-select');
        const patternName = (loadSelect && loadSelect.value) ? loadSelect.value : '';
        const namePart = patternName ? patternName.replace(/[^a-zA-Z0-9_-]/g, '_') + '-' : '';

        const filename = `tr${mode}-${namePart}${seq.tempo}bpm.wav`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // --- Utilities (duplicated from AudioEngine for offline context) ---

    _createNoiseBuffer(ctx) {
        const length = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
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

    _createReverbIR(ctx, duration, decayRate) {
        const length = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decayRate);
            }
        }
        return buffer;
    }
}
