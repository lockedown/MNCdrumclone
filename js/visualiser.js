// Waveform visualiser using AnalyserNode (F14)
class Visualiser {
    constructor(canvasId, audioEngine) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.audio = audioEngine;
        this._rafId = null;
        this._running = false;

        // Responsive canvas sizing
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = Math.floor(rect.width);
        // Height stays at the HTML attribute value (60)
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._draw();
    }

    stop() {
        this._running = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._drawIdle();
    }

    _draw() {
        if (!this._running) return;

        const { canvas, ctx, audio } = this;
        const width = canvas.width;
        const height = canvas.height;
        const data = audio.getWaveformData();
        const bufferLength = data.length;

        // Get accent colour from CSS
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff6b35';

        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-deep').trim() || '#0a0a1a';
        ctx.fillRect(0, 0, width, height);

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = accent;
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = data[i] / 128.0;
            const y = (v * height) / 2;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Subtle glow effect
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.15;
        ctx.stroke();
        ctx.globalAlpha = 1;

        this._rafId = requestAnimationFrame(() => this._draw());
    }

    _drawIdle() {
        const { canvas, ctx } = this;
        const width = canvas.width;
        const height = canvas.height;

        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-deep').trim() || '#0a0a1a';
        ctx.fillRect(0, 0, width, height);

        // Flat center line
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff6b35';
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}
