import { makeLocalProjection, haversine } from './geo.js';
import { fetchOSMArea } from './osm.js';
import { CollisionIndex } from './collision.js';
import { Car } from './car.js';
import { Input } from './input.js';
import { EngineSound } from './audio.js';

const FALLBACK_LOCATION = { lat: 40.4168, lon: -3.7038 }; // Madrid (Sol)
const REFETCH_DISTANCE = 700; // metros: cuándo volver a cargar OSM

const loaderEl   = document.getElementById('loader');
const loaderMsg  = document.getElementById('loader-msg');
const startBtn   = document.getElementById('start-btn');
const fallbackBtn = document.getElementById('fallback-btn');
const speedEl    = document.getElementById('speed');
const gearEl     = document.getElementById('gear');
const statusEl   = document.getElementById('status');
const coordsEl   = document.getElementById('coords');
const warningEl  = document.getElementById('warning');
const overlay    = document.getElementById('overlay');
const ctx2d      = overlay.getContext('2d');

let map, car, projection, collision, input, engine;
let osmCenter = null;       // lat/lon donde se descargó la última zona
let lastTimestamp = 0;
let starting = { lat: 0, lon: 0 };
let warningTimeout = null;

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
        pos => {
            const { latitude, longitude } = pos.coords;
            prepareStart({ lat: latitude, lon: longitude });
        },
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
    // Mapa
    if (!map) {
        map = new maplibregl.Map({
            container: 'map',
            style: rasterStyle(),
            center: [loc.lon, loc.lat],
            zoom: 17,
            pitch: 55,
            bearing: 0,
            interactive: false,
            attributionControl: { compact: true },
        });
        map.on('error', e => console.warn('MapLibre:', e?.error?.message));
        await new Promise(resolve => map.once('load', resolve));
    } else {
        map.setCenter([loc.lon, loc.lat]);
    }

    // Datos OSM + colisión
    const osm = await fetchOSMArea(loc.lat, loc.lon, 1200);
    if (osm.roads.length === 0) {
        throw new Error('No se han encontrado carreteras cercanas. Prueba en otra ubicación.');
    }
    osmCenter = { lat: loc.lat, lon: loc.lon };
    projection = makeLocalProjection(loc.lat, loc.lon);
    collision = new CollisionIndex(projection, osm);
    addRoadOverlayToMap(osm);

    // Coche: lo colocamos en la carretera más cercana
    const startPos = projectToNearestRoad(loc.lat, loc.lon);
    car = new Car({ lat: startPos.lat, lon: startPos.lon, heading: startPos.heading });
    const m = projection.toMeters(car.lat, car.lon);
    car.x = m.x; car.y = m.y;

    // Input + audio
    if (!input) input = new Input();
    if (!engine) engine = new EngineSound();
}

function projectToNearestRoad(lat, lon) {
    const m = projection.toMeters(lat, lon);
    const q = collision.queryRoad(m.x, m.y);
    if (!q.nearest) return { lat, lon, heading: 0 };
    const seg = q.nearest.seg;
    const cx = q.nearest.cx, cy = q.nearest.cy;
    const ll = projection.toLatLon(cx, cy);
    // Heading siguiendo la dirección del segmento
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const heading = Math.atan2(dx, dy); // 0=norte, +este
    return { lat: ll.lat, lon: ll.lon, heading };
}

function rasterStyle() {
    return {
        version: 8,
        sources: {
            osm: {
                type: 'raster',
                tiles: [
                    'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
                ],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors',
                maxzoom: 19,
            },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    };
}

// Capa GeoJSON con las carreteras transitables (resaltadas) y los edificios.
function addRoadOverlayToMap(osm) {
    const roadGeo = {
        type: 'FeatureCollection',
        features: osm.roads.map(r => ({
            type: 'Feature',
            properties: { highway: r.highway, width: r.width },
            geometry: {
                type: 'LineString',
                coordinates: r.coords.map(c => [c.lon, c.lat]),
            },
        })),
    };
    const buildGeo = {
        type: 'FeatureCollection',
        features: osm.buildings.map(b => ({
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'Polygon',
                coordinates: [b.coords.map(c => [c.lon, c.lat])],
            },
        })),
    };
    if (map.getSource('roads')) {
        map.getSource('roads').setData(roadGeo);
        map.getSource('buildings').setData(buildGeo);
        return;
    }
    map.addSource('roads', { type: 'geojson', data: roadGeo });
    map.addSource('buildings', { type: 'geojson', data: buildGeo });
    map.addLayer({
        id: 'roads-glow',
        type: 'line',
        source: 'roads',
        paint: {
            'line-color': '#3b82f6',
            'line-opacity': 0.25,
            'line-width': ['*', ['get', 'width'], 1.4],
        },
    });
    map.addLayer({
        id: 'buildings-fill',
        type: 'fill',
        source: 'buildings',
        paint: {
            'fill-color': '#1f2937',
            'fill-opacity': 0.55,
            'fill-outline-color': '#0f172a',
        },
    });
}

function beginGame() {
    loaderEl.classList.add('hidden');
    engine.start();
    resizeOverlay();
    window.addEventListener('resize', resizeOverlay);
    lastTimestamp = performance.now();
    requestAnimationFrame(loop);
}

function resizeOverlay() {
    const dpr = window.devicePixelRatio || 1;
    overlay.width  = overlay.clientWidth  * dpr;
    overlay.height = overlay.clientHeight * dpr;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    // Colisión: probar la nueva posición. Si no está en carretera o
    // colisiona con un edificio, deshacer y frenar.
    const newX = car.x + move.dx;
    const newY = car.y + move.dy;

    const buildingHit = collision.pointInBuilding(newX, newY);
    const road = collision.queryRoad(newX, newY);

    if (buildingHit) {
        car.speed *= -0.25; // rebote
        showWarning('¡Colisión!');
    } else if (!road.onRoad) {
        // Permite avanzar pero pegado al borde de la carretera más cercana.
        // Estrategia: deslizar a lo largo del segmento más cercano.
        const slid = slideAlongRoad(car.x, car.y, move.dx, move.dy, road.nearest);
        if (slid && slid.onRoad) {
            car.x += slid.dx;
            car.y += slid.dy;
            // Penalización ligera de velocidad por rozar el bordillo
            car.speed *= 0.92;
            showWarning('¡Cuidado: bordillo!');
        } else {
            // No hay deslizamiento válido: parar
            car.speed = 0;
        }
    } else {
        car.x = newX;
        car.y = newY;
    }

    // Sincronizar lat/lon
    const ll = projection.toLatLon(car.x, car.y);
    car.lat = ll.lat; car.lon = ll.lon;

    // Refetch OSM si nos hemos alejado mucho del centro descargado
    const distFromCenter = haversine(car.lat, car.lon, osmCenter.lat, osmCenter.lon);
    if (distFromCenter > REFETCH_DISTANCE) refetchAround(car.lat, car.lon);

    // Cámara
    map.jumpTo({
        center: [car.lon, car.lat],
        bearing: car.heading * 180 / Math.PI,
    });

    // Render coche
    drawCar();
    updateHUD();
    engine.update(car.speed, input.state.throttle);

    requestAnimationFrame(loop);
}

function slideAlongRoad(x, y, dx, dy, nearest) {
    if (!nearest) return null;
    const seg = nearest.seg;
    const sx = seg.b.x - seg.a.x;
    const sy = seg.b.y - seg.a.y;
    const len = Math.hypot(sx, sy) || 1;
    const ux = sx / len, uy = sy / len;
    // Proyecta el desplazamiento sobre la dirección del segmento
    const dot = dx * ux + dy * uy;
    const slidDx = ux * dot;
    const slidDy = uy * dot;
    const tryX = x + slidDx;
    const tryY = y + slidDy;
    const r = collisionQueryRoad(tryX, tryY);
    if (r.onRoad) return { dx: slidDx, dy: slidDy, onRoad: true };
    return null;
}

function collisionQueryRoad(x, y) {
    return collision.queryRoad(x, y);
}

let refetching = false;
async function refetchAround(lat, lon) {
    if (refetching) return;
    refetching = true;
    setStatus('Cargando más mapa…');
    try {
        const osm = await fetchOSMArea(lat, lon, 1500);
        if (osm.roads.length === 0) { setStatus(''); refetching = false; return; }
        // Re-proyectar desde nuevo centro para evitar derivas numéricas
        projection = makeLocalProjection(lat, lon);
        collision = new CollisionIndex(projection, osm);
        const m = projection.toMeters(car.lat, car.lon);
        car.x = m.x; car.y = m.y;
        addRoadOverlayToMap(osm);
        osmCenter = { lat, lon };
        setStatus('');
    } catch (err) {
        console.warn(err);
        setStatus('No se pudo recargar la zona');
    } finally {
        refetching = false;
    }
}

function drawCar() {
    const w = overlay.clientWidth;
    const h = overlay.clientHeight;
    ctx2d.clearRect(0, 0, w, h);
    // El coche siempre en el centro mirando hacia arriba (la cámara rota)
    ctx2d.save();
    ctx2d.translate(w / 2, h / 2);
    // Sombra
    ctx2d.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx2d, -10, -16, 20, 32, 4); ctx2d.fill();
    // Cuerpo
    ctx2d.fillStyle = '#ef4444';
    roundRect(ctx2d, -9, -18, 18, 34, 4); ctx2d.fill();
    // Parabrisas
    ctx2d.fillStyle = 'rgba(15,23,42,0.85)';
    roundRect(ctx2d, -7, -10, 14, 8, 2); ctx2d.fill();
    // Capó / luna trasera
    ctx2d.fillStyle = 'rgba(15,23,42,0.55)';
    roundRect(ctx2d, -7, 6, 14, 6, 2); ctx2d.fill();
    // Faros
    ctx2d.fillStyle = '#fde68a';
    ctx2d.fillRect(-7, -19, 4, 2);
    ctx2d.fillRect( 3, -19, 4, 2);
    ctx2d.restore();
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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
