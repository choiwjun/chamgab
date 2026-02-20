// Quick compatibility check for ML_API_URL.
//
// What we expect for "current" Chamgab ML API:
// - GET /health returns { models: { business_model: boolean, ... }, database: { connected: boolean } }
// - POST /api/commercial/predict accepts 5-digit sigungu district_code (e.g., 11680)
//
// Usage:
//   node scripts/check_ml_api_compat.mjs 11680 Q12

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function loadEnvFile(p) {
  const txt = fs.readFileSync(p, 'utf8')
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    if (process.env[m[1]] == null) process.env[m[1]] = m[2]
  }
}

async function fetchJson(url, opts) {
  const r = await fetch(url, { cache: 'no-store', ...(opts || {}) })
  const t = await r.text()
  let j = null
  try {
    j = t ? JSON.parse(t) : null
  } catch {
    // ignore
  }
  return { status: r.status, ok: r.ok, json: j, text: t }
}

async function main() {
  const repoRoot = process.cwd()
  const envPath = path.join(repoRoot, '.env')
  if (fs.existsSync(envPath)) loadEnvFile(envPath)

  const mlUrl = process.env.ML_API_URL
  if (!mlUrl) {
    console.error('ML_API_URL not configured in .env')
    process.exit(2)
  }

  const districtCode = process.argv[2] || '11680'
  const industryCode = process.argv[3] || 'Q12'

  console.log('ML_API_URL', mlUrl)

  const h = await fetchJson(`${mlUrl}/health`)
  const models = h.json?.models
  const compat =
    h.ok &&
    models &&
    typeof models === 'object' &&
    typeof models.business_model === 'boolean'

  console.log('health_status', h.status)
  console.log('health_compat', compat)
  if (h.json) console.log('health_json_keys', Object.keys(h.json))
  else console.log('health_text_prefix', (h.text || '').slice(0, 120))

  const qs = new URLSearchParams({ district_code: districtCode, industry_code: industryCode })
  const p = await fetchJson(`${mlUrl}/api/commercial/predict?${qs.toString()}`, { method: 'POST' })
  console.log('predict_status', p.status)
  if (p.json) console.log('predict_json_keys', Object.keys(p.json))
  else console.log('predict_text_prefix', (p.text || '').slice(0, 220))

  if (!compat || !p.ok) {
    console.log('RESULT', 'INCOMPATIBLE')
    process.exit(1)
  }

  console.log('RESULT', 'OK')
}

main().catch((e) => {
  console.error('fatal', e)
  process.exit(1)
})

