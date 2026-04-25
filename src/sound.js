// SFX sintetizados con WebAudio. Sin assets externos.
// El AudioContext se crea bajo demanda (políticas de autoplay del navegador).

let ctx = null;
let muted = loadMuted();

function ensureCtx() {
    if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
}

function tone({ freq = 440, type = 'sine', dur = 0.18, gain = 0.18, attack = 0.005, release = 0.12, slideTo = null, slideTime = null }) {
    if (muted) return;
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo != null) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, now + (slideTime ?? dur));
    }
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur + release);
    osc.connect(g).connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + release + 0.05);
}

function noise({ dur = 0.18, gain = 0.12, filterFreq = 800 }) {
    if (muted) return;
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime;
    const buffer = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter).connect(g).connect(c.destination);
    src.start(now);
    src.stop(now + dur);
}

export const sfx = {
    clear() {
        // Whoosh ascendente
        tone({ freq: 600, type: 'triangle', dur: 0.12, gain: 0.18, slideTo: 1100, slideTime: 0.1 });
        noise({ dur: 0.12, gain: 0.05, filterFreq: 2200 });
    },
    blocked() {
        // Buzz grave
        tone({ freq: 220, type: 'sawtooth', dur: 0.16, gain: 0.16, slideTo: 110, slideTime: 0.15, release: 0.05 });
    },
    win() {
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
        notes.forEach((n, i) =>
            setTimeout(() => tone({ freq: n, type: 'triangle', dur: 0.18, gain: 0.18, attack: 0.01 }), i * 90)
        );
    },
    lose() {
        [392, 311, 233].forEach((n, i) =>
            setTimeout(() => tone({ freq: n, type: 'square', dur: 0.22, gain: 0.16 }), i * 130)
        );
    },
    tap() {
        tone({ freq: 1400, type: 'sine', dur: 0.04, gain: 0.05, release: 0.04 });
    },
    heart() {
        // Quiebra el corazón: pop + decaimiento
        tone({ freq: 480, type: 'square', dur: 0.08, gain: 0.16, slideTo: 180, slideTime: 0.07, release: 0.04 });
    },
};

export function setMuted(m) {
    muted = m;
    saveMuted(m);
}
export function isMuted() { return muted; }

function saveMuted(m) { try { localStorage.setItem('arrows-mute', m ? '1' : '0'); } catch {} }
function loadMuted() { try { return localStorage.getItem('arrows-mute') === '1'; } catch { return false; } }
