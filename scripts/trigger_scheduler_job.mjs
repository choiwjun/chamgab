// Trigger ML API scheduler job remotely and (optionally) wait for completion.
//
// Usage examples:
//   node scripts/trigger_scheduler_job.mjs --job-type chamgab_autofix_apply --wait
//   node scripts/trigger_scheduler_job.mjs --job-type link_complexes --wait --timeout-seconds 7200
//   node scripts/trigger_scheduler_job.mjs --job-type chamgab_gap_recovery_full --wait --timeout-seconds 21600
//
// Required env:
//   ML_API_URL
// Optional env:
//   ML_ADMIN_TOKEN

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return
  const txt = fs.readFileSync(p, 'utf8')
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    if (process.env[m[1]] == null) process.env[m[1]] = m[2]
  }
}

function parseArgs(argv) {
  const out = {
    jobType: '',
    wait: true,
    timeoutSeconds: 7200,
    pollSeconds: 20,
    allowBusy: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--job-type') out.jobType = String(argv[++i] || '').trim()
    else if (a === '--wait') out.wait = true
    else if (a === '--no-wait') out.wait = false
    else if (a === '--allow-busy') out.allowBusy = true
    else if (a === '--timeout-seconds') out.timeoutSeconds = Number(argv[++i] || 0)
    else if (a === '--poll-seconds') out.pollSeconds = Number(argv[++i] || 0)
    else if (a === '-h' || a === '--help') out.help = true
    else throw new Error(`Unknown arg: ${a}`)
  }

  if (!out.help && !out.jobType) {
    throw new Error('--job-type is required')
  }
  if (!Number.isFinite(out.timeoutSeconds) || out.timeoutSeconds <= 0) {
    throw new Error('--timeout-seconds must be > 0')
  }
  if (!Number.isFinite(out.pollSeconds) || out.pollSeconds <= 0) {
    throw new Error('--poll-seconds must be > 0')
  }
  return out
}

function toIso() {
  return new Date().toISOString()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url, opts = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      ...opts,
    })
    const txt = await res.text()
    let json = null
    try {
      json = txt ? JSON.parse(txt) : null
    } catch {
      // keep text fallback
    }
    return { status: res.status, ok: res.ok, json, text: txt }
  } finally {
    clearTimeout(timer)
  }
}

function normalizeBaseUrl(u) {
  return String(u || '').replace(/\/+$/, '')
}

function buildHeaders(token, jsonBody = false) {
  const headers = {}
  if (token) headers['X-Admin-Token'] = token
  if (jsonBody) headers['Content-Type'] = 'application/json'
  return headers
}

async function getStatus(baseUrl, token) {
  const r = await fetchJson(`${baseUrl}/api/scheduler/status`, {
    method: 'GET',
    headers: buildHeaders(token, false),
  })
  if (!r.ok) {
    throw new Error(
      `GET /api/scheduler/status failed (${r.status}): ${r.text || JSON.stringify(r.json)}`
    )
  }
  return r.json || {}
}

async function runJob(baseUrl, token, jobType) {
  const r = await fetchJson(`${baseUrl}/api/scheduler/run`, {
    method: 'POST',
    headers: buildHeaders(token, true),
    body: JSON.stringify({ job_type: jobType }),
  })
  if (!r.ok) {
    throw new Error(
      `POST /api/scheduler/run failed (${r.status}): ${r.text || JSON.stringify(r.json)}`
    )
  }
  return r.json || {}
}

function printStatus(prefix, s) {
  const type = s.current_job_type || '-'
  const running = Boolean(s.current_job_running)
  const ok = s.current_job_ok
  const started = s.current_job_started_at || '-'
  const finished = s.current_job_finished_at || '-'
  console.log(
    `[${toIso()}] ${prefix} type=${type} running=${running} ok=${ok} started=${started} finished=${finished}`
  )
}

function formatSummary(s) {
  const result = s.current_job_result
  if (!result) return '(no current_job_result)'
  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

function hasNewRun(before, now, jobType) {
  if ((now.current_job_type || '') !== jobType) return false
  const beforeStarted = before.current_job_started_at || null
  const nowStarted = now.current_job_started_at || null
  if (!nowStarted) return false
  if (!beforeStarted) return true
  return nowStarted !== beforeStarted
}

async function main() {
  const repoRoot = process.cwd()
  loadEnvFile(path.join(repoRoot, '.env'))
  loadEnvFile(path.join(repoRoot, '.env.local'))
  loadEnvFile(path.join(repoRoot, 'ml-api', '.env'))

  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      'Usage: node scripts/trigger_scheduler_job.mjs --job-type <name> [--wait|--no-wait] [--timeout-seconds 7200] [--poll-seconds 20] [--allow-busy]'
    )
    process.exit(0)
  }

  const baseUrl = normalizeBaseUrl(process.env.ML_API_URL)
  const token = process.env.ML_ADMIN_TOKEN || ''
  if (!baseUrl) {
    throw new Error('ML_API_URL is required')
  }

  console.log(`[${toIso()}] base_url=${baseUrl}`)
  console.log(
    `[${toIso()}] job_type=${args.jobType} wait=${args.wait} timeout_seconds=${args.timeoutSeconds} poll_seconds=${args.pollSeconds} allow_busy=${args.allowBusy}`
  )

  const before = await getStatus(baseUrl, token)
  printStatus('before', before)

  if (before.current_job_running && !args.allowBusy) {
    throw new Error(
      `Scheduler is busy with '${before.current_job_type}'. Re-run with --allow-busy or after it finishes.`
    )
  }

  const queued = await runJob(baseUrl, token, args.jobType)
  console.log(`[${toIso()}] queued=${JSON.stringify(queued)}`)

  if (!args.wait) {
    console.log(`[${toIso()}] done(no-wait)`)
    return
  }

  const deadline = Date.now() + args.timeoutSeconds * 1000
  let observedStart = false
  let loops = 0

  while (Date.now() < deadline) {
    const now = await getStatus(baseUrl, token)
    loops += 1
    printStatus(`poll#${loops}`, now)

    if (!observedStart && hasNewRun(before, now, args.jobType)) {
      observedStart = true
      console.log(`[${toIso()}] observed_start=true`)
    }

    const matchesType = (now.current_job_type || '') === args.jobType
    const finishedNow =
      matchesType &&
      now.current_job_running === false &&
      Boolean(now.current_job_finished_at) &&
      (before.current_job_finished_at || null) !== (now.current_job_finished_at || null)

    if (finishedNow) {
      if (now.current_job_ok === true) {
        console.log(`[${toIso()}] result_ok=true`)
        console.log(`[${toIso()}] result_summary=${formatSummary(now)}`)
        return
      }

      const err = now.current_job_error || 'unknown scheduler error'
      console.error(`[${toIso()}] result_ok=false error=${err}`)
      console.error(`[${toIso()}] result_summary=${formatSummary(now)}`)
      process.exit(1)
    }

    await sleep(args.pollSeconds * 1000)
  }

  throw new Error(
    `Timed out after ${args.timeoutSeconds}s while waiting for job '${args.jobType}'`
  )
}

main().catch((e) => {
  console.error(`[${toIso()}] fatal=${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
