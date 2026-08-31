/**
 * In-process TTL cache for derived analytics.
 *
 * Sprint health recomputes a critical path over the whole dependency graph and
 * runs 5,000 Monte Carlo trials. That work is pure — the same board state
 * always yields the same answer — but it was being redone on every poll and
 * every page load, by every member viewing the project.
 *
 * Entries are keyed by project so that any write to a project can drop all of
 * its derived data at once; correctness here depends on invalidation being
 * broad rather than clever.
 *
 * Deliberately in-process: a single API instance is the deployment target, and
 * an external cache would add an operational dependency for no gain at this
 * scale. Swapping this for Redis means reimplementing get/set/invalidate only.
 */

const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 500;

const store = new Map(); // key -> { value, expiresAt, projectId }

let hits = 0;
let misses = 0;

function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  // Map preserves insertion order, so the oldest key is the first one.
  const oldest = store.keys().next().value;
  store.delete(oldest);
}

/** Builds a cache key from a project id and any number of discriminators. */
export function cacheKey(projectId, ...parts) {
  return `${projectId}:${parts.join(':')}`;
}

export function getCached(key) {
  const entry = store.get(key);
  if (!entry) {
    misses += 1;
    return undefined;
  }
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    misses += 1;
    return undefined;
  }
  hits += 1;
  return entry.value;
}

export function setCached(key, projectId, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { value, projectId: String(projectId), expiresAt: Date.now() + ttlMs });
  evictIfNeeded();
  return value;
}

/**
 * Drops every derived entry for one project. Called on any write that could
 * change an analytic result — task edits, moves, dependency changes, sprint
 * transitions. Over-invalidating is intentional: a stale forecast is a
 * correctness bug, a redundant recompute is only a few milliseconds.
 */
export function invalidateProject(projectId) {
  const id = String(projectId);
  let dropped = 0;
  for (const [key, entry] of store) {
    if (entry.projectId === id) {
      store.delete(key);
      dropped += 1;
    }
  }
  return dropped;
}

/** Wraps an async producer with read-through caching. */
export async function withCache(key, projectId, producer, ttlMs = DEFAULT_TTL_MS) {
  const cached = getCached(key);
  if (cached !== undefined) return cached;
  const value = await producer();
  return setCached(key, projectId, value, ttlMs);
}

/** Exposed on /api/health so cache effectiveness is observable in a demo. */
export function cacheStats() {
  const total = hits + misses;
  return {
    entries: store.size,
    hits,
    misses,
    hitRate: total ? Number((hits / total).toFixed(3)) : 0,
  };
}

export function resetCache() {
  store.clear();
  hits = 0;
  misses = 0;
}
