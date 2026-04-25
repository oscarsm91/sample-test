// Tiles de imagen aérea (ESRI World Imagery) cargadas como texturas en
// planos planos al ras del suelo. Mantenemos un grid centrado en el coche
// y vamos descartando tiles a medida que se alejan.
//
// ESRI tile URL pattern: tile/{level}/{row}/{col} -> z/y/x (no x/y).
// Atribución requerida: "Source: Esri, Maxar, Earthstar Geographics, ...".

import * as THREE from 'three';

const TILE_ZOOM = 18;
const GRID_RADIUS = 2; // 2 -> 5x5 tiles (~580m de lado, suficiente con la niebla)
const TILE_URL = (z, x, y) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

export class SatelliteTiles {
    constructor() {
        this.group = new THREE.Group();
        this.cache = new Map();          // key 'z/x/y' -> { mesh, texture, mat }
        this.loader = new THREE.TextureLoader();
        this.loader.crossOrigin = 'anonymous';
        this.projection = null;
        this.lastCenterTile = null;
    }

    setProjection(projection) {
        this.projection = projection;
        // Las posiciones en metros locales cambian al cambiar la proyección,
        // así que descartamos todo y se vuelve a generar.
        this.clear();
        this.lastCenterTile = null;
    }

    clear() {
        for (const [, e] of this.cache) {
            this.group.remove(e.mesh);
            e.mesh.geometry?.dispose();
            e.mat?.dispose();
            e.texture?.dispose();
        }
        this.cache.clear();
    }

    update(lat, lon) {
        if (!this.projection) return;
        const { x: cxF, y: cyF } = latLonToTile(lat, lon, TILE_ZOOM);
        const tcx = Math.floor(cxF);
        const tcy = Math.floor(cyF);

        // Sólo recalculamos cuando cambia el tile central — barato.
        if (this.lastCenterTile && this.lastCenterTile.x === tcx && this.lastCenterTile.y === tcy) {
            return;
        }
        this.lastCenterTile = { x: tcx, y: tcy };

        const wanted = new Set();
        for (let dy = -GRID_RADIUS; dy <= GRID_RADIUS; dy++) {
            for (let dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx++) {
                const x = tcx + dx;
                const y = tcy + dy;
                const key = `${TILE_ZOOM}/${x}/${y}`;
                wanted.add(key);
                if (!this.cache.has(key)) this.#loadTile(TILE_ZOOM, x, y, key);
            }
        }
        for (const [key, e] of this.cache) {
            if (!wanted.has(key)) {
                this.group.remove(e.mesh);
                e.mesh.geometry?.dispose();
                e.mat?.dispose();
                e.texture?.dispose();
                this.cache.delete(key);
            }
        }
    }

    #loadTile(z, x, y, key) {
        const b = tileBounds(z, x, y);
        const nw = this.projection.toMeters(b.north, b.west);
        const se = this.projection.toMeters(b.south, b.east);
        const width  = Math.abs(se.x - nw.x);
        const height = Math.abs(nw.y - se.y);
        const cx = (nw.x + se.x) / 2;
        const cy = (nw.y + se.y) / 2;

        const geom = new THREE.PlaneGeometry(width, height);
        geom.rotateX(-Math.PI / 2); // queda horizontal con normal +Y
        const mat = new THREE.MeshLambertMaterial({ color: 0x3a4a32 });
        const mesh = new THREE.Mesh(geom, mat);
        // Mundo Three.js: (x_este, 0, -y_norte)
        mesh.position.set(cx, 0.0, -cy);
        mesh.receiveShadow = true;
        this.group.add(mesh);

        const entry = { mesh, mat, texture: null };
        this.cache.set(key, entry);

        this.loader.load(
            TILE_URL(z, x, y),
            tex => {
                if (!this.cache.has(key)) { tex.dispose(); return; } // descartado mientras cargaba
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.anisotropy = 4;
                tex.wrapS = THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;
                mat.map = tex;
                mat.color.set(0xffffff);
                mat.needsUpdate = true;
                entry.texture = tex;
            },
            undefined,
            err => console.warn('Tile failed', key, err?.message || err),
        );
    }
}

function latLonToTile(lat, lon, z) {
    const n = 2 ** z;
    const x = ((lon + 180) / 360) * n;
    const latRad = lat * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return { x, y };
}

function tileBounds(z, x, y) {
    const n = 2 ** z;
    const lonW = x / n * 360 - 180;
    const lonE = (x + 1) / n * 360 - 180;
    const latN = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    const latS = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
    return { north: latN, south: latS, west: lonW, east: lonE };
}
