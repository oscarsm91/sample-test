// Construye un índice espacial simple sobre la red de carreteras y los edificios
// expresados en metros locales. Permite preguntar:
//   - ¿el punto (x, y) está sobre alguna carretera?
//   - ¿el segmento (a, b) cruza algún edificio?

const CELL = 30; // tamaño de celda del grid en metros

function key(cx, cy) { return cx + ',' + cy; }

function distancePointToSegmentSq(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const ddx = px - cx;
    const ddy = py - cy;
    return { dSq: ddx * ddx + ddy * ddy, t, cx, cy };
}

function pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export class CollisionIndex {
    constructor(projection, osm) {
        this.proj = projection;
        this.roadGrid = new Map();   // celda -> array de segmentos
        this.buildingGrid = new Map();
        this.roadSegments = [];
        this.buildings = [];
        this.#indexRoads(osm.roads);
        this.#indexBuildings(osm.buildings);
    }

    #addToGrid(grid, cx, cy, item) {
        const k = key(cx, cy);
        let bucket = grid.get(k);
        if (!bucket) { bucket = []; grid.set(k, bucket); }
        bucket.push(item);
    }

    #indexRoads(roads) {
        for (const road of roads) {
            const pts = road.coords.map(c => this.proj.toMeters(c.lat, c.lon));
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1];
                const seg = { a, b, half: road.width / 2, road };
                this.roadSegments.push(seg);
                // Insertar en todas las celdas que el segmento atraviesa (con padding).
                const pad = seg.half + CELL;
                const minX = Math.min(a.x, b.x) - pad;
                const maxX = Math.max(a.x, b.x) + pad;
                const minY = Math.min(a.y, b.y) - pad;
                const maxY = Math.max(a.y, b.y) + pad;
                const cx0 = Math.floor(minX / CELL);
                const cx1 = Math.floor(maxX / CELL);
                const cy0 = Math.floor(minY / CELL);
                const cy1 = Math.floor(maxY / CELL);
                for (let cx = cx0; cx <= cx1; cx++) {
                    for (let cy = cy0; cy <= cy1; cy++) {
                        this.#addToGrid(this.roadGrid, cx, cy, seg);
                    }
                }
            }
        }
    }

    #indexBuildings(buildings) {
        for (const b of buildings) {
            const poly = b.coords.map(c => this.proj.toMeters(c.lat, c.lon));
            const item = { poly, building: b };
            this.buildings.push(item);
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const p of poly) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            }
            item.bbox = { minX, maxX, minY, maxY };
            const cx0 = Math.floor(minX / CELL);
            const cx1 = Math.floor(maxX / CELL);
            const cy0 = Math.floor(minY / CELL);
            const cy1 = Math.floor(maxY / CELL);
            for (let cx = cx0; cx <= cx1; cx++) {
                for (let cy = cy0; cy <= cy1; cy++) {
                    this.#addToGrid(this.buildingGrid, cx, cy, item);
                }
            }
        }
    }

    // Devuelve { onRoad, nearest } para un punto en metros.
    queryRoad(x, y) {
        const cx = Math.floor(x / CELL);
        const cy = Math.floor(y / CELL);
        let best = null;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const bucket = this.roadGrid.get(key(cx + dx, cy + dy));
                if (!bucket) continue;
                for (const seg of bucket) {
                    const r = distancePointToSegmentSq(x, y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
                    const halfSq = seg.half * seg.half;
                    if (!best || r.dSq < best.dSq) best = { ...r, seg };
                    if (r.dSq <= halfSq) {
                        return { onRoad: true, nearest: { ...r, seg } };
                    }
                }
            }
        }
        return { onRoad: false, nearest: best };
    }

    // ¿El punto cae dentro de algún edificio?
    pointInBuilding(x, y) {
        const cx = Math.floor(x / CELL);
        const cy = Math.floor(y / CELL);
        const bucket = this.buildingGrid.get(key(cx, cy));
        if (!bucket) return null;
        for (const item of bucket) {
            const { bbox } = item;
            if (x < bbox.minX || x > bbox.maxX || y < bbox.minY || y > bbox.maxY) continue;
            if (pointInPolygon(x, y, item.poly)) return item;
        }
        return null;
    }
}
