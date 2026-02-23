// Color wheel picker for changing the UI accent colour
class ColorWheel {
    constructor() {
        this.canvas = document.getElementById('color-wheel');
        this.ctx = this.canvas.getContext('2d');
        this.toggle = document.getElementById('color-toggle');
        this.popup = document.getElementById('color-popup');
        this.indicator = document.getElementById('color-wheel-indicator');
        this.size = this.canvas.width;
        this.center = this.size / 2;
        this.radius = this.center - 4;
        this.isDragging = false;

        this.drawWheel();
        this.setupEvents();
        this.positionIndicator(18);
    }

    drawWheel() {
        const { ctx, center, radius, size } = this;
        ctx.clearRect(0, 0, size, size);

        for (let angle = 0; angle < 360; angle++) {
            const startAngle = (angle - 1) * Math.PI / 180;
            const endAngle = (angle + 1) * Math.PI / 180;

            const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
            gradient.addColorStop(0, `hsl(${angle}, 20%, 90%)`);
            gradient.addColorStop(0.5, `hsl(${angle}, 100%, 60%)`);
            gradient.addColorStop(1, `hsl(${angle}, 100%, 30%)`);

            ctx.beginPath();
            ctx.moveTo(center, center);
            ctx.arc(center, center, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
        }
    }

    setupEvents() {
        this.toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.popup.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!this.popup.contains(e.target) && e.target !== this.toggle) {
                this.popup.classList.remove('open');
            }
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.pickColor(e);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) this.pickColor(e);
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isDragging = true;
            this.pickColorFromTouch(e);
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.isDragging) this.pickColorFromTouch(e);
        });

        this.canvas.addEventListener('touchend', () => {
            this.isDragging = false;
        });
    }

    pickColorFromTouch(e) {
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        this.pickColor({
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }

    pickColor(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const dx = x - this.center;
        const dy = y - this.center;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.radius) return;

        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angle < 0) angle += 360;

        this.applyHue(Math.round(angle));
        this.indicator.style.left = x + 'px';
        this.indicator.style.top = y + 'px';
    }

    positionIndicator(hue) {
        const angle = hue * Math.PI / 180;
        const r = this.radius * 0.65;
        this.indicator.style.left = (this.center + r * Math.cos(angle)) + 'px';
        this.indicator.style.top = (this.center + r * Math.sin(angle)) + 'px';
    }

    applyHue(hue) {
        document.documentElement.style.setProperty('--accent-h', hue);
    }
}
