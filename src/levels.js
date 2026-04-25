// Niveles, generador y solver.
//
// Tipos de celda:
//   - null:                 vacía
//   - { kind: 'arrow', dir } flecha en una de 8 direcciones
//   - { kind: 'wall' }       muro: bloquea caminos pero no se puede pulsar
//
// Notación compacta para los niveles a mano:
//   '.'        vacío
//   '^','>','v','<'   flechas cardinales
//   '7','9','1','3'   diagonales (estilo numpad: 7=arriba-izq, 9=arriba-der, 1=abajo-izq, 3=abajo-der)
//   '#'        muro

export const DIRS = {
    up:        [-1,  0],
    right:     [ 0,  1],
    down:      [ 1,  0],
    left:      [ 0, -1],
    'up-right':   [-1,  1],
    'up-left':    [-1, -1],
    'down-right': [ 1,  1],
    'down-left':  [ 1, -1],
};

const CARDINAL = ['up', 'right', 'down', 'left'];
const DIAGONAL = ['up-right', 'up-left', 'down-right', 'down-left'];

const CHAR_TO_DIR = {
    '^': 'up', '>': 'right', 'v': 'down', '<': 'left',
    '9': 'up-right', '7': 'up-left', '3': 'down-right', '1': 'down-left',
};

export function parseGrid(rows) {
    const cleaned = rows.map(r => r.replace(/\s+/g, ''));
    const cols = cleaned[0].length;
    const grid = [];
    for (let r = 0; r < cleaned.length; r++) {
        const row = cleaned[r];
        if (row.length !== cols) throw new Error(`Fila ${r} con longitud distinta`);
        const out = [];
        for (let c = 0; c < cols; c++) {
            const ch = row[c];
            if (ch === '.') out.push(null);
            else if (ch === '#') out.push({ kind: 'wall' });
            else out.push({ kind: 'arrow', dir: CHAR_TO_DIR[ch] });
        }
        grid.push(out);
    }
    return grid;
}

// ---- Niveles a mano (dificultad creciente, mecánicas en escalera) ----

export const HAND_LEVELS = [
    // 1: la flecha más sencilla
    parseGrid([
        '...',
        '.^.',
        '...',
    ]),
    // 2: orden forzado
    parseGrid([
        '^<.',
        '...',
        '...',
    ]),
    // 3: tres flechas, dependencia simple
    parseGrid([
        '..v',
        '...',
        '>^.',
    ]),
    // 4: cadena en 4 lados
    parseGrid([
        'v..>',
        '....',
        '....',
        '<..^',
    ]),
    // 5: dependencia múltiple
    parseGrid([
        'v..>',
        '.<.<',
        '.^..',
        '....',
    ]),
    // 6: introduce muros (obstáculos visuales que estrechan el tablero)
    parseGrid([
        'v..>',
        '.#..',
        '..#.',
        '<..^',
    ]),
    // 7: primera diagonal
    parseGrid([
        '....',
        '.9..',
        '....',
        '....',
    ]),
    // 8: diagonales con dependencias
    parseGrid([
        '..v.',
        '.9..',
        '....',
        '<...',
    ]),
    // 9: muros + diagonales
    parseGrid([
        '....',
        '.#3.',
        '7#..',
        '....',
    ]),
];

// ---- Solver ----

export function isPathClear(grid, r, c) {
    const cell = grid[r][c];
    if (!cell || cell.kind !== 'arrow') return false;
    const [dr, dc] = DIRS[cell.dir];
    const rows = grid.length;
    const cols = grid[0].length;
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        if (grid[nr][nc]) return false; // arrow O wall: ambos bloquean
        nr += dr; nc += dc;
    }
    return true;
}

function serialize(grid) {
    let s = '';
    for (const row of grid) {
        for (const cell of row) {
            if (!cell) s += '.';
            else if (cell.kind === 'wall') s += '#';
            else s += cell.dir[0] + (cell.dir.length > 5 ? cell.dir.split('-')[1][0] : '');
        }
        s += '/';
    }
    return s;
}

function cloneGrid(grid) {
    return grid.map(row => row.map(c => c ? { ...c } : null));
}

function isCleared(grid) {
    for (const row of grid) for (const cell of row)
        if (cell && cell.kind === 'arrow') return false;
    return true;
}

export function isSolvable(grid) {
    const memo = new Set();
    function dfs(g) {
        const key = serialize(g);
        if (memo.has(key)) return false;
        memo.add(key);
        if (isCleared(g)) return true;
        const rows = g.length, cols = g[0].length;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = g[r][c];
                if (cell && cell.kind === 'arrow' && isPathClear(g, r, c)) {
                    const ng = cloneGrid(g);
                    ng[r][c] = null;
                    if (dfs(ng)) return true;
                }
            }
        }
        return false;
    }
    return dfs(grid);
}

// ---- Generador ----
//
// 1) Coloca un puñado de muros aleatorios.
// 2) Inserta flechas en orden inverso: cada nueva flecha tiene camino libre en
//    el momento de su colocación, lo que garantiza solvabilidad (basta con
//    quitar las flechas en orden inverso al de inserción).

function emptyGrid(rows, cols) {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pathCanLeave(grid, r, c, dir) {
    const [dr, dc] = DIRS[dir];
    const rows = grid.length, cols = grid[0].length;
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        if (grid[nr][nc]) return false;
        nr += dr; nc += dc;
    }
    return true;
}

function pathLength(rows, cols, r, c, dir) {
    const [dr, dc] = DIRS[dir];
    let steps = 0;
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) { steps++; nr += dr; nc += dc; }
    return steps;
}

export function generateLevel(rows, cols, count, opts = {}) {
    const { walls = 0, diagonals = false } = opts;
    const dirPool = diagonals ? CARDINAL.concat(DIAGONAL) : CARDINAL;

    for (let attempt = 0; attempt < 80; attempt++) {
        const grid = emptyGrid(rows, cols);

        // Muros aleatorios primero (no en el borde para no estrechar demasiado)
        const innerCells = [];
        for (let r = 1; r < rows - 1; r++)
            for (let c = 1; c < cols - 1; c++) innerCells.push([r, c]);
        const wallSpots = shuffle(innerCells).slice(0, walls);
        for (const [r, c] of wallSpots) grid[r][c] = { kind: 'wall' };

        // Flechas por inserción inversa
        let placed = 0;
        const positions = shuffle(allPositions(rows, cols))
            .filter(([r, c]) => !grid[r][c]);

        for (const [r, c] of positions) {
            if (placed >= count) break;
            const valid = dirPool.filter(d => pathCanLeave(grid, r, c, d));
            if (valid.length === 0) continue;
            // Heurística: preferir las que dejan ≥2 pasos hasta el borde
            const inward = valid.filter(d => pathLength(rows, cols, r, c, d) >= 2);
            const pool = inward.length ? inward : valid;
            const dir = pool[Math.floor(Math.random() * pool.length)];
            grid[r][c] = { kind: 'arrow', dir };
            placed++;
        }

        if (placed < count) continue;
        // Verificación opcional: para grids pequeños el solver es barato
        if (countArrows(grid) <= 14 && !isSolvable(grid)) continue;
        return grid;
    }
    return parseGrid(['^<.', '...', '...']);
}

function allPositions(rows, cols) {
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([r, c]);
    return out;
}

export function countArrows(grid) {
    let n = 0;
    for (const row of grid) for (const c of row)
        if (c && c.kind === 'arrow') n++;
    return n;
}

// ---- Selector según el progreso ----

export function levelForIndex(idx) {
    if (idx < HAND_LEVELS.length) {
        return cloneGrid(HAND_LEVELS[idx]);
    }
    const stage = idx - HAND_LEVELS.length;
    const size = Math.min(7, 4 + Math.floor(stage / 5));
    const arrows = Math.min(size * size - 6, 6 + Math.floor(stage * 0.85));
    const diagonals = stage >= 2;       // a partir del nivel ~12
    const walls = Math.min(4, Math.floor(stage / 3));
    return generateLevel(size, size, arrows, { walls, diagonals });
}
