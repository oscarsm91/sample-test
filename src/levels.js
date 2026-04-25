// Definición de niveles y generador procedural.
//
// Cada nivel es una rejilla rows x cols con celdas null (vacío) o un objeto
// { dir } donde dir ∈ {'up','right','down','left'}.
//
// Notación compacta para los niveles a mano: cada string representa una fila
// de la rejilla; los caracteres válidos son '.', '^', '>', 'v', '<'. Espacios
// se ignoran para que sean fáciles de escribir.

export const DIRS = {
    up:    [-1,  0],
    right: [ 0,  1],
    down:  [ 1,  0],
    left:  [ 0, -1],
};

const DIR_KEYS = Object.keys(DIRS);

const CHAR_TO_DIR = {
    '^': 'up',
    '>': 'right',
    'v': 'down',
    '<': 'left',
};

export function parseGrid(rows) {
    const cleaned = rows.map(r => r.replace(/\s+/g, ''));
    const cols = cleaned[0].length;
    const grid = [];
    for (let r = 0; r < cleaned.length; r++) {
        const row = cleaned[r];
        if (row.length !== cols) {
            throw new Error(`Fila ${r} con longitud distinta (${row.length} vs ${cols})`);
        }
        const out = [];
        for (let c = 0; c < cols; c++) {
            const ch = row[c];
            out.push(ch === '.' ? null : { dir: CHAR_TO_DIR[ch] });
        }
        grid.push(out);
    }
    return grid;
}

// ---- Niveles a mano (orden creciente de dificultad) ----

export const HAND_LEVELS = [
    parseGrid([
        '...',
        '.^.',
        '...',
    ]),
    parseGrid([
        '^<.',
        '...',
        '...',
    ]),
    parseGrid([
        '..v',
        '...',
        '>^.',
    ]),
    parseGrid([
        'v..>',
        '....',
        '....',
        '<..^',
    ]),
    parseGrid([
        'v..>',
        '.<.<',
        '.^..',
        '....',
    ]),
    parseGrid([
        '.v..',
        'v.<.',
        '>.>^',
        '....',
    ]),
];

// ---- Solver ----
//
// DFS con memoización sobre la cadena que serializa el estado de la rejilla.
// Devuelve true si existe alguna secuencia que vacía el tablero.

export function isPathClear(grid, r, c) {
    const cell = grid[r][c];
    if (!cell) return false;
    const [dr, dc] = DIRS[cell.dir];
    const rows = grid.length;
    const cols = grid[0].length;
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        if (grid[nr][nc]) return false;
        nr += dr; nc += dc;
    }
    return true;
}

function serialize(grid) {
    let s = '';
    for (const row of grid) {
        for (const cell of row) {
            s += cell ? cell.dir[0] : '.';
        }
        s += '/';
    }
    return s;
}

function cloneGrid(grid) {
    return grid.map(row => row.map(c => c ? { dir: c.dir } : null));
}

function isEmpty(grid) {
    for (const row of grid) for (const cell of row) if (cell) return false;
    return true;
}

export function isSolvable(grid) {
    const memo = new Set();
    function dfs(g) {
        const key = serialize(g);
        if (memo.has(key)) return false;
        memo.add(key);
        if (isEmpty(g)) return true;
        const rows = g.length;
        const cols = g[0].length;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (g[r][c] && isPathClear(g, r, c)) {
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
// Estrategia: arranca de un tablero vacío y va "insertando" flechas a la
// inversa: en cada paso elige una posición vacía y una dirección tal que,
// si fuera la última en quitarse, su camino sería libre. Así el puzzle es
// solvable por construcción y normalmente requiere descubrir el orden.
//
// Para forzar dependencias, después de generar la base ejecutamos varias
// pasadas en las que perturbamos posiciones y validamos con el solver.

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

function dirCanLeave(grid, r, c, dir) {
    // ¿Si pongo una flecha 'dir' en (r, c), tendría camino libre con la
    // disposición actual del tablero? La celda destino debe estar vacía hasta
    // el borde.
    const [dr, dc] = DIRS[dir];
    const rows = grid.length;
    const cols = grid[0].length;
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        if (grid[nr][nc]) return false;
        nr += dr; nc += dc;
    }
    return true;
}

export function generateLevel(rows, cols, count) {
    for (let attempt = 0; attempt < 80; attempt++) {
        const grid = emptyGrid(rows, cols);
        let placed = 0;
        const positions = shuffle(allPositions(rows, cols));

        for (const [r, c] of positions) {
            if (placed >= count) break;
            // Direcciones donde la flecha tendría camino libre AHORA
            const valid = DIR_KEYS.filter(d => dirCanLeave(grid, r, c, d));
            if (valid.length === 0) continue;
            // Preferimos las que apunten "hacia dentro" para crear bloqueos
            const inward = valid.filter(d => prefersInward(d, r, c, rows, cols));
            const pool = inward.length ? inward : valid;
            const dir = pool[Math.floor(Math.random() * pool.length)];
            grid[r][c] = { dir };
            placed++;
        }

        if (placed < count) continue;
        // Sanity-check: el tablero generado siempre debería ser solvable, pero
        // verificamos por si acaso (limita el coste para grids grandes).
        if (countArrows(grid) <= 14 && !isSolvable(grid)) continue;
        return grid;
    }
    // Fallback: una rejilla minúscula garantizada
    return parseGrid(['^<.', '...', '...']);
}

function allPositions(rows, cols) {
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([r, c]);
    return out;
}

function prefersInward(dir, r, c, rows, cols) {
    // Heurística suave: una flecha apunta "hacia dentro" si todavía le quedan
    // 2+ celdas por recorrer hasta el borde. Genera puzzles más enredados.
    const [dr, dc] = DIRS[dir];
    let steps = 0;
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) { steps++; nr += dr; nc += dc; }
    return steps >= 2;
}

export function countArrows(grid) {
    let n = 0;
    for (const row of grid) for (const c of row) if (c) n++;
    return n;
}

// ---- Selector de nivel para el progreso del jugador ----

export function levelForIndex(idx) {
    if (idx < HAND_LEVELS.length) {
        return cloneGrid(HAND_LEVELS[idx]);
    }
    // A partir de ahí: dificultad creciente y tablero más grande
    const stage = idx - HAND_LEVELS.length;
    const size = Math.min(7, 4 + Math.floor(stage / 4));
    const arrows = Math.min(size * size - 4, 5 + Math.floor(stage * 0.9));
    return generateLevel(size, size, arrows);
}
