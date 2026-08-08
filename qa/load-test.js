/**
 * load-test.js — Prueba de concurrencia y carga para LIA Store
 *
 * Cómo correr:
 *   node qa/load-test.js [BASE_URL]
 *
 * Ejemplo local:   node qa/load-test.js http://localhost:3000
 * Ejemplo staging: node qa/load-test.js https://mi-backend.vercel.app
 *
 * Requiere Node.js >= 18 (fetch nativo). Sin dependencias externas.
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';
const API  = `${BASE}/api`;

// ─── Utilidades ──────────────────────────────────────────────────────────────

const fmt  = (n) => n.toFixed(2);
const now  = () => performance.now();

/** Ejecuta `fn` y devuelve { ok, status, durationMs, error }. */
async function timed(fn) {
  const t0 = now();
  try {
    const res = await fn();
    return { ok: res.ok, status: res.status, durationMs: now() - t0, error: null };
  } catch (err) {
    return { ok: false, status: 0, durationMs: now() - t0, error: err.message };
  }
}

/** Dispara `n` llamadas concurrentes a `fn` y devuelve stats. */
async function concurrentBatch(label, n, fn) {
  console.log(`\n  ⏳ ${label} — ${n} requests concurrentes...`);
  const results = await Promise.all(Array.from({ length: n }, () => timed(fn)));

  const ok      = results.filter(r => r.ok).length;
  const errors  = results.filter(r => !r.ok);
  const times   = results.map(r => r.durationMs).sort((a, b) => a - b);
  const avg     = times.reduce((a, b) => a + b, 0) / times.length;
  const p50     = times[Math.floor(times.length * 0.50)];
  const p90     = times[Math.floor(times.length * 0.90)];
  const p99     = times[Math.floor(times.length * 0.99)] ?? times.at(-1);
  const max     = times.at(-1);

  console.log(`  ✅  OK: ${ok}/${n}  |  Errores: ${errors.length}`);
  console.log(`  ⏱   avg: ${fmt(avg)}ms  p50: ${fmt(p50)}ms  p90: ${fmt(p90)}ms  p99: ${fmt(p99)}ms  max: ${fmt(max)}ms`);
  if (errors.length) {
    const sample = errors.slice(0, 3);
    sample.forEach(e => console.log(`  ❌  status=${e.status}  err=${e.error ?? '-'}`));
  }

  return { label, ok, total: n, errors: errors.length, avg, p50, p90, p99, max };
}

/** Ejecuta requests secuenciales simulando navegación real. */
async function sequentialRun(label, steps) {
  console.log(`\n  ⏳ ${label} — ${steps.length} pasos secuenciales...`);
  const res = [];
  for (const { name, fn } of steps) {
    const r = await timed(fn);
    res.push({ name, ...r });
    const icon = r.ok ? '✅' : '❌';
    console.log(`  ${icon} ${name.padEnd(40)} ${fmt(r.durationMs)}ms  status=${r.status}`);
  }
  return res;
}

// ─── Escenarios ───────────────────────────────────────────────────────────────

async function getProducts()       { return fetch(`${API}/products`); }
async function getProductPage(o)   { return fetch(`${API}/products?limit=12&offset=${o}`); }
async function getProductById(id)  { return fetch(`${API}/products/${id}`); }
async function getShipping(cp)     { return fetch(`${API}/shipping?postalCode=${cp}`); }
async function getCloudinaryCfg()  { return fetch(`${API}/cloudinary/config`); }
async function getHealth()         { return fetch(`${BASE}/health`); }

const RESULTS = [];

// ─── Suite 1: carga del catálogo ─────────────────────────────────────────────
async function suiteProductLoad() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' SUITE 1 — Carga del catálogo (GET /api/products)');
  console.log('══════════════════════════════════════════════════════');

  RESULTS.push(await concurrentBatch('5 usuarios simultáneos',  5,  getProducts));
  RESULTS.push(await concurrentBatch('20 usuarios simultáneos', 20, getProducts));
  RESULTS.push(await concurrentBatch('50 usuarios simultáneos', 50, getProducts));
}

// ─── Suite 2: acceso concurrente a un producto popular ───────────────────────
async function suiteProductDetail() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' SUITE 2 — Detalle de producto (GET /api/products/:id)');
  console.log('══════════════════════════════════════════════════════');

  // Primero obtenemos un ID real del catálogo
  let productId = 1;
  try {
    const res  = await fetch(`${API}/products`);
    const body = await res.json();
    const first = Array.isArray(body) ? body[0] : body?.data?.[0];
    if (first?.id) productId = first.id;
  } catch { /* usa 1 como fallback */ }

  console.log(`  (usando producto id=${productId})`);

  RESULTS.push(await concurrentBatch(
    `30 usuarios leen mismo producto (id=${productId})`,
    30,
    () => getProductById(productId)
  ));
}

// ─── Suite 3: apertura de home concurrente ───────────────────────────────────
async function suiteHomeConcurrent() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' SUITE 3 — Home concurrente (catálogo + envío + config)');
  console.log('══════════════════════════════════════════════════════');

  // Simula lo que dispara una apertura de home contra ESTE backend: primera
  // página del catálogo, cotización de envío y config pública de Cloudinary.
  const homeLoads = Array.from({ length: 20 }, async () => {
    const [r1, r2, r3] = await Promise.all([
      timed(() => getProductPage(0)),
      timed(() => getShipping('1406')),
      timed(() => getCloudinaryCfg()),
    ]);
    const ok = r1.ok && r2.ok && r3.ok;
    const maxDuration = Math.max(r1.durationMs, r2.durationMs, r3.durationMs);
    return { ok, status: ok ? 200 : 0, durationMs: maxDuration, error: null };
  });

  const results = await Promise.all(homeLoads);
  const ok     = results.filter(r => r.ok).length;
  const times  = results.map(r => r.durationMs).sort((a, b) => a - b);
  const avg    = times.reduce((a, b) => a + b, 0) / times.length;
  const p90    = times[Math.floor(times.length * 0.90)];

  console.log(`\n  ✅ 20 aperturas de home simultáneas — OK: ${ok}/20`);
  console.log(`  ⏱   avg: ${fmt(avg)}ms  p90: ${fmt(p90)}ms`);
  RESULTS.push({ label: 'Home concurrente (20 usuarios)', ok, total: 20, errors: 20 - ok, avg, p90 });
}

// ─── Suite 4: navegación rápida (race conditions de routing) ─────────────────
async function suiteRapidNavigation() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' SUITE 4 — Navegación rápida (race condition simulation)');
  console.log('══════════════════════════════════════════════════════');

  // Obtener hasta 5 productos para simular navegación entre ellos
  let ids = [1, 2, 3, 4, 5];
  try {
    const res  = await fetch(`${API}/products`);
    const body = await res.json();
    const arr  = Array.isArray(body) ? body : body?.data ?? [];
    ids = arr.slice(0, 5).map(p => p.id).filter(Boolean);
    if (!ids.length) ids = [1, 2, 3, 4, 5];
  } catch { /* usa fallback */ }

  // Simula un usuario que navega entre productos SIN esperar la respuesta anterior
  // (igual que React Router cuando el usuario clickea rápido antes de que cargue)
  const steps = ids.map(id => ({
    name: `GET /products/${id}`,
    fn:   () => getProductById(id),
  }));

  await sequentialRun('Navegación secuencial entre 5 productos', steps);

  // Simula 10 usuarios haciendo cada uno una secuencia completa
  console.log('\n  ⏳ 10 usuarios navegando en paralelo (5 productos cada uno)...');
  const t0 = now();
  await Promise.all(
    Array.from({ length: 10 }, () =>
      sequentialRun('', ids.map(id => ({ name: `prod-${id}`, fn: () => getProductById(id) })))
    )
  );
  console.log(`  ✅ Completado en ${fmt(now() - t0)}ms`);
}

// ─── Suite 5: stock compartido (detección de race condition de stock) ─────────
async function suiteStockRaceDetect() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' SUITE 5 — Detección de race conditions de stock');
  console.log('══════════════════════════════════════════════════════');
  console.log('  (Esta suite solo lee stock — no crea órdenes reales)');

  let productId = 1;
  try {
    const res  = await fetch(`${API}/products`);
    const body = await res.json();
    const arr  = Array.isArray(body) ? body : body?.data ?? [];
    if (arr[0]?.id) productId = arr[0].id;
  } catch { /* fallback */ }

  // 50 lecturas simultáneas del mismo producto → verifica consistencia de stock
  const results = await Promise.all(
    Array.from({ length: 50 }, () => timed(() => getProductById(productId)))
  );

  const ok      = results.filter(r => r.ok);
  const bodies  = await Promise.all(
    ok.map(async () => {
      try {
        const r   = await fetch(`${API}/products/${productId}`);
        const j   = await r.json();
        return j?.stock ?? j?.data?.stock ?? null;
      } catch { return null; }
    })
  );

  const stocks = [...new Set(bodies.filter(s => s !== null))];
  const allMatch = stocks.length <= 1;

  console.log(`\n  📊 50 lecturas concurrentes de producto id=${productId}`);
  console.log(`  ✅ OK: ${ok.length}/50  |  Errores: ${50 - ok.length}`);
  if (allMatch) {
    console.log(`  ✅ STOCK CONSISTENTE: todos reportan stock=${stocks[0] ?? 'n/a'}`);
  } else {
    console.log(`  ⚠️  INCONSISTENCIA DETECTADA: valores de stock distintos: [${stocks.join(', ')}]`);
    console.log('     → Revisar caché o race condition en la capa de datos.');
  }
  RESULTS.push({ label: 'Consistencia de stock (50 lecturas)', ok: ok.length, total: 50, errors: 50 - ok.length, consistent: allMatch });
}

// ─── Suite 6: cálculo de envío concurrente ────────────────────────────────────
async function suiteShippingConcurrent() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' SUITE 6 — Cálculo de envío concurrente');
  console.log('══════════════════════════════════════════════════════');

  const cps = ['1000', '5000', '7000', '2000', '8000'];
  const concurrentCPs = Array.from({ length: 30 }, (_, i) => cps[i % cps.length]);

  RESULTS.push(await concurrentBatch(
    '30 solicitudes de envío concurrentes (CPs variados)',
    30,
    () => getShipping(concurrentCPs[Math.floor(Math.random() * concurrentCPs.length)])
  ));
}

// ─── Suite 7: mecanismos de carga (caché HTTP, 304, rate limit) ──────────────
async function suiteLoadMechanics() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' SUITE 7 — Mecanismos de carga (caché HTTP / 304 / 429)');
  console.log('══════════════════════════════════════════════════════');

  // 1. Cabeceras de caché + ETag en el catálogo público
  const first = await fetch(`${API}/products?limit=5&offset=0`);
  const cacheControl = first.headers.get('cache-control');
  const etag = first.headers.get('etag');
  console.log(`  ${cacheControl ? '✅' : '❌'} Cache-Control: ${cacheControl ?? 'ausente'}`);
  console.log(`  ${etag ? '✅' : '❌'} ETag: ${etag ? 'presente' : 'ausente'}`);

  // 2. Revalidación condicional → 304 sin cuerpo.
  //    `cache: 'no-cache'` es necesario porque el fetch de Node (undici) descarta
  //    los headers condicionales en el modo por defecto; el navegador sí los manda.
  let notModified = false;
  if (etag) {
    const revalidated = await fetch(`${API}/products?limit=5&offset=0`, {
      headers: { 'If-None-Match': etag },
      cache: 'no-cache',
    });
    notModified = revalidated.status === 304;
    console.log(`  ${notModified ? '✅' : '❌'} Revalidación con If-None-Match → ${revalidated.status}`);
  }

  // 3. Compresión negociada
  const compressed = await fetch(`${API}/products`, { headers: { 'Accept-Encoding': 'gzip' } });
  const encoding = compressed.headers.get('content-encoding');
  console.log(`  ${encoding ? '✅' : '⚠️ '} Content-Encoding: ${encoding ?? 'sin comprimir (payload chico)'}`);

  // 4. Rate limit: headers estándar y bloqueo con 429 + Retry-After.
  //    Se usa el endpoint de login, que tiene el límite más estricto (10/min).
  const loginAttempt = () =>
    fetch(`${API}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'load-test@example.com', password: 'invalido' }),
    });

  const attempts = [];
  for (let i = 0; i < 14; i += 1) attempts.push(await loginAttempt());

  const blocked = attempts.filter(r => r.status === 429);
  const last = attempts.at(-1);
  const hasLimitHeaders = Boolean(last.headers.get('x-ratelimit-limit'));
  const hasRetryAfter = Boolean(last.headers.get('retry-after'));

  console.log(`  ${blocked.length > 0 ? '✅' : '❌'} 14 logins seguidos → ${blocked.length} bloqueados con 429`);
  console.log(`  ${hasLimitHeaders ? '✅' : '❌'} Headers X-RateLimit-* presentes`);
  console.log(`  ${hasRetryAfter ? '✅' : '❌'} Retry-After presente en el 429`);

  // 5. Health check con métricas de pool/concurrencia
  const health = await (await getHealth()).json();
  const hasMetrics = Boolean(health.db && health.concurrency && health.caches);
  console.log(`  ${hasMetrics ? '✅' : '❌'} /health expone db + concurrencia + cachés`);
  if (hasMetrics) {
    console.log(`     pool: total=${health.db.total} idle=${health.db.idle} waiting=${health.db.waiting}`);
    console.log(`     bulkhead: aceptadas=${health.concurrency.accepted} encoladas=${health.concurrency.totalQueued} en cola ahora=${health.concurrency.queueLength} rechazadas=${health.concurrency.rejected}`);
    const products = health.caches.find(c => c.name === 'products');
    if (products) console.log(`     caché products: hits=${products.hits} misses=${products.misses} coalesced=${products.coalesced}`);
  }

  const passed = [cacheControl, etag, notModified, blocked.length > 0, hasLimitHeaders, hasRetryAfter, hasMetrics]
    .filter(Boolean).length;
  RESULTS.push({ label: 'Mecanismos de carga (7 checks)', ok: passed, total: 7, errors: 7 - passed });
}

// ─── Resumen final ────────────────────────────────────────────────────────────

function printSummary() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║              RESUMEN EJECUTIVO                      ║');
  console.log('╠══════════════════════════════════════════════════════╣');

  let overallOk = true;
  for (const r of RESULTS) {
    const errorRate = r.total > 0 ? ((r.errors / r.total) * 100).toFixed(1) : '0.0';
    const status    = r.errors === 0 ? '✅' : r.errors / r.total < 0.05 ? '⚠️ ' : '❌';
    if (r.errors > 0) overallOk = false;
    const avgStr = r.avg != null ? `avg ${fmt(r.avg)}ms` : '';
    const p90Str = r.p90 != null ? `p90 ${fmt(r.p90)}ms` : '';
    console.log(`║ ${status} ${r.label.slice(0, 38).padEnd(38)} ${errorRate.padStart(4)}% err ║`);
    if (avgStr) console.log(`║    ${avgStr.padEnd(20)} ${p90Str.padEnd(20)}          ║`);
  }

  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║ RESULTADO GLOBAL: ${overallOk ? '✅  SIN ERRORES' : '⚠️   HAY ERRORES — REVISAR ARRIBA'}`.padEnd(54) + '║');
  console.log('╚══════════════════════════════════════════════════════╝');

  console.log('\nThresholds recomendados para producción:');
  console.log('  • p90 < 800ms en endpoints públicos');
  console.log('  • Error rate < 1% bajo 50 VUs');
  console.log('  • Stock siempre consistente (0 inconsistencias)');
  console.log('  • Sin degradación progresiva entre batches de 5 → 50 VUs');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

(async () => {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   LIA Store — Load & Concurrency Test               ║');
  console.log(`║   Base URL: ${BASE.slice(0, 40).padEnd(40)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\nFecha: ${new Date().toISOString()}`);

  // Health check previo
  try {
    const health = await fetch(`${API}/products`);
    console.log(`\n✅ Backend accesible — status ${health.status}`);
  } catch (err) {
    console.error(`\n❌ No se puede conectar al backend en ${BASE}`);
    console.error(`   Asegurate de que el servidor esté corriendo: cd BACK/lia-store && npm start`);
    console.error(`   Error: ${err.message}`);
    process.exit(1);
  }

  await suiteProductLoad();
  await suiteProductDetail();
  await suiteHomeConcurrent();
  await suiteRapidNavigation();
  await suiteStockRaceDetect();
  await suiteShippingConcurrent();
  await suiteLoadMechanics();

  printSummary();
})();
