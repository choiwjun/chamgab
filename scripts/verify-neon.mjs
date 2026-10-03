// Integration checks against the configured Neon project. Only generated users
// and their dependent records are removed; production users are untouched.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { request } from '@playwright/test'
import { neon } from '@neondatabase/serverless'
import { createClient } from '@neondatabase/neon-js'

for (const name of [
  'DATABASE_URL',
  'NEON_AUTH_BASE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_NEON_DATA_API_URL',
]) {
  assert.ok(process.env[name], `${name} is required`)
}
await mkdir('.wrangler', { recursive: true })
const output = resolve('.wrangler/neon-verification.mjs')
await build({
  entryPoints: ['src/lib/neon/admin.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: output,
  plugins: [
    {
      name: 'test-server-boundary',
      setup(builder) {
        builder.onResolve({ filter: /^server-only$/ }, () => ({
          path: 'server-only',
          namespace: 'test-only',
        }))
        builder.onLoad({ filter: /.*/, namespace: 'test-only' }, () => ({
          contents: '',
        }))
      },
    },
  ],
})
const { createAdminClient } = await import(pathToFileURL(output).href)
const sql = neon(process.env.DATABASE_URL)
const admin = createAdminClient()
const users = [],
  contexts = [],
  clients = []
const pass = (label) => console.log(`PASS ${label}`)
try {
  for (let i = 0; i < 2; i++) {
    const context = await request.newContext({
      extraHTTPHeaders: { Origin: process.env.NEXT_PUBLIC_SITE_URL },
    })
    contexts.push(context)
    const signup = await context.post(
      `${process.env.NEON_AUTH_BASE_URL}/sign-up/email`,
      {
        data: {
          email: `verify-${randomUUID()}@test.invalid`,
          password: randomUUID() + 'Aa1!',
          name: 'Deployment verification',
        },
      }
    )
    const body = await signup.json()
    assert.equal(signup.status(), 200)
    assert.ok(body.user?.id)
    users.push(body.user.id)
    const token = (
      await (
        await context.get(`${process.env.NEON_AUTH_BASE_URL}/token`)
      ).json()
    ).token
    assert.ok(token)
    clients.push(
      createClient({
        dataApi: {
          url: process.env.NEXT_PUBLIC_NEON_DATA_API_URL,
          getToken: async () => token,
        },
      })
    )
  }
  const anonymous = (
    await (
      await fetch(`${process.env.NEON_AUTH_BASE_URL}/token/anonymous`)
    ).json()
  ).token
  const publicClient = createClient({
    dataApi: {
      url: process.env.NEXT_PUBLIC_NEON_DATA_API_URL,
      getToken: async () => anonymous,
    },
  })
  let result = await publicClient
    .from('user_profiles')
    .select('id')
    .in('id', users)
  assert.equal(result.error, null)
  assert.equal(result.data.length, 0)
  pass('anonymous profile privacy')
  result = await clients[0].from('user_profiles').select('id').in('id', users)
  assert.equal(result.error, null)
  assert.deepEqual(
    result.data.map((row) => row.id),
    [users[0]]
  )
  pass('member row isolation')
  result = await clients[0]
    .from('user_profiles')
    .update({ name: 'Cross user' })
    .eq('id', users[1])
    .select('id')
  assert.equal(result.error, null)
  assert.equal(result.data.length, 0)
  pass('cross-user update blocked')
  result = await clients[0]
    .from('user_profiles')
    .update({ tier: 'premium' })
    .eq('id', users[0])
  assert.ok(result.error)
  pass('plan escalation blocked')
  result = await clients[0].rpc('admin_grant_bonus_credits', {
    p_user_id: users[0],
    p_amount: 999,
    p_reason: 'test',
  })
  assert.ok(result.error)
  pass('admin RPC escalation blocked')
  result = await clients[0]
    .from('user_profiles')
    .update({ name: 'Own profile' })
    .eq('id', users[0])
    .select('name')
    .single()
  assert.equal(result.error, null)
  assert.equal(result.data.name, 'Own profile')
  pass('own profile update')
  result = await clients[0].rpc('consume_user_credits', {
    p_product: 'apartment',
    p_cost: 1,
  })
  assert.equal(result.error, null)
  pass('member credit consumption')
  result = await admin.rpc('admin_grant_bonus_credits', {
    p_user_id: users[0],
    p_amount: 2,
    p_reason: 'deployment verification',
  })
  assert.equal(result.error, null)
  pass('privileged server credit RPC')
  result = await admin
    .from('user_profiles')
    .select('id', { count: 'exact' })
    .in('id', users)
    .range(0, 1)
  assert.equal(result.error, null)
  assert.equal(result.count, 2)
  pass('server pagination and exact count')
  result = await admin
    .from('user_profiles')
    .select('id', { head: true, count: 'exact' })
    .in('id', users)
    .not('name', 'is', null)
  assert.equal(result.error, null)
  assert.equal(result.count, 2)
  pass('server HEAD count')
  result = await admin
    .from('user_profiles')
    .select('id')
    .eq('email', "' OR 1=1 --")
  assert.equal(result.error, null)
  assert.equal(result.data.length, 0)
  pass('SQL filter values are bound')
  result = await admin
    .from('admin_users')
    .upsert(
      { user_id: users[1], role: 'viewer', is_active: false },
      { onConflict: 'user_id' }
    )
    .select('user_id')
    .single()
  assert.equal(result.error, null)
  pass('server upsert')
  result = await admin
    .from('chamgab_analyses')
    .select('id,properties(name,address,complex_id,area_exclusive)')
    .limit(1)
  assert.equal(result.error, null)
  pass('embedded property relationship')
} finally {
  for (const context of contexts) await context.dispose()
  for (const id of users)
    await sql`DELETE FROM neon_auth."user" WHERE id=${id}::uuid`
  console.log('Temporary verification accounts removed.')
}
