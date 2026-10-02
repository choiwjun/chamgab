import { writeFileSync } from 'node:fs'

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]
const optional = [
  'NEXT_PUBLIC_KAKAO_MAP_KEY',
  'ML_API_URL',
  'NEXT_PUBLIC_ML_API_URL',
  'ML_ADMIN_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'NAVER_CLIENT_ID',
  'NAVER_CLIENT_SECRET',
  'ADMIN_EMAILS',
  'NEXT_PUBLIC_SITE_URL',
  'APP_BASE_URL',
]

const missing = required.filter((name) => !process.env[name]?.trim())
if (missing.length) {
  throw new Error(`Missing deployment settings: ${missing.join(', ')}`)
}

const secrets = Object.fromEntries(
  [...required, ...optional]
    .filter((name) => process.env[name]?.trim())
    .map((name) => [name, process.env[name].trim()])
)
writeFileSync('.cloudflare-secrets.json', JSON.stringify(secrets), { mode: 0o600 })
console.log(`Prepared ${Object.keys(secrets).length} runtime settings securely.`)
