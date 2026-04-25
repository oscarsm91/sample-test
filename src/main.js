import * as THREE from 'three';
import { makeLocalProjection, haversine } from './geo.js';
import { fetchOSMArea } from './osm.js';
import { CollisionIndex } from './collision.js';
import { Car } from './car.js';
import { Input } from './input.js';
import { EngineSound } from './audio.js';
import { Scene3D } from './scene.js';
import { buildCarMesh, spinWheels } from './car3d.js';
import { Minimap } from './minimap.js';

const FALLBACK_LOCATION = { lat: 40.4168, lon: -3.7038 }; // Madrid (Sol)
const REFETCH_DISTANCE = 700;

const loaderEl    = document.getElementById('loader');
const loaderMsg   = document.getElementById('loader-msg');
const startBtn    = document.getElementById('start-btn');
const fallbackBtn = document.getElementById('fallback-btn');
const speedEl     = document.getElementById('speed');
const gearEl      = document.getElementById('gear');
const statusEl    = document.getElementById('status');
const coordsEl    = document.getElementById('coords');
const warningEl   = document.getElementById('warning');
const canvas      = document.getElementById('game');

let scene3d, car, projection, collision, input, engine, carMesh, minimap;
let osmCenter = null;
let lastTimestamp = 0;
let starting = { lat: 0, lon: 0 };
let warningTimeout = null;
let cameraToggled = false;

main();

async function main() {
    setStatus('Inicializando…');
    requestLocation();
}

function requestLocation() {
    if (!('geolocation' in navigator)) {
        loaderMsg.textContent = 'Tu navegador no soporta geolocalización.';
        return;
    }
    navigator.geolocation.getCurrentPosition(
        pos => prepareStart({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        err => {
            console.warn('Geolocalización rechazada:', err.message);
            loaderMsg.textContent = 'No se pudo obtener tu ubicación. Pulsa "Empezar en Madrid" o concede permisos.';
            startBtn.textContent = 'Reintentar geolocalización';
            startBtn.disabled = false;
            startBtn.onclick = () => { startBtn.disabled = true; startBtn.textContent = 'Cargando…'; requestLocation(); };
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

fallbackBtn.addEventListener('click', () => prepareStart(FALLBACK_LOCATION));

async function prepareStart(loc) {
    starting = loc;
    loaderMsg.textContent = 'Descargando carreteras y edificios de OpenStreetMap…';
    startBtn.disabled = true;
    startBtn.textContent = 'Cargando…';
    try {
        await initWorld(loc);
        startBtn.disabled = false;
        startBtn.textContent = '¡A conducir!';
        startBtn.onclick = beginGame;
    } catch (err) {
        console.error(err);
        loaderMsg.textContent = 'Error cargando el mapa: ' + err.message;
        startBtn.textContent = 'Reintentar';
        startBtn.disabled = false;
        startBtn.onclick = () => prepareStart(loc);
    }
}

async function initWorld(loc) {
    if (!scene3d) {
        scene3d = new Scene3D(canvas);
        window.addEventListener('resize', () => scene3d.resize(), { passive: true });
    }

    const osm = await fetchOSMArea(loc.lat, loc.lon, 1200);
    if (osm.roads.length === 0) {
        throw new Error('No se han encontrado carreteras cercanas. Prueba en otra ubicación.');
    }
    osmCenter = { lat: loc.lat, lon: loc.lon };
    projection = makeLocalProjection(loc.lat, loc.lon);
    collision = new CollisionIndex(projection, osm);
    scene3d.setOSM(osm, projection);
    if (!minimap) minimap = new Minimap(document.getElementById('minimap'));
    minimap.setOSM(osm, projection);

    if (!carMesh) {
        carMesh = buildCarMesh();
        scene3d.addObject(carMesh);
    }

    const startPos = projectToNearestRoad(loc.lat, loc.lon);
    car = new Car({ lat: startPos.lat, lon: startPos.lon, heading: startPos.heading });
    const m = projection.toMeters(car.lat, car.lon);
    car.x = m.x; car.y = m.y;
    syncCarMesh(0);

    if (!input) input = new Input();
    if (!engine) engine = new EngineSound();
}

function projectToNearestRoad(lat, lon) {
    const m = projection.toMeters(lat, lon);
    const q = collision.queryRoad(m.x, m.y);
    if (!q.nearest) return { lat, lon, heading: 0 };
    const seg = q.nearest.seg;
    const ll = projection.toLatLon(q.nearest.cx, q.nearest.cy);
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const heading = Math.atan2(dx, dy);
    return { lat: ll.lat, lon: ll.lon, heading };
}

function beginGame() {
    loaderEl.classList.add('hidden');
    engine.start();
    scene3d.resize();
    lastTimestamp = performance.now();
    requestAnimationFrame(loop);
    window.addEventListener('keydown', e => {
        if (e.code === 'KeyC' && !cameraToggled) {
            cameraToggled = true;
            scene3d.cycleCamera();
            setTimeout(() => cameraToggled = false, 200);
        }
    });
}

function loop(now) {
    const dt = Math.min(0.05, (now - lastTimestamp) / 1000);
    lastTimestamp = now;

    if (input.consumeReset()) {
        const p = projectToNearestRoad(starting.lat, starting.lon);
        const m = projection.toMeters(p.lat, p.lon);
        car.lat = p.lat; car.lon = p.lon;
        car.x = m.x; car.y = m.y;
        car.heading = p.heading;
        car.speed = 0;
    }

    const move = car.update(dt, input.state);
    const newX = car.x + move.dx;
    const newY = car.y + move.dy;

    const buildingHit = collision.pointInBuilding(newX, newY);
    const road = collision.queryRoad(newX, newY);

    let traveled = 0;
    if (buildingHit) {
        car.speed *= -0.3;
        showWarning('¡Colisión!');
    } else if (!road.onRoad) {
        const slid = slideAlongRoad(car.x, car.y, move.dx, move.dy, road.nearest);
        if (slid && slid.onRoad) {
            car.x += slid.dx;
            car.y += slid.dy;
            traveled = Math.hypot(slid.dx, slid.dy);
            car.speed *= 0.92;
            showWarning('¡Cuidado: bordillo!');
        } else {
            car.speed = 0;
        }
    } else {
        car.x = newX;
        car.y = newY;
        traveled = Math.hypot(move.dx, move.dy);
    }

    const ll = projection.toLatLon(car.x, car.y);
    car.lat = ll.lat; car.lon = ll.lon;

    const distFromCenter = haversine(car.lat, car.lon, osmCenter.lat, osmCenter.lon);
    if (distFromCenter > REFETCH_DISTANCE) refetchAround(car.lat, car.lon);

    syncCarMesh(traveled);
    scene3d.updateCamera(car, dt);
    scene3d.render();
    if (minimap) minimap.render(car);

    updateHUD();
    engine.update(car.speed, input.state.throttle);

    requestAnimationFrame(loop);
}

function syncCarMesh(traveled) {
    if (!carMesh) return;
    carMesh.position.set(car.x, 0, -car.y);
    carMesh.rotation.y = -car.heading; // heading: 0 = norte (+z negativo); rotación.y positiva gira hacia +X cuando se mira desde +Y
    spinWheels(carMesh, traveled, car.steer);
}

function slideAlongRoad(x, y, dx, dy, nearest) {
    if (!nearest) return null;
    const seg = nearest.seg;
    const sx = seg.b.x - seg.a.x;
    const sy = seg.b.y - seg.a.y;
    const len = Math.hypot(sx, sy) || 1;
    const ux = sx / len, uy = sy / len;
    const dot = dx * ux + dy * uy;
    const slidDx = ux * dot;
    const slidDy = uy * dot;
    const tryX = x + slidDx;
    const tryY = y + slidDy;
    const r = collision.queryRoad(tryX, tryY);
    if (r.onRoad) return { dx: slidDx, dy: slidDy, onRoad: true };
    return null;
}

let refetching = false;
async function refetchAround(lat, lon) {
    if (refetching) return;
    refetching = true;
    setStatus('Cargando más mapa…');
    try {
        const osm = await fetchOSMArea(lat, lon, 1500);
        if (osm.roads.length === 0) { setStatus(''); refetching = false; return; }
        projection = makeLocalProjection(lat, lon);
        collision = new CollisionIndex(projection, osm);
        const m = projection.toMeters(car.lat, car.lon);
        car.x = m.x; car.y = m.y;
        scene3d.setOSM(osm, projection);
        if (minimap) minimap.setOSM(osm, projection);
        osmCenter = { lat, lon };
        setStatus('');
    } catch (err) {
        console.warn(err);
        setStatus('No se pudo recargar la zona');
    } finally {
        refetching = false;
    }
}

function updateHUD() {
    speedEl.textContent = Math.round(Math.abs(car.speed) * 3.6);
    gearEl.textContent = car.gear;
    coordsEl.textContent = car.lat.toFixed(5) + ', ' + car.lon.toFixed(5);
}

function setStatus(text) { statusEl.textContent = text; }

function showWarning(msg) {
    warningEl.textContent = msg;
    warningEl.classList.remove('hidden');
    clearTimeout(warningTimeout);
    warningTimeout = setTimeout(() => warningEl.classList.add('hidden'), 700);
}
