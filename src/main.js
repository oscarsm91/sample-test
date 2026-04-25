import { DIRS, isPathClear, levelForIndex, countArrows } from './levels.js';
import { sfx, isMuted, setMuted } from './sound.js';
import { spawnTrail, fireConfetti, shakeBoard } from './effects.js';

const STORAGE_KEY = 'arrows-progress-v2';
const STARS_KEY   = 'arrows-stars-v1';
const MAX_LIVES   = 3;

const boardEl       = document.getElementById('board');
const livesEl       = document.getElementById('lives');
const levelNumEl    = document.getElementById('level-num');
const restartBtn    = document.getElementById('restart');
const muteBtn       = document.getElementById('mute');
const overlayEl     = document.getElementById('overlay');
const overlayEmoji  = document.getElementById('overlay-emoji');
const overlayTitle  = document.getElementById('overlay-title');
const overlayText   = document.getElementById('overlay-text');
const overlayStars  = document.getElementById('overlay-stars');
const overlayAction = document.getElementById('overlay-action');
const totalStarsEl  = document.getElementById('total-stars');
const trailLayer    = document.getElementById('trail-layer');
const confettiCanvas = document.getElementById('confetti');
const hintEl        = document.getElementById('hint');

const state = {
    levelIdx: loadProgress(),
    grid: null,
    rows: 0,
    cols: 0,
    lives: MAX_LIVES,
    arrowsLeft: 0,
    busy: false,
    finished: false,
    outcome: null,
};

renderMute();
updateTotalStars();
startLevel(state.levelIdx);

restartBtn.addEventListener('click', () => {
    if (state.busy) return;
    sfx.tap();
    startLevel(state.levelIdx);
});

muteBtn.addEventListener('click', () => {
    setMuted(!isMuted());
    renderMute();
    if (!isMuted()) sfx.tap();
});

overlayAction.addEventListener('click', () => {
    sfx.tap();
    if (state.outcome === 'won') startLevel(state.levelIdx + 1);
    else                          startLevel(state.levelIdx);
});

window.addEventListener('resize', fitBoard);

function startLevel(idx) {
    state.levelIdx = idx;
    saveProgress(idx);

    const grid = levelForIndex(idx);
    state.grid = grid;
    state.rows = grid.length;
    state.cols = grid[0].length;
    state.lives = MAX_LIVES;
    state.arrowsLeft = countArrows(grid);
    state.finished = false;
    state.outcome = null;
    state.busy = false;

    levelNumEl.textContent = String(idx + 1);
    overlayEl.classList.add('hidden');
    boardEl.classList.remove('shaking');
    renderLives();
    renderBoard();
    fitBoard();
    refreshTappableHints();
}

// ---------- Render ----------

function renderLives() {
    livesEl.innerHTML = '';
    for (let i = 0; i < MAX_LIVES; i++) {
        const lost = i >= state.lives;
        livesEl.insertAdjacentHTML('beforeend', `
            <svg class="heart${lost ? ' lost' : ''}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 21s-7.4-4.6-9.6-9.5C1 7.7 3.6 4 7.3 4c2 0 3.5 1 4.7 2.5C13.2 5 14.7 4 16.7 4 20.4 4 23 7.7 21.6 11.5 19.4 16.4 12 21 12 21z"/>
            </svg>
        `);
    }
}

function arrowSvg() {
    return `<svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
    </svg>`;
}

function wallSvg() {
    return `<svg class="wall-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
        <path d="M3 7h18M3 12h18M3 17h18"/>
        <path d="M8 7v5M14 12v5M11 7v0M5 12v5M19 12v5M16 7v5"/>
    </svg>`;
}

function renderBoard() {
    boardEl.style.gridTemplateRows    = `repeat(${state.rows}, var(--cell-size))`;
    boardEl.style.gridTemplateColumns = `repeat(${state.cols}, var(--cell-size))`;
    boardEl.innerHTML = '';
    let stagger = 0;
    for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
            const cell = state.grid[r][c];
            const div = document.createElement('div');
            div.className = 'cell entering';
            div.dataset.r = r;
            div.dataset.c = c;
            // Distancia al centro para retraso de entrada radial
            const dr = r - state.rows / 2;
            const dc = c - state.cols / 2;
            const dist = Math.sqrt(dr * dr + dc * dc);
            div.style.setProperty('--enter-delay', `${(dist * 35 + stagger) | 0}ms`);
            stagger += 4;

            if (cell?.kind === 'arrow') {
                div.classList.add('arrow', cell.dir);
                div.innerHTML = arrowSvg();
                div.addEventListener('click', onArrowTap);
                div.addEventListener('mouseenter', onCellHover);
                div.addEventListener('mouseleave', clearPreview);
            } else if (cell?.kind === 'wall') {
                div.classList.add('wall');
                div.innerHTML = wallSvg();
            } else {
                div.classList.add('empty');
            }
            boardEl.appendChild(div);
        }
    }
    // Quita la marca 'entering' cuando termina la animación
    setTimeout(() => {
        for (const el of boardEl.querySelectorAll('.entering')) el.classList.remove('entering');
    }, 800);
}

function fitBoard() {
    const wrap = boardEl.parentElement;
    const w = wrap.clientWidth - 24;
    const h = wrap.clientHeight - 24;
    if (w <= 0 || h <= 0) return;
    const gap = 8;
    const padding = 24;
    const maxByW = (w - padding - gap * (state.cols - 1)) / state.cols;
    const maxByH = (h - padding - gap * (state.rows - 1)) / state.rows;
    const size = Math.max(36, Math.min(80, Math.floor(Math.min(maxByW, maxByH))));
    boardEl.style.setProperty('--cell-size', `${size}px`);
}

// Marca con la clase .tappable las flechas con camino libre, para feedback
// continuo. Se recalcula tras cada cambio del tablero.
function refreshTappableHints() {
    const cells = boardEl.children;
    for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
            const idx = r * state.cols + c;
            const el = cells[idx];
            if (!el) continue;
            const cell = state.grid[r][c];
            const can = cell?.kind === 'arrow' && isPathClear(state.grid, r, c);
            el.classList.toggle('tappable', !!can);
        }
    }
}

// ---------- Interacción ----------

function onArrowTap(e) {
    if (state.busy || state.finished) return;
    const div = e.currentTarget;
    const r = +div.dataset.r;
    const c = +div.dataset.c;
    const cell = state.grid[r][c];
    if (!cell || cell.kind !== 'arrow') return;

    if (isPathClear(state.grid, r, c)) {
        clearArrow(div, r, c, cell.dir);
    } else {
        loseLife(div, r, c, cell.dir);
    }
}

function clearArrow(div, r, c, dir) {
    state.busy = true;
    sfx.clear();
    spawnTrail(div, dir, trailLayer);
    div.classList.add('exiting');
    div.style.pointerEvents = 'none';
    state.grid[r][c] = null;
    state.arrowsLeft--;

    const handle = () => {
        div.classList.remove('arrow', 'exiting', 'tappable',
            'up', 'down', 'left', 'right',
            'up-right', 'up-left', 'down-right', 'down-left');
        div.classList.add('empty');
        div.innerHTML = '';
        div.removeEventListener('click', onArrowTap);
        state.busy = false;
        refreshTappableHints();
        if (state.arrowsLeft === 0) win();
    };
    div.addEventListener('transitionend', handle, { once: true });
    setTimeout(() => { if (state.busy) handle(); }, 700);
}

function loseLife(div, r, c, dir) {
    state.lives--;
    sfx.blocked();
    sfx.heart();
    div.classList.add('blocked');
    setTimeout(() => div.classList.remove('blocked'), 380);
    shakeBoard(boardEl);

    // Resaltar brevemente la primera flecha/muro que bloquea
    const blocker = firstBlocker(r, c, dir);
    if (blocker) {
        const idx = blocker.r * state.cols + blocker.c;
        const el = boardEl.children[idx];
        if (el) {
            el.classList.add('blocking');
            setTimeout(() => el.classList.remove('blocking'), 600);
        }
    }

    const hearts = livesEl.querySelectorAll('.heart');
    const heart = hearts[state.lives];
    if (heart) {
        heart.classList.add('popping');
        setTimeout(() => {
            heart.classList.add('lost');
            heart.classList.remove('popping');
        }, 220);
    }

    if (state.lives <= 0) setTimeout(() => lose(), 480);
}

function firstBlocker(r, c, dir) {
    const [dr, dc] = DIRS[dir];
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
        if (state.grid[nr][nc]) return { r: nr, c: nc };
        nr += dr; nc += dc;
    }
    return null;
}

function onCellHover(e) {
    if (state.busy || state.finished) return;
    const div = e.currentTarget;
    const r = +div.dataset.r;
    const c = +div.dataset.c;
    const cell = state.grid[r][c];
    if (!cell || cell.kind !== 'arrow') return;
    const [dr, dc] = DIRS[cell.dir];
    let nr = r + dr, nc = c + dc;
    const cells = boardEl.children;
    const isClear = isPathClear(state.grid, r, c);
    while (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
        const idx = nr * state.cols + nc;
        cells[idx].classList.add(isClear ? 'preview' : 'preview-blocked');
        if (state.grid[nr][nc]) break;
        nr += dr; nc += dc;
    }
}

function clearPreview() {
    for (const el of boardEl.querySelectorAll('.preview, .preview-blocked')) {
        el.classList.remove('preview', 'preview-blocked');
    }
}

// ---------- Final ----------

function win() {
    state.finished = true;
    state.outcome = 'won';
    const stars = state.lives; // 0..3
    const prevBest = getBestStars(state.levelIdx);
    if (stars > prevBest) saveBestStars(state.levelIdx, stars);
    updateTotalStars();
    sfx.win();
    fireConfetti(confettiCanvas);
    setTimeout(() => {
        showOverlay({
            emoji: stars === 3 ? '🌟' : (stars === 2 ? '✨' : (stars === 1 ? '🎉' : '😅')),
            title: '¡Nivel completado!',
            text: stars === 3 ? '¡Sin fallos!' : `${stars} corazón${stars === 1 ? '' : 'es'} restante${stars === 1 ? '' : 's'}.`,
            stars,
            action: 'Siguiente',
        });
    }, 350);
}

function lose() {
    state.finished = true;
    state.outcome = 'lost';
    sfx.lose();
    showOverlay({
        emoji: '💔',
        title: 'Sin vidas',
        text: 'Lo tienes a una jugada de distancia.',
        stars: -1,
        action: 'Reintentar',
    });
}

function showOverlay({ emoji, title, text, stars, action }) {
    overlayEmoji.textContent = emoji;
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayAction.textContent = action;
    if (stars >= 0) {
        overlayStars.classList.remove('hidden');
        overlayStars.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const filled = i < stars;
            overlayStars.insertAdjacentHTML('beforeend', `
                <svg class="ovstar${filled ? ' filled' : ''}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation-delay:${i * 120}ms" aria-hidden="true">
                    <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2"/>
                </svg>
            `);
        }
    } else {
        overlayStars.classList.add('hidden');
    }
    overlayEl.classList.remove('hidden');
}

// ---------- Persistencia ----------

function saveProgress(idx) { try { localStorage.setItem(STORAGE_KEY, String(idx)); } catch {} }
function loadProgress() {
    try {
        const v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
        return Number.isFinite(v) && v >= 0 ? v : 0;
    } catch { return 0; }
}

function getStarsMap() {
    try { return JSON.parse(localStorage.getItem(STARS_KEY) || '{}'); } catch { return {}; }
}
function getBestStars(idx) {
    const m = getStarsMap();
    return m[idx] ?? 0;
}
function saveBestStars(idx, stars) {
    const m = getStarsMap();
    m[idx] = stars;
    try { localStorage.setItem(STARS_KEY, JSON.stringify(m)); } catch {}
}
function updateTotalStars() {
    const m = getStarsMap();
    let total = 0;
    for (const k in m) total += m[k];
    totalStarsEl.textContent = String(total);
}

function renderMute() {
    muteBtn.innerHTML = isMuted()
        ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>'
        : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>';
}
