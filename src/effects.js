// Efectos visuales: partículas estela al salir y confeti al ganar.

import { DIRS } from './levels.js';

// ---- Partículas estela cuando una flecha sale ----
//
// Lanzamos varios puntos pequeños en la dirección de la flecha, partiendo
// del centro de la celda y desvaneciéndose.

export function spawnTrail(cellEl, dir, parent) {
    const rect = cellEl.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2 - parentRect.left;
    const cy = rect.top  + rect.height / 2 - parentRect.top;
    const [dr, dc] = DIRS[dir];
    // Convertimos (dr=fila ↓, dc=col →) a vector visual (x derecha, y abajo)
    const vx = dc;
    const vy = dr;
    const steps = 14;
    for (let i = 0; i < steps; i++) {
        const dot = document.createElement('span');
        dot.className = 'trail-dot';
        const dist = 14 + Math.random() * 12 + i * 6;
        const jitter = (Math.random() - 0.5) * 14;
        const perpX = -vy, perpY = vx;
        const tx = vx * dist + perpX * jitter;
        const ty = vy * dist + perpY * jitter;
        const size = 6 - i * 0.25 + Math.random() * 2;
        dot.style.cssText = `
            left: ${cx}px;
            top: ${cy}px;
            width: ${size}px;
            height: ${size}px;
            --tx: ${tx}px;
            --ty: ${ty}px;
            animation-delay: ${i * 8}ms;
        `;
        parent.appendChild(dot);
        setTimeout(() => dot.remove(), 600);
    }
}

// ---- Confeti al completar nivel ----
//
// Canvas de pantalla completa, vidas cortas (~1.6s), partículas con
// física simple (gravedad + drag + spin).

export function fireConfetti(canvas, durationMs = 1600) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
    }
    resize();

    const colors = ['#f5b454', '#6ea8ff', '#4ec795', '#ef4757', '#c084fc', '#fde68a'];
    const W = canvas.width, H = canvas.height;
    const particles = [];
    const count = 140;
    for (let i = 0; i < count; i++) {
        particles.push({
            x: W / 2 + (Math.random() - 0.5) * W * 0.3,
            y: H * 0.45 + (Math.random() - 0.5) * 40,
            vx: (Math.random() - 0.5) * 14 * dpr,
            vy: -(8 + Math.random() * 12) * dpr,
            w: (6 + Math.random() * 6) * dpr,
            h: (3 + Math.random() * 4) * dpr,
            color: colors[Math.floor(Math.random() * colors.length)],
            spin: (Math.random() - 0.5) * 0.4,
            rot: Math.random() * Math.PI * 2,
            drag: 0.985,
        });
    }
    const start = performance.now();
    const gravity = 0.5 * dpr;

    function frame(now) {
        const t = now - start;
        ctx.clearRect(0, 0, W, H);
        for (const p of particles) {
            p.vy += gravity;
            p.vx *= p.drag;
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.spin;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
        if (t < durationMs) requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, W, H);
    }
    requestAnimationFrame(frame);
}

// ---- Sacudida del tablero al fallar ----

export function shakeBoard(boardEl) {
    boardEl.classList.remove('shaking');
    // Trigger reflow para reiniciar la animación
    void boardEl.offsetWidth;
    boardEl.classList.add('shaking');
    setTimeout(() => boardEl.classList.remove('shaking'), 380);
}
