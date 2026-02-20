// @TASK P3-R1-T2 - Chamgab API - 분석 요청

// 동적 렌더링 강제 (Supabase 사용)
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:8000'
const ANON_DAILY_LIMIT = (() => {
  const n = Number(process.env.ANON_DAILY_ANALYSIS_LIMIT || 3)
  if (!Number.isFinite(n)) return 3
  return Math.min(Math.max(Math.trunc(n), 1), 100)
})()

const HOME_PRICE_CREDIT_COST = (() => {
  const n = Number(process.env.CREDIT_COST_HOME_PRICE || 2)
  if (!Number.isFinite(n)) return 2
  return Math.min(Math.max(Math.trunc(n), 1), 100)
})()

function getClientIp(req: NextRequest) {
  const xf = req.headers.get('x-forwarded-for')
  if (xf) return xf.split(',')[0]?.trim() || null
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-vercel-forwarded-for') ||
    (process.env.NODE_ENV !== 'production' ? '127.0.0.1' : null)
  )
}

function hashIp(ip: string) {
  // Store only a short hash to avoid logging raw IPs.
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32)
}

async function logEvent(params: {
  property_id: string
  analysis_id?: string | null
  actor_user_id?: string | null
  status: 'success' | 'error' | 'timeout'
  http_status?: number | null
  error_code?: string | null
  error_message?: string | null
  request?: Record<string, unknown>
}) {
  // Best-effort: require service key in server env.
  try {
    const admin = createAdminClient()
    await admin.from('chamgab_analysis_events').insert({
      property_id: params.property_id,
      analysis_id: params.analysis_id || null,
      actor_user_id: params.actor_user_id || null,
      status: params.status,
      http_status: params.http_status ?? null,
      error_code: params.error_code ?? null,
      error_message: params.error_message ?? null,
      request: params.request ?? {},
    })
  } catch {
    // ignore
  }
}

/**
 * POST /api/chamgab
 * 참값 분석 요청 (ML API 호출)
 *
 * Body (둘 중 하나):
 *   - { property_id } — 매물 ID로 직접 분석
 *   - { complex_id, area_type, floor, dong?, direction? } — 단지 기반 분석
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const {
      property_id,
      complex_id,
      area_type,
      floor,
      dong,
      direction,
      force,
    } = body

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const actorUserId = user?.id || null

    if (!property_id && !complex_id) {
      return NextResponse.json(
        { error: 'property_id or complex_id is required' },
        { status: 400 }
      )
    }

    // complex_id → 해당 단지의 매물 ID 조회
    let resolvedPropertyId = property_id
    if (!resolvedPropertyId && complex_id) {
      const { data: property } = await supabase
        .from('properties')
        .select('id')
        .eq('complex_id', complex_id)
        .limit(1)
        .single()

      if (property) {
        resolvedPropertyId = property.id
      }
    }

    // 캐시된 분석 결과 확인 (force=true면 무시)
    if (resolvedPropertyId && !force) {
      const { data: existingAnalysis } = await supabase
        .from('chamgab_analyses')
        .select('*')
        .eq('property_id', resolvedPropertyId)
        .gt('expires_at', new Date().toISOString())
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .single()

      if (existingAnalysis) {
        // optional: do not log cache hits to reduce noise
        return NextResponse.json({
          analysis: existingAnalysis,
          cached: true,
        })
      }
    }

    // ML API에 넘길 features 구성
    const features: Record<string, unknown> = {}
    if (area_type) features.area_type = area_type
    if (floor) features.floor = floor
    if (dong) features.dong = dong
    if (direction) features.direction = direction
    if (complex_id) features.complex_id = complex_id

    // Atomic credit consumption (only for authenticated users, only when hitting ML).
    if (actorUserId) {
      const { data: quotaRows, error: quotaError } = await supabase.rpc(
        'consume_user_credits',
        {
          p_product: 'home_price',
          p_cost: HOME_PRICE_CREDIT_COST,
          p_meta: { property_id: resolvedPropertyId || complex_id, features },
        }
      )

      if (quotaError) {
        await logEvent({
          property_id: resolvedPropertyId || String(complex_id),
          actor_user_id: actorUserId,
          status: 'error',
          http_status: 500,
          error_code: 'CREDITS_RPC_ERROR',
          error_message: quotaError.message,
          request: { property_id: resolvedPropertyId || complex_id, features },
        })
        return NextResponse.json(
          { error: 'Credit check failed' },
          { status: 500 }
        )
      }

      const q = Array.isArray(quotaRows) ? quotaRows[0] : null
      if (!q?.allowed) {
        await logEvent({
          property_id: resolvedPropertyId || String(complex_id),
          actor_user_id: actorUserId,
          status: 'error',
          http_status: 429,
          error_code: 'CREDITS_EXCEEDED',
          error_message: '크레딧이 부족합니다.',
          request: { property_id: resolvedPropertyId || complex_id, features },
        })
        return NextResponse.json(
          {
            error: '크레딧이 부족합니다.',
            quota: q,
          },
          { status: 429 }
        )
      }
    } else {
      // Anonymous quota: service-side limit per (hashed) IP.
      const ip = getClientIp(request)
      if (!ip) {
        return NextResponse.json(
          { error: '로그인이 필요합니다.' },
          { status: 401 }
        )
      }
      const ipHash = hashIp(ip)
      try {
        const admin = createAdminClient()
        const { data: anonRows, error: anonError } = await admin.rpc(
          'consume_anonymous_analysis_quota',
          { p_ip_hash: ipHash, p_cost: 1, p_limit: ANON_DAILY_LIMIT }
        )

        if (anonError) {
          await logEvent({
            property_id: resolvedPropertyId || String(complex_id),
            actor_user_id: null,
            status: 'error',
            http_status: 500,
            error_code: 'ANON_QUOTA_RPC_ERROR',
            error_message: anonError.message,
            request: {
              property_id: resolvedPropertyId || complex_id,
              features,
              ip_hash: ipHash,
            },
          })
          return NextResponse.json(
            { error: 'Credit check failed' },
            { status: 500 }
          )
        }

        const q = Array.isArray(anonRows) ? anonRows[0] : null
        if (!q?.allowed) {
          await logEvent({
            property_id: resolvedPropertyId || String(complex_id),
            actor_user_id: null,
            status: 'error',
            http_status: 429,
            error_code: 'ANON_QUOTA_EXCEEDED',
            error_message: '비로그인 일일 분석 한도를 초과했습니다.',
            request: {
              property_id: resolvedPropertyId || complex_id,
              features,
              ip_hash: ipHash,
            },
          })
          return NextResponse.json(
            {
              error:
                '비로그인 일일 분석 한도를 초과했습니다. 로그인 후 이용해주세요.',
              quota: q,
            },
            { status: 429 }
          )
        }
      } catch {
        return NextResponse.json(
          { error: 'Credit check failed' },
          { status: 500 }
        )
      }
    }

    // ML API 호출 (10초 타임아웃)
    let prediction
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const mlResponse = await fetch(`${ML_API_URL}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: resolvedPropertyId || complex_id,
          features,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!mlResponse.ok) {
        const text = await mlResponse.text().catch(() => '')
        await logEvent({
          property_id: resolvedPropertyId || String(complex_id),
          actor_user_id: actorUserId,
          status: 'error',
          http_status: mlResponse.status,
          error_code: 'ML_API_ERROR',
          error_message: text || 'ML API response not ok',
          request: { property_id: resolvedPropertyId || complex_id, features },
        })
        const err = new Error('ML_API_HTTP_ERROR') as Error & {
          __logged?: boolean
        }
        err.__logged = true
        throw err
      }

      prediction = await mlResponse.json()
    } catch (mlError) {
      console.error('[Chamgab API] ML API error:', mlError)
      const isTimeout =
        mlError instanceof DOMException && mlError.name === 'AbortError'

      if (!(mlError as Error & { __logged?: boolean })?.__logged) {
        await logEvent({
          property_id: resolvedPropertyId || String(complex_id),
          actor_user_id: actorUserId,
          status: isTimeout ? 'timeout' : 'error',
          http_status: isTimeout ? 504 : 503,
          error_code: isTimeout ? 'TIMEOUT' : 'ML_UNAVAILABLE',
          error_message: isTimeout
            ? '분석 요청 시간이 초과되었습니다.'
            : 'ML API unavailable',
          request: { property_id: resolvedPropertyId || complex_id, features },
        })
      }
      return NextResponse.json(
        {
          error: isTimeout
            ? '분석 요청 시간이 초과되었습니다.'
            : 'ML API unavailable',
        },
        { status: isTimeout ? 504 : 503 }
      )
    }

    // 분석 결과 저장 (resolvedPropertyId가 있을 때만)
    if (resolvedPropertyId) {
      const { data: newAnalysis, error } = await supabase
        .from('chamgab_analyses')
        .insert({
          property_id: resolvedPropertyId,
          user_id: actorUserId,
          chamgab_price: prediction.chamgab_price,
          min_price: prediction.min_price,
          max_price: prediction.max_price,
          confidence: prediction.confidence,
        })
        .select()
        .single()

      if (error) {
        console.error('[Chamgab API] DB save error:', error.message)
        await logEvent({
          property_id: resolvedPropertyId,
          actor_user_id: actorUserId,
          status: 'error',
          http_status: 500,
          error_code: 'DB_SAVE_ERROR',
          error_message: error.message,
          request: { property_id: resolvedPropertyId, features },
        })
        return NextResponse.json({ analysis: prediction, saved: false })
      }

      await logEvent({
        property_id: resolvedPropertyId,
        analysis_id: newAnalysis.id,
        actor_user_id: actorUserId,
        status: 'success',
        http_status: 200,
        request: { property_id: resolvedPropertyId, features },
      })
      return NextResponse.json({ analysis: newAnalysis, saved: true })
    }

    // 매칭 매물이 없으면 예측 결과만 반환
    await logEvent({
      property_id: String(complex_id),
      actor_user_id: actorUserId,
      status: 'success',
      http_status: 200,
      request: { property_id: complex_id, features },
    })
    return NextResponse.json({ analysis: prediction, saved: false })
  } catch (error) {
    console.error('[Chamgab API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
