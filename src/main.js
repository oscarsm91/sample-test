import { DIRS, isPathClear, levelForIndex, countArrows } from './levels.js';

const STORAGE_KEY = 'arrows-progress-v1';
const MAX_LIVES = 3;

const boardEl       = document.getElementById('board');
const livesEl       = document.getElementById('lives');
const levelNumEl    = document.getElementById('level-num');
const restartBtn    = document.getElementById('restart');
const overlayEl     = document.getElementById('overlay');
const overlayEmoji  = document.getElementById('overlay-emoji');
const overlayTitle  = document.getElementById('overlay-title');
const overlayText   = document.getElementById('overlay-text');
const overlayAction = document.getElementById('overlay-action');
const hintEl        = document.getElementById('hint');

const state = {
    levelIdx: loadProgress(),
    grid: null,
    rows: 0,
    cols: 0,
    lives: MAX_LIVES,
    arrowsLeft: 0,
    busy: false, // bloquea taps durante animaciones de salida
    finished: false,
};

startLevel(state.levelIdx);

restartBtn.addEventListener('click', () => {
    if (state.busy) return;
    startLevel(state.levelIdx);
});

overlayAction.addEventListener('click', () => {
    if (state.outcome === 'won') startLevel(state.levelIdx + 1);
    else                          startLevel(state.levelIdx);
});

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
    renderLives();
    renderBoard();
    fitBoard();
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
    // Flecha que apunta a la derecha; cada celda la rota por CSS
    return `<svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
    </svg>`;
}

function renderBoard() {
    boardEl.style.gridTemplateRows    = `repeat(${state.rows}, var(--cell-size))`;
    boardEl.style.gridTemplateColumns = `repeat(${state.cols}, var(--cell-size))`;
    boardEl.innerHTML = '';
    for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
            const cell = state.grid[r][c];
            const div = document.createElement('div');
            div.className = 'cell';
            div.dataset.r = r;
            div.dataset.c = c;
            if (cell) {
                div.classList.add('arrow', cell.dir);
                div.innerHTML = arrowSvg();
                div.addEventListener('click', onArrowTap);
                div.addEventListener('mouseenter', onCellHover);
                div.addEventListener('mouseleave', clearPreview);
            } else {
                div.classList.add('empty');
            }
            boardEl.appendChild(div);
        }
    }
}

function fitBoard() {
    // Ajusta dinámicamente el tamaño de la celda para que el tablero quepa
    // tanto a lo ancho como a lo alto del contenedor.
    const wrap = boardEl.parentElement;
    const w = wrap.clientWidth - 24;
    const h = wrap.clientHeight - 24;
    if (w <= 0 || h <= 0) return;
    const gap = 8;
    const padding = 24; // 12 a cada lado
    const maxByW = (w - padding - gap * (state.cols - 1)) / state.cols;
    const maxByH = (h - padding - gap * (state.rows - 1)) / state.rows;
    const size = Math.max(36, Math.min(80, Math.floor(Math.min(maxByW, maxByH))));
    boardEl.style.setProperty('--cell-size', `${size}px`);
}

window.addEventListener('resize', fitBoard);

// ---------- Interacción ----------

function onArrowTap(e) {
    if (state.busy || state.finished) return;
    const div = e.currentTarget;
    const r = +div.dataset.r;
    const c = +div.dataset.c;
    if (!state.grid[r][c]) return;

    if (isPathClear(state.grid, r, c)) {
        clearArrow(div, r, c);
    } else {
        loseLife(div);
    }
}

function clearArrow(div, r, c) {
    state.busy = true;
    div.classList.add('exiting');
    div.style.pointerEvents = 'none';
    state.grid[r][c] = null;
    state.arrowsLeft--;

    const handle = () => {
        div.classList.remove('arrow', 'up', 'down', 'left', 'right', 'exiting');
        div.classList.add('empty');
        div.innerHTML = '';
        div.removeEventListener('click', onArrowTap);
        state.busy = false;
        if (state.arrowsLeft === 0) win();
    };
    div.addEventListener('transitionend', handle, { once: true });
    // Fallback por si transitionend no dispara (raro)
    setTimeout(() => { if (state.busy) handle(); }, 600);
}

function loseLife(div) {
    state.lives--;
    div.classList.add('blocked');
    setTimeout(() => div.classList.remove('blocked'), 380);

    // Animar el corazón perdido
    const hearts = livesEl.querySelectorAll('.heart');
    const idx = state.lives;
    const heart = hearts[idx];
    if (heart) {
        heart.classList.add('popping');
        setTimeout(() => {
            heart.classList.add('lost');
            heart.classList.remove('popping');
        }, 220);
    }

    if (state.lives <= 0) {
        setTimeout(() => lose(), 420);
    }
}

// Pista: al pasar el ratón muestra el camino que recorrería la flecha
function onCellHover(e) {
    if (state.busy || state.finished) return;
    const div = e.currentTarget;
    const r = +div.dataset.r;
    const c = +div.dataset.c;
    const cell = state.grid[r][c];
    if (!cell) return;
    const [dr, dc] = DIRS[cell.dir];
    let nr = r + dr, nc = c + dc;
    const cells = boardEl.children;
    while (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
        const idx = nr * state.cols + nc;
        cells[idx].classList.add('preview');
        nr += dr; nc += dc;
    }
}

function clearPreview() {
    for (const el of boardEl.querySelectorAll('.preview')) el.classList.remove('preview');
}

// ---------- Fin de partida ----------

function win() {
    state.finished = true;
    state.outcome = 'won';
    showOverlay({
        emoji: pick(['🎉', '✨', '🌟', '🧠']),
        title: '¡Nivel completado!',
        text: state.lives === MAX_LIVES ? '¡Sin fallos!' : 'Buen razonamiento.',
        action: 'Siguiente',
    });
}

function lose() {
    state.finished = true;
    state.outcome = 'lost';
    showOverlay({
        emoji: '💔',
        title: 'Sin vidas',
        text: 'Vuelve a intentarlo.',
        action: 'Reiniciar',
    });
}

function showOverlay({ emoji, title, text, action }) {
    overlayEmoji.textContent = emoji;
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayAction.textContent = action;
    overlayEl.classList.remove('hidden');
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---------- Persistencia ----------

function saveProgress(idx) {
    try { localStorage.setItem(STORAGE_KEY, String(idx)); } catch {}
}

function loadProgress() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch { return 0; }
}
