import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

function loadDotEnvFile(filepath) {
  if (!fs.existsSync(filepath)) return
  const lines = fs.readFileSync(filepath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let val = trimmed.slice(idx + 1).trim()
    if (!key) continue
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = val
  }
}

const repoRoot = process.cwd()
loadDotEnvFile(path.join(repoRoot, '.env.local'))
loadDotEnvFile(path.join(repoRoot, '.env'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey || !serviceKey) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const suffix = crypto.randomBytes(6).toString('hex')
  const email = `smoke+${suffix}@example.com`
  const password = `P@ssw0rd-${suffix}-A!`

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: 'smoke-user' },
  })
  if (cErr || !created?.user?.id) throw new Error(`createUser failed: ${cErr?.message || 'no user'}`)
  const userId = created.user.id

  try {
    // Configure small limits for deterministic tests.
    const { error: uErr } = await admin
      .from('user_profiles')
      .update({
        tier: 'free',
        daily_credit_used: 0,
        daily_credit_limit: 4,
        daily_credit_reset_at: new Date().toISOString().slice(0, 10),
        monthly_credit_used: 0,
        monthly_credit_limit: 4,
        monthly_credit_reset_at: new Date().toISOString().slice(0, 10).slice(0, 7) + '-01',
        bonus_credits: 0,
      })
      .eq('id', userId)
    if (uErr) throw new Error(`profile update failed: ${uErr.message}`)

    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: sData, error: sErr } = await anon.auth.signInWithPassword({ email, password })
    if (sErr || !sData?.session?.access_token) throw new Error(`signIn failed: ${sErr?.message || 'no session'}`)
    const token = sData.session.access_token

    const authed = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    // Credits: cost=2, daily/monthly limit=4 -> allow twice, deny third.
    const r1 = await authed.rpc('consume_user_credits', {
      p_product: 'home_price',
      p_cost: 2,
      p_meta: { test: 1 },
    })
    if (r1.error) throw new Error(`consume_user_credits #1 failed: ${r1.error.message}`)
    if (!r1.data?.[0]?.allowed) throw new Error('expected allowed=true on #1')

    const r2 = await authed.rpc('consume_user_credits', {
      p_product: 'home_price',
      p_cost: 2,
      p_meta: { test: 2 },
    })
    if (r2.error) throw new Error(`consume_user_credits #2 failed: ${r2.error.message}`)
    if (!r2.data?.[0]?.allowed) throw new Error('expected allowed=true on #2')

    const r3 = await authed.rpc('consume_user_credits', {
      p_product: 'home_price',
      p_cost: 2,
      p_meta: { test: 3 },
    })
    if (r3.error) throw new Error(`consume_user_credits #3 failed: ${r3.error.message}`)
    if (r3.data?.[0]?.allowed) throw new Error('expected allowed=false on #3 (insufficient credits)')

    // Grant bonus + extend daily cap, then consume from bonus.
    const { error: capErr } = await admin
      .from('user_profiles')
      .update({ daily_credit_limit: 6 })
      .eq('id', userId)
    if (capErr) throw new Error(`daily cap update failed: ${capErr.message}`)

    const g1 = await admin.rpc('admin_grant_bonus_credits', {
      p_user_id: userId,
      p_amount: 10,
      p_reason: 'smoke_grant',
      p_meta: { smoke: true },
    })
    if (g1.error) throw new Error(`admin_grant_bonus_credits failed: ${g1.error.message}`)

    const r4 = await authed.rpc('consume_user_credits', {
      p_product: 'home_price',
      p_cost: 2,
      p_meta: { test: 4 },
    })
    if (r4.error) throw new Error(`consume_user_credits #4 failed: ${r4.error.message}`)
    if (!r4.data?.[0]?.allowed) throw new Error('expected allowed=true on #4 after bonus+cap')

    // Anonymous quota RPC: allow 3, deny 4.
    const ipHash = crypto.createHash('sha256').update(`127.0.0.1-${suffix}`).digest('hex').slice(0, 32)
    for (let i = 0; i < 3; i++) {
      const rr = await admin.rpc('consume_anonymous_analysis_quota', { p_ip_hash: ipHash, p_cost: 1, p_limit: 3 })
      if (rr.error) throw new Error(`consume_anonymous_analysis_quota #${i + 1} failed: ${rr.error.message}`)
      if (!rr.data?.[0]?.allowed) throw new Error(`expected allowed=true on anon #${i + 1}`)
    }
    const rr4 = await admin.rpc('consume_anonymous_analysis_quota', { p_ip_hash: ipHash, p_cost: 1, p_limit: 3 })
    if (rr4.error) throw new Error(`consume_anonymous_analysis_quota #4 failed: ${rr4.error.message}`)
    if (rr4.data?.[0]?.allowed) throw new Error('expected allowed=false on anon #4')

    // Sanity: ledger exists.
    const { data: ev, error: evErr } = await admin
      .from('credit_events')
      .select('id,delta,product,reason')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)
    if (evErr) throw new Error(`credit_events query failed: ${evErr.message}`)
    if (!ev || ev.length === 0) throw new Error('expected credit_events rows to exist')

    console.log('SMOKE_OK')
  } finally {
    // Best-effort cleanup.
    try {
      await admin.auth.admin.deleteUser(userId)
    } catch {
      // ignore
    }
  }
}

main().catch((e) => {
  console.error('SMOKE_FAIL:', e?.message || e)
  process.exit(1)
})

