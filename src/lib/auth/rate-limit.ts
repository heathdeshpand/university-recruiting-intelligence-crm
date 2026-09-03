/**
 * In-memory fixed-window rate limiter.
 *
 * Scope: one process. That is the right fit for a single-node local or small
 * deployment and is honest about its limits -- behind multiple replicas this
 * needs to move to Redis or the database. It is applied to authentication and
 * to endpoints that start expensive pipeline work.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

// Bound the map so a flood of distinct keys cannot grow it without limit.
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_KEYS) {
    for (const [k, w] of buckets) {
      if (w.resetAt <= now) buckets.delete(k);
    }
    if (buckets.size > MAX_KEYS) buckets.clear();
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** Test helper; also used when rotating secrets invalidates prior state. */
export function resetRateLimits(): void {
  buckets.clear();
}

export const LIMITS = {
  /** Login attempts per IP. Deliberately tight. */
  LOGIN: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** Job-starting endpoints per user. Pipeline runs are expensive. */
  JOB_START: { limit: 30, windowMs: 5 * 60 * 1000 },
  /** General authenticated API traffic per user. */
  API: { limit: 600, windowMs: 60 * 1000 },
} as const;
