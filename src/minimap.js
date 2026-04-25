// Minimapa estilo GTA: vista cenital, redonda, con el coche siempre arriba.
// Usa Canvas 2D — más simple y suficiente para esto.

const RANGE_M = 140;            // metros visibles desde el centro al borde
const ROAD_COLOR     = '#dfe3ea';
const ROAD_OUTLINE   = '#1a1d24';
const BUILDING_FILL  = '#3a4150';
const BUILDING_LINE  = '#252a33';
const GROUND_COLOR   = '#2c3540';
const PLAYER_COLOR   = '#ffd86b';
const PLAYER_OUTLINE = '#1a1d24';

export class Minimap {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.osm = null;
        this.projection = null;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.#syncSize();
    }

    setOSM(osm, projection) {
        this.osm = osm;
        this.projection = projection;
        // Pre-proyecta las geometrías a metros locales para no recalcular cada frame
        this.roadsLocal = osm.roads.map(r => ({
            width: r.width,
            pts: r.coords.map(c => projection.toMeters(c.lat, c.lon)),
        }));
        this.buildingsLocal = osm.buildings.map(b => ({
            pts: b.coords.map(c => projection.toMeters(c.lat, c.lon)),
        }));
    }

    #syncSize() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        if (this.canvas.width !== w * this.dpr) {
            this.canvas.width = Math.max(1, Math.floor(w * this.dpr));
            this.canvas.height = Math.max(1, Math.floor(h * this.dpr));
        }
    }

    render(car) {
        if (!this.osm) return;
        this.#syncSize();
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const radius = Math.min(W, H) / 2;
        const scale = (radius / RANGE_M); // px por metro

        ctx.save();
        // Fondo
        ctx.fillStyle = GROUND_COLOR;
        ctx.fillRect(0, 0, W, H);

        // Recortamos al círculo
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
        ctx.clip();

        // Aplicamos transformación: el coche en el centro, mapa rotado para
        // que el rumbo del coche apunte hacia arriba.
        ctx.translate(cx, cy);
        ctx.rotate(-car.heading); // norte->arriba pasa a heading->arriba
        ctx.scale(scale, -scale); // y norte hacia arriba en pantalla
        ctx.translate(-car.x, -car.y);

        // Edificios
        ctx.fillStyle = BUILDING_FILL;
        ctx.strokeStyle = BUILDING_LINE;
        ctx.lineWidth = 1 / scale;
        for (const b of this.buildingsLocal) {
            if (!isNear(b.pts, car.x, car.y, RANGE_M + 30)) continue;
            ctx.beginPath();
            ctx.moveTo(b.pts[0].x, b.pts[0].y);
            for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        // Carreteras: contorno oscuro debajo, núcleo claro encima
        for (const layer of [{ color: ROAD_OUTLINE, extra: 1.4 }, { color: ROAD_COLOR, extra: 0 }]) {
            ctx.strokeStyle = layer.color;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (const r of this.roadsLocal) {
                if (!isNear(r.pts, car.x, car.y, RANGE_M + 30)) continue;
                ctx.lineWidth = Math.max(2 / scale, (r.width * 0.45) + layer.extra / scale);
                ctx.beginPath();
                ctx.moveTo(r.pts[0].x, r.pts[0].y);
                for (let i = 1; i < r.pts.length; i++) ctx.lineTo(r.pts[i].x, r.pts[i].y);
                ctx.stroke();
            }
        }

        ctx.restore();

        // Flecha del jugador en el centro (no rota, siempre apunta arriba)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.beginPath();
        ctx.moveTo(0, -10 * this.dpr);
        ctx.lineTo(7 * this.dpr, 8 * this.dpr);
        ctx.lineTo(0, 4 * this.dpr);
        ctx.lineTo(-7 * this.dpr, 8 * this.dpr);
        ctx.closePath();
        ctx.fillStyle = PLAYER_COLOR;
        ctx.strokeStyle = PLAYER_OUTLINE;
        ctx.lineWidth = 2 * this.dpr;
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Borde interior del círculo
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 2 * this.dpr;
        ctx.stroke();
        ctx.restore();

        // Marca del Norte: pequeña muesca girada con el rumbo
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-car.heading);
        ctx.beginPath();
        ctx.moveTo(0, -radius + 6 * this.dpr);
        ctx.lineTo(-3 * this.dpr, -radius + 14 * this.dpr);
        ctx.lineTo(3 * this.dpr, -radius + 14 * this.dpr);
        ctx.closePath();
        ctx.fillStyle = '#ffd86b';
        ctx.fill();
        ctx.restore();
    }
}

function isNear(pts, cx, cy, range) {
    // Bounding-box rápido contra un cuadrado de lado 2*range
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return maxX >= cx - range && minX <= cx + range && maxY >= cy - range && minY <= cy + range;
}
