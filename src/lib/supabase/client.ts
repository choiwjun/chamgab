import { createBrowserClient } from '@supabase/ssr'

function getProjectRefFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.host || ''
    // https://<ref>.supabase.co
    const ref = host.split('.')[0]
    return ref || null
  } catch {
    return null
  }
}

function getCookieMap(): Map<string, string> {
  const map = new Map<string, string>()
  if (typeof document === 'undefined') return map
  const raw = document.cookie || ''
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=')
    if (idx < 0) return
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!name) return
    map.set(name, value)
  })
  return map
}

function setCookie(name: string, value: string, maxAgeSeconds?: number) {
  if (typeof document === 'undefined') return
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:'
  const attrs = [
    `Path=/`,
    `SameSite=Lax`,
    maxAgeSeconds != null ? `Max-Age=${maxAgeSeconds}` : null,
    secure ? 'Secure' : null,
  ].filter(Boolean)

  document.cookie = `${name}=${value}; ${attrs.join('; ')}`
}

function deleteCookie(name: string) {
  setCookie(name, '', 0)
}

function combineCookieChunks(
  cookies: Map<string, string>,
  key: string
): string | null {
  const direct = cookies.get(key)
  if (direct) return direct
  const parts: string[] = []
  for (let i = 0; ; i += 1) {
    const v = cookies.get(`${key}.${i}`)
    if (!v) break
    parts.push(v)
  }
  return parts.length ? parts.join('') : null
}

function base64UrlDecodeToString(base64url: string): string {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4))
  const bin = atob(base64 + pad)
  // Convert to UTF-8 string if needed.
  try {
    const pct = Array.from(bin)
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
    return decodeURIComponent(pct)
  } catch {
    return bin
  }
}

function base64UrlEncodeFromString(str: string): string {
  const utf8 = unescape(encodeURIComponent(str))
  const b64 = btoa(utf8)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function chunkString(s: string, chunkSize: number): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += chunkSize)
    out.push(s.slice(i, i + chunkSize))
  return out
}

/**
 * Fix/clear corrupted Supabase auth cookie value that was stored as a JSON string literal.
 *
 * Symptom (client):
 *   TypeError: Cannot create property 'user' on string '{"access_token":...}'
 */
function repairSupabaseAuthCookie() {
  if (typeof document === 'undefined') return

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const ref = getProjectRefFromUrl(supabaseUrl)
  if (!ref) return

  const key = `sb-${ref}-auth-token`
  const cookies = getCookieMap()
  const raw = combineCookieChunks(cookies, key)
  if (!raw) return

  // Decode if base64url encoded cookie.
  let decoded = raw
  const BASE64_PREFIX = 'base64-'
  if (decoded.startsWith(BASE64_PREFIX)) {
    decoded = base64UrlDecodeToString(decoded.slice(BASE64_PREFIX.length))
  }

  const trimmed = decoded.trim()

  // If it's already a JSON object string, nothing to do.
  if (trimmed.startsWith('{') && trimmed.includes('"access_token"')) return

  // If it's a JSON string literal of the JSON object, unwrap once.
  const looksLikeJsonStringLiteral =
    trimmed.startsWith('"') &&
    trimmed.endsWith('"') &&
    (trimmed.includes('\\\"access_token\\\"') ||
      trimmed.includes('access_token'))

  if (!looksLikeJsonStringLiteral) return

  try {
    const unwrapped = JSON.parse(trimmed)
    if (typeof unwrapped !== 'string') return
    const payload = unwrapped.trim()
    if (!payload.startsWith('{') || !payload.includes('"access_token"')) return

    // Re-encode with base64url and chunking like @supabase/ssr.
    const encoded = `${BASE64_PREFIX}${base64UrlEncodeFromString(payload)}`

    // Remove existing chunks.
    cookies.forEach((_, name) => {
      if (name === key || name.startsWith(key + '.')) deleteCookie(name)
    })

    const chunks = chunkString(encoded, 3180)
    if (chunks.length === 1) {
      setCookie(key, chunks[0])
    } else {
      chunks.forEach((v, i) => setCookie(`${key}.${i}`, v))
    }
  } catch {
    // If repair fails, clear cookies so the app doesn't crash.
    cookies.forEach((_, name) => {
      if (name === key || name.startsWith(key + '.')) deleteCookie(name)
    })
  }
}

export function createClient() {
  if (typeof window !== 'undefined') {
    // Must run before Supabase client initializes and tries to recover session.
    repairSupabaseAuthCookie()
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Explicit to avoid accidental raw-cookie drift across environments.
      cookieEncoding: 'base64url',
    }
  )
}
