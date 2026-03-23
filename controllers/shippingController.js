const https = require('https');

// ─── Coordenadas del local ────────────────────────────────────────────────────
// TODO: reemplazá con las coordenadas reales del local
// Podés obtenerlas en https://www.latlong.net/ o Google Maps (click derecho → ¿Qué hay aquí?)
const STORE_LAT = -34.5994;
const STORE_LNG = -58.4333;
const MAX_DISTANCE_KM = 18;

// ─── Zonas restringidas (bounding boxes aproximados) ──────────────────────────
const RESTRICTED_ZONES = [
  {
    name: 'La Boca',
    latMin: -34.6250, latMax: -34.6600,
    lngMin: -58.3400, lngMax: -58.3800,
  },
  {
    name: 'Barracas',
    latMin: -34.6200, latMax: -34.6550,
    lngMin: -58.3700, lngMax: -58.4100,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fetchJson = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error('Respuesta inválida de la API de GCBA'));
          }
        });
      })
      .on('error', reject);
  });

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getRestrictedZone = (lat, lng) => {
  for (const zone of RESTRICTED_ZONES) {
    if (
      lat >= zone.latMax && lat <= zone.latMin &&
      lng <= zone.lngMin && lng >= zone.lngMax
    ) {
      return zone.name;
    }
  }
  return null;
};

// ─── Controlador principal ────────────────────────────────────────────────────
const validateAddress = async (req, res) => {
  const { street, number, province, city, direccion: fullDireccion } = req.query;

  const direccion = fullDireccion
    ? fullDireccion.trim()
    : street && number ? `${street.trim()} ${number.trim()}` : null;

  if (!direccion || !province || !city) {
    return res.status(400).json({
      valid: false,
      reason: 'missing_fields',
      message: 'Dirección, provincia y ciudad son requeridos.',
    });
  }

  const url = `https://apis.datos.gob.ar/georef/api/direcciones?direccion=${encodeURIComponent(direccion)}&provincia=${encodeURIComponent(province.trim())}&localidad=${encodeURIComponent(city.trim())}&max=1`;

  try {
    const data = await fetchJson(url);

    const candidates = data.direcciones || [];

    if (!candidates.length) {
      return res.json({
        valid: false,
        reason: 'not_found',
        message: 'No encontramos esa dirección. Verificá la calle, número, ciudad y provincia.',
      });
    }

    const addr = candidates[0];
    const coords = addr.ubicacion;

    if (!coords || coords.lat == null || coords.lon == null) {
      return res.json({
        valid: false,
        reason: 'no_coords',
        message: 'No pudimos obtener las coordenadas de esa dirección.',
      });
    }

    const lat = parseFloat(coords.lat);
    const lng = parseFloat(coords.lon);

    // Verificar zona restringida
    const restricted = getRestrictedZone(lat, lng);
    if (restricted) {
      return res.json({
        valid: false,
        reason: 'restricted_zone',
        zone: restricted,
        message: `No realizamos envíos por moto a ${restricted}.`,
      });
    }

    // Verificar distancia
    const distance = haversineKm(STORE_LAT, STORE_LNG, lat, lng);
    if (distance > MAX_DISTANCE_KM) {
      return res.json({
        valid: false,
        reason: 'out_of_range',
        distance: parseFloat(distance.toFixed(1)),
        message: `La dirección está a ${distance.toFixed(1)} km del local. Solo llegamos hasta ${MAX_DISTANCE_KM} km.`,
      });
    }

    // Construir dirección normalizada para mostrar
    const normalizedAddress = addr.nomenclatura
      ? `${addr.nomenclatura}, ${city.trim()}`
      : `${street.trim()} ${number.trim()}, ${city.trim()}, ${province.trim()}`;

    return res.json({
      valid: true,
      distance: parseFloat(distance.toFixed(1)),
      normalizedAddress,
      message: `Zona disponible. Distancia aproximada: ${distance.toFixed(1)} km del local.`,
    });
  } catch (error) {
    console.error('Error validando dirección:', error.message);
    return res.status(500).json({
      valid: false,
      reason: 'server_error',
      message: 'No pudimos validar la dirección en este momento. Intentá más tarde.',
    });
  }
};

module.exports = { validateAddress };
