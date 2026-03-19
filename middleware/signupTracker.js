// In-memory tracker for signup rate limits per email.
// Only records when Supabase actually returns a rate limit error.
// Read operations never modify state.

const store = new Map(); // email -> { count, cooldownUntil, windowStart }

const WINDOW_MS  = 60 * 60 * 1000; // 1 hour — after this, reset count
const COOLDOWN_MS = 60 * 1000;     // 60s cooldown after each Supabase rate limit
const MAX_RATE_LIMITS = 6;

const getRecord = (email) => {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const record = store.get(key);
  if (!record || now - record.windowStart > WINDOW_MS) {
    return null; // no record or expired
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

/**
 * Read-only: returns current rate limit status for the email without modifying anything.
 */
const getStatus = (email) => buildStatus(getRecord(email));

/**
 * Called only when Supabase returned a rate limit error.
 * Records the event and sets a 60s cooldown.
 */
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
