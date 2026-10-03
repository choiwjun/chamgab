import 'server-only'

import { neon } from '@neondatabase/serverless'
import { NeonPostgrestClient } from '@neondatabase/neon-js'
import { databaseFetch } from './sql-fetch'

export function createAdminClient() {
  // These routes cover legacy SQL tables without a generated client schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new NeonPostgrestClient<any>({
    dataApiUrl: 'https://database.internal/rest/v1',
    options: { global: { fetch: databaseFetch } },
  })
  return Object.assign(client, {
    auth: {
      admin: {
        async updateUserById(
          userId: string,
          attributes: { ban_duration?: string }
        ) {
          try {
            const duration = attributes.ban_duration || 'none'
            const banned = duration !== 'none'
            if (banned && !/^\d+(?:h|m|s|d)$/.test(duration))
              throw new Error('Invalid ban duration')
            const unit = duration.slice(-1)
            const multiplier = { h: 3600, m: 60, s: 1, d: 86400 }[unit] || 0
            const until = banned
              ? new Date(
                  Date.now() + parseInt(duration, 10) * multiplier * 1000
                ).toISOString()
              : null
            const sql = neon(process.env.DATABASE_URL!)
            const rows =
              await sql`UPDATE neon_auth."user" SET banned=${banned}, "banExpires"=${until}::timestamptz, "updatedAt"=now() WHERE id=${userId}::uuid RETURNING id, "banExpires" AS banned_until`
            if (!rows.length) throw new Error('User not found')
            if (banned)
              await sql`DELETE FROM neon_auth.session WHERE "userId"=${userId}::uuid`
            return {
              data: {
                user: rows[0] as { id: string; banned_until: string | null },
              },
              error: null,
            }
          } catch (error) {
            return {
              data: { user: null },
              error: {
                message:
                  error instanceof Error ? error.message : 'User update failed',
              },
            }
          }
        },
      },
    },
  })
}
