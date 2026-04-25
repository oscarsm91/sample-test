// Conversión local entre lat/lon y metros usando una proyección tangente plana
// (equirectangular local). Suficientemente precisa para distancias < ~5 km.

export const EARTH_R = 6378137; // metros

export function metersPerDegLat() {
    return 111320; // aprox constante
}

export function metersPerDegLon(lat) {
    return 111320 * Math.cos(lat * Math.PI / 180);
}

// Crea un convertidor centrado en (lat0, lon0) que mapea (lat, lon) -> (x, y)
// en metros, donde x es este y y es norte.
export function makeLocalProjection(lat0, lon0) {
    const mLat = metersPerDegLat();
    const mLon = metersPerDegLon(lat0);
    return {
        lat0, lon0, mLat, mLon,
        toMeters(lat, lon) {
            return {
                x: (lon - lon0) * mLon,
                y: (lat - lat0) * mLat,
            };
        },
        toLatLon(x, y) {
            return {
                lat: lat0 + y / mLat,
                lon: lon0 + x / mLon,
            };
        },
    };
}

// Distancia haversine en metros (más precisa para distancias mayores).
export function haversine(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}
