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

    const call = async (n) => {
      const r = await authed.rpc('consume_user_credits', {
        p_product: 'home_price',
        p_cost: 2,
        p_meta: { smoke: n },
      })
      if (r.error) throw new Error(`consume_user_credits #${n} failed: ${r.error.message}`)
      return r.data?.[0]
    }

    const a1 = await call(1)
    if (!a1?.allowed) throw new Error('expected allowed=true on #1')

    const a2 = await call(2)
    if (!a2?.allowed) throw new Error('expected allowed=true on #2')

    const a3 = await call(3)
    if (a3?.allowed) throw new Error('expected allowed=false on #3 (insufficient credits)')

    const g1 = await admin.rpc('admin_grant_bonus_credits', {
      p_user_id: userId,
      p_amount: 10,
      p_reason: 'smoke_grant',
      p_meta: { smoke: true },
    })
    if (g1.error) throw new Error(`admin_grant_bonus_credits failed: ${g1.error.message}`)

    // Extend daily cap, then consume from bonus (monthly is exhausted).
    const { error: capErr } = await admin
      .from('user_profiles')
      .update({ daily_credit_limit: 6 })
      .eq('id', userId)
    if (capErr) throw new Error(`daily cap update failed: ${capErr.message}`)

    const a4 = await call(4)
    if (!a4?.allowed) throw new Error('expected allowed=true on #4 after bonus+cap')

    const { data: ev, error: evErr } = await admin
      .from('credit_events')
      .select('id,delta,product,reason')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)
    if (evErr) throw new Error(`credit_events query failed: ${evErr.message}`)
    if (!ev || ev.length === 0) throw new Error('expected credit_events rows to exist')

    console.log('CREDITS_SMOKE_OK')
  } finally {
    try {
      await admin.auth.admin.deleteUser(userId)
    } catch {
      // ignore
    }
  }
}

main().catch((e) => {
  console.error('CREDITS_SMOKE_FAIL:', e?.message || e)
  process.exit(1)
})

