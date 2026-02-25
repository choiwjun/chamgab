const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value == null) return fallback
  const normalized = value.trim().toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

const toPercent = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), 0), 100)
}

export const ENABLE_FREE_OPEN_MODE =
  toBool(process.env.FREE_OPEN_MODE) ||
  toBool(process.env.NEXT_PUBLIC_FREE_OPEN_MODE)

export const ENABLE_LAND =
  toBool(process.env.ENABLE_LAND, true) ||
  toBool(process.env.NEXT_PUBLIC_ENABLE_LAND, true)

export const ENABLE_PAID_4MENU =
  toBool(process.env.ENABLE_PAID_4MENU, false) ||
  toBool(process.env.NEXT_PUBLIC_ENABLE_PAID_4MENU, false)

export const PAID_CANARY_PERCENT = toPercent(
  process.env.PAID_CANARY_PERCENT ?? process.env.NEXT_PUBLIC_PAID_CANARY_PERCENT,
  10
)

function fnv1a(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return hash >>> 0
}

export function isPaidCanaryUser(userId: string | null | undefined): boolean {
  if (!userId || PAID_CANARY_PERCENT <= 0) return false
  if (PAID_CANARY_PERCENT >= 100) return true
  return fnv1a(userId) % 100 < PAID_CANARY_PERCENT
}
