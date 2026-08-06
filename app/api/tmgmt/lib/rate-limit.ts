// In-process token-bucket rate limit, keyed per license. Per serverless
// instance, so the effective ceiling is (limit × warm instances) — enough as an
// abuse cap (runaway CI, leaked key) without external infra. For strict
// cross-instance limits, back this with Vercel KV.

interface Bucket {
  tokens: number;
  last: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const refillPerMs = limit / windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: limit, last: now };
    buckets.set(key, bucket);
    if (buckets.size > 10_000) pruneStale(now, windowMs);
  } else {
    bucket.tokens = Math.min(limit, bucket.tokens + (now - bucket.last) * refillPerMs);
    bucket.last = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { ok: true, retryAfterSec: 0 };
  }

  const retryAfterSec = Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerMs / 1000));
  return { ok: false, retryAfterSec };
}

function pruneStale(now: number, windowMs: number): void {
  const cutoff = now - windowMs * 10;
  for (const [k, b] of buckets) {
    if (b.last < cutoff) buckets.delete(k);
  }
}
