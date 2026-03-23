// Tracker en memoria para rate limits de signup por email.
// Solo registra eventos cuando Supabase devuelve un error de rate limit.
// Las lecturas nunca modifican el estado.

const store = new Map(); // email -> { count, cooldownUntil, windowStart }

const WINDOW_MS  = 60 * 60 * 1000; // 1 hora — después de esto se resetea el contador
const COOLDOWN_MS = 60 * 1000;     // 60s de cooldown tras cada rate limit de Supabase
const MAX_RATE_LIMITS = 6;

const getRecord = (email) => {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const record = store.get(key);
  if (!record || now - record.windowStart > WINDOW_MS) {
    return null;
  }
  return record;
};

const buildStatus = (record) => {
  if (!record) {
    return { blocked: false, count: 0, remainingSeconds: 0, remainingAttempts: MAX_RATE_LIMITS };
  }
  const now = Date.now();
  const inCooldown = now < record.cooldownUntil;
  return {
    blocked: inCooldown,
    count: record.count,
    remainingSeconds: inCooldown ? Math.ceil((record.cooldownUntil - now) / 1000) : 0,
    remainingAttempts: Math.max(0, MAX_RATE_LIMITS - record.count),
  };
};

/** Solo lectura: devuelve el estado actual de rate limit sin modificar nada. */
const getStatus = (email) => buildStatus(getRecord(email));

/** Llamar únicamente cuando Supabase devolvió un error de rate limit. */
const recordRateLimit = (email) => {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const record = getRecord(email);

  const updated = {
    count: (record?.count ?? 0) + 1,
    cooldownUntil: now + COOLDOWN_MS,
    windowStart: record?.windowStart ?? now,
  };

  store.set(key, updated);
  return buildStatus(updated);
};

module.exports = { getStatus, recordRateLimit };
