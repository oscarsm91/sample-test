// Cliente Overpass API: descarga la red de carreteras y los edificios alrededor
// de una posición. Cachea geometría en memoria por (lat, lon, radio).

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter',
];

// Anchos típicos por tipo de carretera (metros, ida+vuelta).
const ROAD_WIDTHS = {
    motorway: 16, trunk: 14, primary: 12, secondary: 10,
    tertiary: 9, unclassified: 7, residential: 7, living_street: 6,
    service: 5, pedestrian: 5, track: 4, road: 7,
    motorway_link: 8, trunk_link: 8, primary_link: 8,
    secondary_link: 7, tertiary_link: 6,
};

const DRIVABLE = new Set([
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'unclassified', 'residential', 'living_street', 'service', 'road',
    'motorway_link', 'trunk_link', 'primary_link',
    'secondary_link', 'tertiary_link',
]);

export function roadWidth(highway) {
    return ROAD_WIDTHS[highway] ?? 7;
}

export function isDrivable(highway) {
    return DRIVABLE.has(highway);
}

// Descarga roads + buildings dentro de un bbox alrededor de (lat, lon).
// radiusM: radio en metros; ~1500 cubre una zona generosa.
export async function fetchOSMArea(lat, lon, radiusM = 1200) {
    const dLat = radiusM / 111320;
    const dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    const south = lat - dLat;
    const north = lat + dLat;
    const west  = lon - dLon;
    const east  = lon + dLon;

    const query = `
        [out:json][timeout:25];
        (
            way["highway"](${south},${west},${north},${east});
            way["building"](${south},${west},${north},${east});
        );
        (._;>;);
        out body;
    `;

    let lastError;
    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'data=' + encodeURIComponent(query),
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            return parseOverpass(json);
        } catch (err) {
            lastError = err;
            console.warn('Overpass falló en', endpoint, err);
        }
    }
    throw lastError ?? new Error('Sin endpoint Overpass disponible');
}

function parseOverpass(data) {
    const nodes = new Map();
    for (const el of data.elements) {
        if (el.type === 'node') nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
    const roads = [];
    const buildings = [];
    for (const el of data.elements) {
        if (el.type !== 'way' || !el.nodes) continue;
        const coords = el.nodes.map(id => nodes.get(id)).filter(Boolean);
        if (coords.length < 2) continue;
        const tags = el.tags || {};
        if (tags.highway && isDrivable(tags.highway)) {
            roads.push({
                id: el.id,
                highway: tags.highway,
                name: tags.name,
                oneway: tags.oneway === 'yes',
                width: roadWidth(tags.highway),
                coords,
            });
        } else if (tags.building) {
            buildings.push({
                id: el.id,
                kind: tags.building,
                coords,
            });
        }
    }
    return { roads, buildings };
}
