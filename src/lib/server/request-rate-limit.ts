import 'server-only'

type Bucket = {
  count: number
  resetAt: number
}

type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
}

type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 20_000

function evictExpired(now: number) {
  buckets.forEach((v, k) => {
    if (v.resetAt <= now) buckets.delete(k)
  })
  if (buckets.size <= MAX_BUCKETS) return

  // Emergency cap: drop oldest reset windows first.
  const entries = Array.from(buckets.entries()).sort(
    (a, b) => a[1].resetAt - b[1].resetAt
  )
  const removeCount = buckets.size - MAX_BUCKETS
  for (let i = 0; i < removeCount; i += 1) {
    buckets.delete(entries[i][0])
  }
}

export function enforceRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const windowMs = Math.max(1, Math.trunc(options.windowMs))
  const limit = Math.max(1, Math.trunc(options.limit))
  const key = options.key.trim()
  if (!key) {
    return { allowed: false, remaining: 0, retryAfterSeconds: 1 }
  }

  evictExpired(now)

  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    const next: Bucket = { count: 1, resetAt: now + windowMs }
    buckets.set(key, next)
    return {
      allowed: true,
      remaining: Math.max(limit - 1, 0),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    }
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((current.resetAt - now) / 1000)
      ),
    }
  }

  current.count += 1
  buckets.set(key, current)
  return {
    allowed: true,
    remaining: Math.max(limit - current.count, 0),
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  }
}
