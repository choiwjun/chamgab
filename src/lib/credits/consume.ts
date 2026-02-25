import type { SupabaseClient } from '@supabase/supabase-js'
import { getCreditCost, type CreditProduct } from './cost'

type ConsumeCreditsRpcRow = {
  allowed: boolean
  daily_remaining: number
  monthly_remaining: number
  bonus_remaining: number
  total_remaining: number
}

export type CreditConsumeResult = ConsumeCreditsRpcRow

export class CreditConsumeError extends Error {
  readonly code: 'credit_rpc_error' | 'insufficient_credits'
  readonly status: number
  readonly quota: CreditConsumeResult | null

  constructor(params: {
    message: string
    code: 'credit_rpc_error' | 'insufficient_credits'
    status: number
    quota?: CreditConsumeResult | null
  }) {
    super(params.message)
    this.name = 'CreditConsumeError'
    this.code = params.code
    this.status = params.status
    this.quota = params.quota ?? null
  }
}

function normalizeRpcRow(value: unknown): CreditConsumeResult | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<ConsumeCreditsRpcRow>
  if (typeof row.allowed !== 'boolean') return null
  return {
    allowed: row.allowed,
    daily_remaining: Number(row.daily_remaining ?? 0),
    monthly_remaining: Number(row.monthly_remaining ?? 0),
    bonus_remaining: Number(row.bonus_remaining ?? 0),
    total_remaining: Number(row.total_remaining ?? 0),
  }
}

export async function consumeCredits(params: {
  supabase: SupabaseClient
  product: CreditProduct
  cost?: number
  meta?: Record<string, unknown>
}): Promise<CreditConsumeResult> {
  const cost = params.cost ?? getCreditCost(params.product)

  const { data, error } = await params.supabase.rpc('consume_user_credits', {
    p_product: params.product,
    p_cost: cost,
    p_meta: params.meta ?? {},
  })

  if (error) {
    throw new CreditConsumeError({
      message: error.message || 'Credit check failed',
      code: 'credit_rpc_error',
      status: 500,
    })
  }

  const row = normalizeRpcRow(Array.isArray(data) ? data[0] : data)
  if (!row) {
    throw new CreditConsumeError({
      message: 'Credit check failed',
      code: 'credit_rpc_error',
      status: 500,
    })
  }

  if (!row.allowed) {
    throw new CreditConsumeError({
      message: 'Insufficient credits',
      code: 'insufficient_credits',
      status: 429,
      quota: row,
    })
  }

  return row
}

export function insufficientCreditsPayload(quota: CreditConsumeResult | null) {
  return {
    error: 'insufficient_credits',
    code: 'insufficient_credits',
    legacy_code: 'CREDITS_EXCEEDED',
    quota,
  }
}
