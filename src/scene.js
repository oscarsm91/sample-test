// Escena Three.js: cielo, sol, suelo, edificios extruidos y carreteras
// generadas como meshes a partir de los polylines de OSM.
//
// Sistema de coordenadas:
//   - Mundo Three.js: x = este, y = arriba, z = -norte
//   - Proyección OSM (geo.js): (x, y) en metros, x = este, y = norte
//   - Por tanto: world = (x, 0, -y)

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SatelliteTiles } from './tiles.js';

const ROAD_COLOR    = 0x2a2d33;
const ROAD_OUTLINE  = 0x3a3e46;
const GROUND_COLOR  = 0x556b3b;
const BUILDING_PALETTE = [0xd6cfbe, 0xc8b89c, 0xb8a98a, 0xe2dccc, 0xa49680, 0xd9c9a3];

export class Scene3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0xc7d4e0, 120, 520);

        this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
        this.camera.position.set(0, 8, 14);

        this.cameraMode = 'chase'; // 'chase' | 'far' | 'cockpit'
        this.smoothCamPos = new THREE.Vector3();
        this.smoothLookAt = new THREE.Vector3();
        this.firstFrame = true;

        this.#initLights();
        this.#initSky();
        this.#initGround();

        this.tiles = new SatelliteTiles();
        this.scene.add(this.tiles.group);

        this.resize();
    }

    setCameraMode(mode) { this.cameraMode = mode; this.firstFrame = true; }

    cycleCamera() {
        const order = ['chase', 'far', 'cockpit'];
        const i = order.indexOf(this.cameraMode);
        this.setCameraMode(order[(i + 1) % order.length]);
    }

    #initLights() {
        this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a3a2a, 0.55);
        this.scene.add(this.hemi);

        this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
        this.scene.add(this.ambient);

        this.sun = new THREE.DirectionalLight(0xfff1c8, 1.6);
        this.sun.position.set(140, 220, 90);
        this.sun.castShadow = true;
        const s = this.sun.shadow;
        s.mapSize.set(2048, 2048);
        s.camera.left = -180;
        s.camera.right = 180;
        s.camera.top = 180;
        s.camera.bottom = -180;
        s.camera.near = 1;
        s.camera.far = 600;
        s.bias = -0.0005;
        s.normalBias = 0.4;
        this.scene.add(this.sun);
        this.scene.add(this.sun.target);
    }

    #initSky() {
        const sky = new Sky();
        sky.scale.setScalar(10000);
        const u = sky.material.uniforms;
        u.turbidity.value = 5;
        u.rayleigh.value = 1.4;
        u.mieCoefficient.value = 0.004;
        u.mieDirectionalG.value = 0.85;

        this.sunDir = new THREE.Vector3();
        const elev = THREE.MathUtils.degToRad(32); // sol bajo, cálido
        const azim = THREE.MathUtils.degToRad(135);
        this.sunDir.setFromSphericalCoords(1, Math.PI / 2 - elev, azim);
        u.sunPosition.value.copy(this.sunDir);

        this.scene.add(sky);
    }

    #initGround() {
        const geom = new THREE.PlaneGeometry(6000, 6000);
        geom.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({
            color: GROUND_COLOR,
            roughness: 1.0,
            metalness: 0.0,
        });
        this.ground = new THREE.Mesh(geom, mat);
        this.ground.position.y = -0.02;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);
    }

    setOSM(osm, projection) {
        // Limpieza previa
        if (this.roadMesh) { this.scene.remove(this.roadMesh); disposeMesh(this.roadMesh); }
        if (this.buildingMesh) { this.scene.remove(this.buildingMesh); disposeMesh(this.buildingMesh); }

        this.roadMesh = buildRoadsMesh(osm.roads, projection);
        if (this.roadMesh) this.scene.add(this.roadMesh);

        this.buildingMesh = buildBuildingsMesh(osm.buildings, projection);
        if (this.buildingMesh) this.scene.add(this.buildingMesh);

        this.tiles.setProjection(projection);
    }

    updateTiles(lat, lon) {
        this.tiles.update(lat, lon);
    }

    addObject(obj) { this.scene.add(obj); }
    removeObject(obj) { this.scene.remove(obj); }

    resize() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / Math.max(1, h);
        this.camera.updateProjectionMatrix();
    }

    // car: { x, y, heading } en metros locales (y norte). carHeight ~1m.
    updateCamera(car, dt) {
        // Posición del coche en mundo Three.js
        const cx = car.x;
        const cy = 0.7;
        const cz = -car.y;
        const fwd = new THREE.Vector3(Math.sin(car.heading), 0, -Math.cos(car.heading));

        let target, look;
        if (this.cameraMode === 'chase') {
            target = new THREE.Vector3(
                cx - fwd.x * 9,
                cy + 4.5,
                cz - fwd.z * 9,
            );
            look = new THREE.Vector3(cx + fwd.x * 6, cy + 0.6, cz + fwd.z * 6);
        } else if (this.cameraMode === 'far') {
            target = new THREE.Vector3(
                cx - fwd.x * 22,
                cy + 14,
                cz - fwd.z * 22,
            );
            look = new THREE.Vector3(cx + fwd.x * 4, cy, cz + fwd.z * 4);
        } else { // cockpit
            target = new THREE.Vector3(
                cx + fwd.x * 0.4,
                cy + 1.2,
                cz + fwd.z * 0.4,
            );
            look = new THREE.Vector3(cx + fwd.x * 30, cy + 1.0, cz + fwd.z * 30);
        }

        if (this.firstFrame) {
            this.smoothCamPos.copy(target);
            this.smoothLookAt.copy(look);
            this.firstFrame = false;
        } else {
            const k = this.cameraMode === 'cockpit' ? 1 : Math.min(1, dt * 7);
            this.smoothCamPos.lerp(target, k);
            this.smoothLookAt.lerp(look, Math.min(1, dt * 10));
        }
        this.camera.position.copy(this.smoothCamPos);
        this.camera.lookAt(this.smoothLookAt);

        // El sol sigue al coche para que las shadow maps siempre lo cubran
        this.sun.target.position.set(cx, 0, cz);
        this.sun.position.set(
            cx + this.sunDir.x * 220,
            this.sunDir.y * 220,
            cz + this.sunDir.z * 220,
        );
    }

    render() { this.renderer.render(this.scene, this.camera); }
}

function disposeMesh(mesh) {
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
    else mesh.material?.dispose();
}

// --- Generación de carreteras ---
//
// Convierte cada polyline en una tira de quads. Se construye en BufferGeometry
// para evitar miles de meshes individuales.

function buildRoadsMesh(roads, projection) {
    if (!roads.length) return null;
    const positions = [];
    const indices = [];
    const normals = [];
    let vCount = 0;

    for (const road of roads) {
        const pts = road.coords.map(c => projection.toMeters(c.lat, c.lon));
        const half = road.width / 2;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            if (len < 0.01) continue;
            const nx = -dy / len;
            const ny = dx / len;
            const ax1 = a.x + nx * half;
            const ay1 = a.y + ny * half;
            const ax2 = a.x - nx * half;
            const ay2 = a.y - ny * half;
            const bx1 = b.x + nx * half;
            const by1 = b.y + ny * half;
            const bx2 = b.x - nx * half;
            const by2 = b.y - ny * half;
            // (x, 0, -y)
            positions.push(ax1, 0, -ay1, ax2, 0, -ay2, bx1, 0, -by1, bx2, 0, -by2);
            normals.push(0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0);
            indices.push(vCount, vCount + 1, vCount + 2, vCount + 2, vCount + 1, vCount + 3);
            vCount += 4;
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setIndex(indices);
    const mat = new THREE.MeshStandardMaterial({
        color: ROAD_COLOR,
        roughness: 0.92,
        metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = 0.01;
    mesh.receiveShadow = true;
    return mesh;
}

// --- Generación de edificios ---

function buildBuildingsMesh(buildings, projection) {
    if (!buildings.length) return null;
    const colorGeoms = new Map(); // colorIdx -> [geom...]

    for (const b of buildings) {
        const pts = b.coords.map(c => projection.toMeters(c.lat, c.lon));
        // OSM cierra el polígono repitiendo el primer punto: lo quitamos
        if (pts.length > 2 &&
            Math.abs(pts[0].x - pts[pts.length - 1].x) < 1e-6 &&
            Math.abs(pts[0].y - pts[pts.length - 1].y) < 1e-6) {
            pts.pop();
        }
        if (pts.length < 3) continue;

        let height = b.height;
        if (!height) {
            // Variación pseudoaleatoria estable por id
            const seed = (b.id * 9301 + 49297) % 233280;
            height = 6 + (seed / 233280) * 18;
        }

        // ExtrudeGeometry necesita winding antihorario en plano XY para que
        // las normales apunten hacia +Z. Si OSM lo trae al revés, lo invertimos.
        const shapePts = pts.slice();
        if (THREE.ShapeUtils.isClockWise(shapePts)) shapePts.reverse();

        const shape = new THREE.Shape();
        shape.moveTo(shapePts[0].x, shapePts[0].y);
        for (let i = 1; i < shapePts.length; i++) shape.lineTo(shapePts[i].x, shapePts[i].y);
        shape.closePath();

        let geom;
        try {
            geom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
        } catch {
            continue;
        }
        // Shape vive en plano XY con extrude en +Z. Rotamos -90º en X:
        //   (x, y, z) -> (x, z, -y)
        // Así el footprint (x, y, 0) cae en world (x, 0, -y) y el techo
        // (x, y, depth) sube a (x, depth, -y) con la normal mirando arriba.
        geom.rotateX(-Math.PI / 2);

        const colorIdx = Math.abs(b.id) % BUILDING_PALETTE.length;
        let bucket = colorGeoms.get(colorIdx);
        if (!bucket) { bucket = []; colorGeoms.set(colorIdx, bucket); }
        bucket.push(geom);
    }

    const group = new THREE.Group();
    for (const [colorIdx, geoms] of colorGeoms) {
        const merged = mergeGeometries(geoms, false);
        if (!merged) continue;
        merged.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({
            color: BUILDING_PALETTE[colorIdx],
            roughness: 0.78,
            metalness: 0.05,
        });
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        // Liberamos las geometrías individuales tras el merge
        for (const g of geoms) g.dispose();
    }
    return group;
}
