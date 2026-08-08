/**
 * Cabeceras de caché HTTP.
 *
 * Es la capa de carga más barata que existe: con `Cache-Control` + `ETag` (que
 * Express calcula solo sobre el body JSON), un catálogo que no cambió se
 * responde con **304 sin cuerpo** y el navegador/CDN absorbe la mayoría de las
 * lecturas repetidas antes de llegar al backend.
 *
 * `stale-while-revalidate` permite servir la copia vieja mientras se revalida:
 * evita el pico de tráfico sincronizado cuando expira la caché.
 */

/** Recursos públicos de baja volatilidad (catálogo). */
const publicCache = (maxAgeSeconds, staleWhileRevalidateSeconds = maxAgeSeconds * 3) => (_req, res, next) => {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`
  );
  next();
};

/** Datos por usuario o de administración: nunca en cachés compartidas. */
const noStore = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

module.exports = { publicCache, noStore };
