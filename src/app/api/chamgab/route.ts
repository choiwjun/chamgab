// @TASK P3-R1-T2 - Chamgab API - ?브쑴苑??遺욧퍕

// ??덉읅 ???쐭筌?揶쏅벡??(Supabase ????
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildChamgabQuality, deriveChamgabQualityMeta } from './_quality'
import {
  CreditConsumeError,
  consumeCredits,
  insufficientCreditsPayload,
} from '@/lib/credits/consume'
import { getCreditCost } from '@/lib/credits/cost'
import { ENABLE_FREE_OPEN_MODE } from '@/lib/features'
import crypto from 'crypto'

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:8000'
const MAPPING_RECOVERY_JOB_TYPE =
  process.env.MAPPING_RECOVERY_JOB_TYPE || 'chamgab_gap_recovery_full'
const MAPPING_RECOVERY_RETRY_AFTER_SECONDS = (() => {
  const n = Number(process.env.MAPPING_RECOVERY_RETRY_AFTER_SECONDS || 300)
  if (!Number.isFinite(n)) return 300
  return Math.min(Math.max(Math.trunc(n), 30), 3600)
})()
const ENABLE_MAPPING_RECOVERY_QUEUE =
  String(process.env.ENABLE_MAPPING_RECOVERY_QUEUE || 'true').toLowerCase() !==
  'false'
const ANON_DAILY_LIMIT = (() => {
  const n = Number(process.env.ANON_DAILY_ANALYSIS_LIMIT || 3)
  if (!Number.isFinite(n)) return 3
  return Math.min(Math.max(Math.trunc(n), 1), 100)
})()

const HOME_PRICE_CREDIT_COST = getCreditCost('home_price')

const ANALYSIS_PUBLIC_SELECT =
  'id,property_id,chamgab_price,min_price,max_price,confidence,analyzed_at,expires_at,created_at'
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

function hasInputValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function parsePositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null
  const parsed = Number(raw.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function pickClosestPropertyId(
  rows: Array<{ id?: unknown; area_exclusive?: unknown }>,
  areaExclusive: number | null
): string | null {
  if (!Array.isArray(rows) || rows.length === 0) return null

  if (areaExclusive && Number.isFinite(areaExclusive)) {
    const sorted = [...rows].sort((a, b) => {
      const aArea =
        typeof a.area_exclusive === 'number' ? a.area_exclusive : Number.NaN
      const bArea =
        typeof b.area_exclusive === 'number' ? b.area_exclusive : Number.NaN
      const aDiff = Number.isFinite(aArea)
        ? Math.abs(aArea - areaExclusive)
        : 1e9
      const bDiff = Number.isFinite(bArea)
        ? Math.abs(bArea - areaExclusive)
        : 1e9
      return aDiff - bDiff
    })

    for (const row of sorted) {
      if (typeof row.id === 'string' && UUID_REGEX.test(row.id)) {
        return row.id
      }
    }
    return null
  }

  for (const row of rows) {
    if (typeof row.id === 'string' && UUID_REGEX.test(row.id)) {
      return row.id
    }
  }
  return null
}

function parseUpstreamErrorMessage(raw: string): string | null {
  const text = (raw || '').trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown }
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) {
      return parsed.detail.trim()
    }
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim()
    }
  } catch {
    // ignore non-JSON payload
  }
  return text.length > 300 ? `${text.slice(0, 300)}...` : text
}

async function queueMappingRecoveryJob() {
  if (!ENABLE_MAPPING_RECOVERY_QUEUE) {
    return { queued: false, reason: 'queue_disabled' as const }
  }

  const adminToken =
    process.env.ML_ADMIN_TOKEN ||
    process.env.SCHEDULER_ADMIN_TOKEN ||
    process.env.ADMIN_API_TOKEN
  if (!adminToken) {
    return { queued: false, reason: 'missing_admin_token' as const }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  try {
    const response = await fetch(`${ML_API_URL}/api/scheduler/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken,
      },
      body: JSON.stringify({ job_type: MAPPING_RECOVERY_JOB_TYPE }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        queued: false,
        reason: `http_${response.status}`,
        detail: parseUpstreamErrorMessage(text),
      }
    }

    return { queued: true as const }
  } catch (error) {
    clearTimeout(timeout)
    return {
      queued: false,
      reason:
        error instanceof DOMException && error.name === 'AbortError'
          ? 'timeout'
          : 'network_error',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
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
 * 筌〓㈇而??브쑴苑??遺욧퍕 (ML API ?紐꾪뀱)
 *
 * Body (??餓???롪돌):
 *   - { property_id } ??筌띲끇窺 ID嚥?筌욊낯???브쑴苑?
 *   - { complex_id, area_type, floor, dong?, direction? } ????? 疫꿸퀡而??브쑴苑?
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
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

    const hasFeatureOverrides = [area_type, floor, dong, direction].some(
      hasInputValue
    )
    const shouldUseCache = !force && !hasFeatureOverrides
    const shouldPersistAnalysis = !hasFeatureOverrides

    const features: Record<string, unknown> = {}
    if (hasInputValue(area_type)) features.area_type = area_type
    const areaExclusive = parsePositiveNumber(area_type)
    if (areaExclusive) features.area_exclusive = areaExclusive
    if (hasInputValue(floor)) features.floor = floor
    if (hasInputValue(dong)) features.dong = dong
    if (hasInputValue(direction)) features.direction = direction
    if (complex_id) features.complex_id = complex_id

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

    // Treat invalid property_id as absent to avoid uuid cast errors downstream.
    const hasValidPropertyId =
      typeof property_id === 'string' && UUID_REGEX.test(property_id)
    let resolvedPropertyId = hasValidPropertyId ? property_id : null
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

    // Fallback when properties.complex_id links are missing:
    // resolve by (complex name + sigungu) and nearest area_exclusive.
    if (!resolvedPropertyId && complex_id) {
      const { data: complex } = await supabase
        .from('complexes')
        .select('name,sigungu')
        .eq('id', complex_id)
        .maybeSingle()

      const complexName = normalizeText(complex?.name)
      const complexSigungu = normalizeText(complex?.sigungu)

      const findByName = async (useLike: boolean) => {
        let query = supabase
          .from('properties')
          .select('id,area_exclusive')
          .eq('sigungu', complexSigungu)

        query = useLike
          ? query.ilike('name', `%${complexName}%`)
          : query.eq('name', complexName)

        if (areaExclusive) {
          query = query
            .gte('area_exclusive', areaExclusive * 0.88)
            .lte('area_exclusive', areaExclusive * 1.12)
        }

        const { data } = await query.limit(20)
        return pickClosestPropertyId(
          Array.isArray(data)
            ? (data as Array<{ id?: unknown; area_exclusive?: unknown }>)
            : [],
          areaExclusive
        )
      }

      if (complexName && complexSigungu) {
        resolvedPropertyId = await findByName(false)
        if (!resolvedPropertyId) {
          resolvedPropertyId = await findByName(true)
        }
      }
    }
    const canUseResolvedPropertyId =
      typeof resolvedPropertyId === 'string' &&
      UUID_REGEX.test(resolvedPropertyId)

    if (property_id && !hasValidPropertyId && !complex_id) {
      return NextResponse.json(
        { error: 'invalid_property_id', code: 'INVALID_PROPERTY_ID' },
        { status: 400 }
      )
    }

    if (!canUseResolvedPropertyId) {
      const recovery = await queueMappingRecoveryJob()
      await logEvent({
        property_id: String(complex_id || property_id || 'unknown'),
        actor_user_id: actorUserId,
        status: 'error',
        http_status: 202,
        error_code: 'MAPPING_PENDING',
        error_message:
          'Property mapping is pending and recovery job was requested',
        request: {
          property_id,
          complex_id,
          features,
          recovery_job_type: MAPPING_RECOVERY_JOB_TYPE,
          recovery_job_queued: recovery.queued,
          recovery_job_reason: recovery.queued ? null : recovery.reason,
          recovery_job_detail: recovery.queued ? null : recovery.detail,
        },
      })
      return NextResponse.json(
        {
          error:
            '해당 단지는 아직 분석 매물 매핑이 진행 중입니다. 잠시 후 다시 시도해주세요.',
          code: 'MAPPING_PENDING',
          recovery_job_type: MAPPING_RECOVERY_JOB_TYPE,
          recovery_job_queued: recovery.queued,
          retry_after_seconds: MAPPING_RECOVERY_RETRY_AFTER_SECONDS,
        },
        {
          status: 202,
          headers: {
            'Retry-After': String(MAPPING_RECOVERY_RETRY_AFTER_SECONDS),
          },
        }
      )
    }

    // 筌?Ŋ????브쑴苑?野껉퀗???類ㅼ뵥 (force=true筌??얜똻??
    if (canUseResolvedPropertyId && shouldUseCache) {
      const { data: existingAnalysis } = await admin
        .from('chamgab_analyses')
        .select(ANALYSIS_PUBLIC_SELECT)
        .eq('property_id', resolvedPropertyId)
        .gt('expires_at', new Date().toISOString())
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .single()

      if (existingAnalysis) {
        if (!ENABLE_FREE_OPEN_MODE) {
          // Count cache hits too: credits/quota is per request, not per ML execution.
          // (Avoids bypassing limits by repeatedly fetching cached analyses.)
          if (actorUserId) {
            try {
              await consumeCredits({
                supabase,
                product: 'home_price',
                cost: HOME_PRICE_CREDIT_COST,
                meta: {
                  property_id: resolvedPropertyId || complex_id,
                  features,
                  cached: true,
                },
              })
            } catch (error) {
              if (
                error instanceof CreditConsumeError &&
                error.code === 'insufficient_credits'
              ) {
                await logEvent({
                  property_id: resolvedPropertyId || String(complex_id),
                  actor_user_id: actorUserId,
                  status: 'error',
                  http_status: error.status,
                  error_code: 'CREDITS_EXCEEDED',
                  error_message: error.message,
                  request: {
                    property_id: resolvedPropertyId || complex_id,
                    features,
                    cached: true,
                  },
                })
                return NextResponse.json(
                  insufficientCreditsPayload(error.quota),
                  { status: error.status }
                )
              }

              await logEvent({
                property_id: resolvedPropertyId || String(complex_id),
                actor_user_id: actorUserId,
                status: 'error',
                http_status: 500,
                error_code: 'CREDITS_RPC_ERROR',
                error_message:
                  error instanceof Error
                    ? error.message
                    : 'Credit check failed',
                request: {
                  property_id: resolvedPropertyId || complex_id,
                  features,
                  cached: true,
                },
              })
              return NextResponse.json(
                { error: 'Credit check failed' },
                { status: 500 }
              )
            }
          } else {
            const ip = getClientIp(request)
            if (!ip) {
              return NextResponse.json(
                { error: 'not_authenticated', code: 'AUTH_REQUIRED' },
                { status: 401 }
              )
            }
            const ipHash = hashIp(ip)
            try {
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
                    cached: true,
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
                  error_message: 'Guest daily limit exceeded',
                  request: {
                    property_id: resolvedPropertyId || complex_id,
                    features,
                    cached: true,
                    ip_hash: ipHash,
                  },
                })
                return NextResponse.json(
                  {
                    error: 'Guest daily limit exceeded',
                    code: 'ANON_QUOTA_EXCEEDED',
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
        }

        // optional: do not log cache hits to reduce noise
        const quality = await buildChamgabQuality(admin, {
          analysisId: existingAnalysis.id,
          propertyId: resolvedPropertyId || existingAnalysis.property_id,
          chamgabPrice: existingAnalysis.chamgab_price,
          confidence: existingAnalysis.confidence,
        })
        return NextResponse.json({
          analysis: existingAnalysis,
          cached: true,
          quality,
          ...deriveChamgabQualityMeta(
            quality.quality_flags || [],
            existingAnalysis.analyzed_at
          ),
        })
      }
    }

    // Atomic credit consumption (authenticated users).
    if (!ENABLE_FREE_OPEN_MODE && actorUserId) {
      try {
        await consumeCredits({
          supabase,
          product: 'home_price',
          cost: HOME_PRICE_CREDIT_COST,
          meta: { property_id: resolvedPropertyId || complex_id, features },
        })
      } catch (error) {
        if (
          error instanceof CreditConsumeError &&
          error.code === 'insufficient_credits'
        ) {
          await logEvent({
            property_id: resolvedPropertyId || String(complex_id),
            actor_user_id: actorUserId,
            status: 'error',
            http_status: error.status,
            error_code: 'CREDITS_EXCEEDED',
            error_message: error.message,
            request: {
              property_id: resolvedPropertyId || complex_id,
              features,
            },
          })
          return NextResponse.json(insufficientCreditsPayload(error.quota), {
            status: error.status,
          })
        }

        await logEvent({
          property_id: resolvedPropertyId || String(complex_id),
          actor_user_id: actorUserId,
          status: 'error',
          http_status: 500,
          error_code: 'CREDITS_RPC_ERROR',
          error_message:
            error instanceof Error ? error.message : 'Credit check failed',
          request: { property_id: resolvedPropertyId || complex_id, features },
        })
        return NextResponse.json(
          { error: 'Credit check failed' },
          { status: 500 }
        )
      }
    } else if (!ENABLE_FREE_OPEN_MODE) {
      // Anonymous quota: service-side limit per (hashed) IP.
      const ip = getClientIp(request)
      if (!ip) {
        return NextResponse.json(
          { error: 'not_authenticated', code: 'AUTH_REQUIRED' },
          { status: 401 }
        )
      }
      const ipHash = hashIp(ip)
      try {
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
            error_message:
              '??쑬以덃뉩紐꾩뵥 ??깆뵬 ?브쑴苑???뺣즲???λ뜃???됰뮸??덈뼄.',
            request: {
              property_id: resolvedPropertyId || complex_id,
              features,
              ip_hash: ipHash,
            },
          })
          return NextResponse.json(
            {
              error: 'Guest daily limit exceeded',
              code: 'ANON_QUOTA_EXCEEDED',
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

    // ML API ?紐꾪뀱 (10?????袁⑸툡??
    let prediction
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const mlResponse = await fetch(`${ML_API_URL}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: resolvedPropertyId,
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
          status?: number
          upstreamMessage?: string
        }
        err.__logged = true
        err.status = mlResponse.status
        err.upstreamMessage = parseUpstreamErrorMessage(text) || undefined
        throw err
      }

      prediction = await mlResponse.json()
    } catch (mlError) {
      console.error('[Chamgab API] ML API error:', mlError)
      const isTimeout =
        mlError instanceof DOMException && mlError.name === 'AbortError'
      const upstreamStatus =
        typeof (mlError as { status?: unknown })?.status === 'number'
          ? Number((mlError as { status?: number }).status)
          : null
      const upstreamMessage = (mlError as { upstreamMessage?: unknown })
        ?.upstreamMessage
      const normalizedUpstreamMessage =
        typeof upstreamMessage === 'string' && upstreamMessage.trim()
          ? upstreamMessage.trim()
          : null

      if (!(mlError as Error & { __logged?: boolean })?.__logged) {
        await logEvent({
          property_id: resolvedPropertyId || String(complex_id),
          actor_user_id: actorUserId,
          status: isTimeout ? 'timeout' : 'error',
          http_status: isTimeout ? 504 : 503,
          error_code: isTimeout ? 'TIMEOUT' : 'ML_UNAVAILABLE',
          error_message: isTimeout
            ? '?브쑴苑??遺욧퍕 ??볦퍢???λ뜃???뤿???щ빍??'
            : 'ML API unavailable',
          request: { property_id: resolvedPropertyId || complex_id, features },
        })
      }

      if (upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 500) {
        const mappedStatus = upstreamStatus === 422 ? 400 : upstreamStatus
        const fallbackMessage =
          mappedStatus === 404
            ? '분석 가능한 매물을 찾지 못했습니다.'
            : mappedStatus === 429
              ? '요청이 많아 잠시 후 다시 시도해주세요.'
              : '분석 요청 값이 올바르지 않습니다.'
        return NextResponse.json(
          {
            error: normalizedUpstreamMessage || fallbackMessage,
            code: mappedStatus === 404 ? 'PROPERTY_NOT_FOUND' : 'ML_API_ERROR',
          },
          { status: mappedStatus }
        )
      }

      return NextResponse.json(
        {
          error: isTimeout
            ? '?브쑴苑??遺욧퍕 ??볦퍢???λ뜃???뤿???щ빍??'
            : normalizedUpstreamMessage || 'ML API unavailable',
        },
        { status: isTimeout ? 504 : 503 }
      )
    }

    // Persist only canonical property-level analyses (no scenario overrides).
    if (canUseResolvedPropertyId && shouldPersistAnalysis) {
      const persistedPropertyId = resolvedPropertyId as string
      const { data: newAnalysis, error } = await admin
        .from('chamgab_analyses')
        .insert({
          property_id: persistedPropertyId,
          user_id: actorUserId,
          chamgab_price: prediction.chamgab_price,
          min_price: prediction.min_price,
          max_price: prediction.max_price,
          confidence: prediction.confidence,
        })
        .select(ANALYSIS_PUBLIC_SELECT)
        .single()

      if (error) {
        console.error('[Chamgab API] DB save error:', error.message)
        await logEvent({
          property_id: persistedPropertyId,
          actor_user_id: actorUserId,
          status: 'error',
          http_status: 500,
          error_code: 'DB_SAVE_ERROR',
          error_message: error.message,
          request: { property_id: persistedPropertyId, features },
        })
        const quality = await buildChamgabQuality(admin, {
          analysisId: null,
          propertyId: persistedPropertyId,
          chamgabPrice: prediction.chamgab_price,
          confidence: prediction.confidence,
        })
        return NextResponse.json({
          analysis: prediction,
          saved: false,
          quality,
          ...deriveChamgabQualityMeta(quality.quality_flags || [], null),
        })
      }

      await logEvent({
        property_id: persistedPropertyId,
        analysis_id: newAnalysis.id,
        actor_user_id: actorUserId,
        status: 'success',
        http_status: 200,
        request: { property_id: persistedPropertyId, features },
      })
      const quality = await buildChamgabQuality(admin, {
        analysisId: newAnalysis.id,
        propertyId: persistedPropertyId,
        chamgabPrice: newAnalysis.chamgab_price,
        confidence: newAnalysis.confidence,
      })
      return NextResponse.json({
        analysis: newAnalysis,
        saved: true,
        quality,
        ...deriveChamgabQualityMeta(
          quality.quality_flags || [],
          newAnalysis.analyzed_at
        ),
      })
    }

    const logPropertyId = resolvedPropertyId || String(complex_id)
    await logEvent({
      property_id: logPropertyId,
      actor_user_id: actorUserId,
      status: 'success',
      http_status: 200,
      request: { property_id: logPropertyId, features },
    })
    const quality = await buildChamgabQuality(admin, {
      analysisId: null,
      propertyId: resolvedPropertyId,
      chamgabPrice: prediction.chamgab_price,
      confidence: prediction.confidence,
    })
    return NextResponse.json({
      analysis: prediction,
      saved: false,
      quality,
      ...deriveChamgabQualityMeta(quality.quality_flags || [], null),
    })
  } catch (error) {
    console.error('[Chamgab API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/chamgab?property_id=<uuid>
 * Legacy lookup path used by compare modules.
 */
export async function GET(request: NextRequest) {
  try {
    const propertyId = (
      request.nextUrl.searchParams.get('property_id') || ''
    ).trim()
    if (!propertyId || !UUID_REGEX.test(propertyId)) {
      return NextResponse.json(
        { error: 'invalid_property_id' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const { data: analysis, error } = await admin
      .from('chamgab_analyses')
      .select(ANALYSIS_PUBLIC_SELECT)
      .eq('property_id', propertyId)
      .gt('expires_at', new Date().toISOString())
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !analysis) {
      return NextResponse.json({ analysis: null })
    }

    const quality = await buildChamgabQuality(admin, {
      analysisId: analysis.id,
      propertyId,
      chamgabPrice: analysis.chamgab_price,
      confidence: analysis.confidence,
    })
    return NextResponse.json({
      analysis,
      quality,
      ...deriveChamgabQualityMeta(
        quality.quality_flags || [],
        analysis.analyzed_at
      ),
    })
  } catch (error) {
    console.error('[Chamgab API] GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
