// Server-side admin gate (email allowlist).
// Keep this logic on the server only. Admin UI + Admin API routes should call this.
import 'server-only'

function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const allow = parseAllowlist(process.env.ADMIN_EMAILS)
  return allow.has(email.toLowerCase())
}
