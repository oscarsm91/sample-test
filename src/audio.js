// Sonido de motor sintético: un oscilador "sawtooth" cuyo pitch depende
// de la velocidad del coche. Se inicializa al primer click/tap (requisito
// de los navegadores).

export class EngineSound {
    constructor() {
        this.ctx = null;
        this.osc = null;
        this.gain = null;
        this.filter = null;
        this.started = false;
    }

    start() {
        if (this.started) return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.osc = this.ctx.createOscillator();
        this.osc.type = 'sawtooth';
        this.osc.frequency.value = 60;

        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 600;

        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.04;

        this.osc.connect(this.filter).connect(this.gain).connect(this.ctx.destination);
        this.osc.start();
        this.started = true;
    }

    update(speedMs, throttle) {
        if (!this.started) return;
        const absV = Math.abs(speedMs);
        const baseFreq = 55 + absV * 9;        // pitch sube con velocidad
        const target = throttle ? baseFreq * 1.25 : baseFreq;
        this.osc.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.08);
        const targetGain = 0.025 + Math.min(0.08, absV / 80);
        this.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
    }
}
