export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Route } from 'next'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, TrendingUp, Users, Store } from 'lucide-react'
import type { LandParcel, LandTransaction } from '@/types/land'
import { LAND_CATEGORY_LABELS } from '@/types/land'
import { buildLandCommercialAnalysis } from '@/lib/land/commercial-analysis'
import { formatNumber } from '@/lib/format'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

async function fetchParcelByPnu(pnu: string): Promise<LandParcel | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('land_parcels')
    .select('*')
    .eq('pnu', pnu)
    .single()

  if (error || !data) return null
  return data as LandParcel
}

async function fetchTransactionById(
  transactionId: string
): Promise<LandTransaction | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('land_transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('is_cancelled', false)
    .single()

  if (error || !data) return null
  return data as LandTransaction
}

function buildSyntheticParcelFromTransaction(tx: LandTransaction): LandParcel {
  const nowIso = new Date().toISOString()
  return {
    id: `tx-${tx.id}`,
    pnu: tx.parcel_id || `tx-${tx.id}`,
    sido: tx.sido,
    sigungu: tx.sigungu,
    eupmyeondong: tx.eupmyeondong || null,
    jibun: tx.jibun || null,
    land_category: tx.land_category || 'unknown',
    zoning: tx.zoning || null,
    area_m2: tx.area_m2 || null,
    location: null,
    latest_official_price_per_m2: null,
    latest_official_price_year: null,
    latest_transaction_price: tx.price || null,
    latest_transaction_date: tx.transaction_date || null,
    latest_price_per_m2: tx.price_per_m2 || null,
    created_at: tx.created_at || nowIso,
    updated_at: nowIso,
  }
}

function parsePointFromGeometry(
  location: LandParcel['location'] | string | null
): { lat: number; lng: number } | null {
  if (!location) return null
  if (typeof location === 'string') {
    const match = location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/i)
    if (!match) return null
    const lng = Number(match[1])
    const lat = Number(match[2])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }
  if (
    location.type === 'Point' &&
    Array.isArray(location.coordinates) &&
    location.coordinates.length >= 2
  ) {
    const [lng, lat] = location.coordinates
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }
  return null
}

interface PageProps {
  params: Promise<{ pnu: string }>
}

export default async function LandCommercialPage({ params }: PageProps) {
  const { pnu } = await params
  const decodedPnu = decodeURIComponent(pnu)

  let parcel = await fetchParcelByPnu(decodedPnu)
  if (!parcel && decodedPnu.startsWith('tx-')) {
    const tx = await fetchTransactionById(decodedPnu.slice(3))
    if (tx) parcel = buildSyntheticParcelFromTransaction(tx)
  }

  if (!parcel) notFound()

  const result = await buildLandCommercialAnalysis({ parcel })
  const point = parsePointFromGeometry(parcel.location)

  return (
    <main className="min-h-screen bg-[#F9FAFB]">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link
          href={
            `/land/${encodeURIComponent(decodedPnu)}` as Route
          }
          className="inline-flex items-center gap-2 text-sm text-[#8B95A1] hover:text-[#191F28]"
        >
          <ArrowLeft className="h-4 w-4" />
          토지 상세로 돌아가기
        </Link>

        <section className="mt-6 rounded-2xl border border-[#E5E8EB] bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#F59E0B]" />
                <h1 className="text-2xl font-bold text-[#191F28]">
                  {parcel.sido} {parcel.sigungu} {parcel.eupmyeondong}
                </h1>
              </div>
              <p className="mt-1 text-sm text-[#4E5968]">
                {parcel.jibun || '-'} ·{' '}
                {LAND_CATEGORY_LABELS[parcel.land_category] || parcel.land_category}
              </p>
            </div>
            <div className="rounded-xl bg-[#F6F9FF] px-4 py-3 text-right">
              <p className="text-xs text-[#8B95A1]">상업 활용도</p>
              <p className="text-2xl font-bold text-[#2F80ED]">
                {result.commercial_score}점
              </p>
            </div>
          </div>
        </section>

        {point && (
          <section className="mt-4 rounded-xl border border-[#DDE8FF] bg-[#F6F9FF] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#4E5968]">
                더 상세한 상권 비교는 상권분석 화면에서 이어서 볼 수 있습니다.
              </p>
              <Link
                href={
                  `/business-analysis?lat=${point.lat}&lng=${point.lng}` as Route
                }
                className="inline-flex items-center rounded-lg bg-[#2F80ED] px-3 py-2 text-sm font-semibold text-white hover:bg-[#276FDB]"
              >
                상세 상권분석으로
              </Link>
            </div>
          </section>
        )}

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
            <div className="flex items-center gap-2 text-[#4E5968]">
              <Users className="h-4 w-4" />
              <span className="text-sm font-semibold">일 평균 유동인구</span>
            </div>
            <p className="mt-2 text-xl font-bold text-[#191F28]">
              {formatNumber(result.foot_traffic.daily_avg)}명
            </p>
            <p className="mt-1 text-xs text-[#8B95A1]">
              피크 시간: {result.foot_traffic.peak_time}
            </p>
          </div>

          <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
            <div className="flex items-center gap-2 text-[#4E5968]">
              <Store className="h-4 w-4" />
              <span className="text-sm font-semibold">경쟁 밀도</span>
            </div>
            <p className="mt-2 text-xl font-bold text-[#191F28]">
              {result.competition.density_score}점
            </p>
            <p className="mt-1 text-xs text-[#8B95A1]">
              추천 업종 기준 점포수 추정
            </p>
          </div>

          <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
            <div className="flex items-center gap-2 text-[#4E5968]">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-semibold">분석 기준 지역</span>
            </div>
            <p className="mt-2 text-base font-bold text-[#191F28]">
              {result.district_name}
            </p>
            <p className="mt-1 text-xs text-[#8B95A1]">
              시군구 코드: {result.district_code || '-'}
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-[#E5E8EB] bg-white p-6">
          <h2 className="text-lg font-bold text-[#191F28]">추천 업종 Top 5</h2>
          {result.recommended_industries.length === 0 ? (
            <p className="mt-3 text-sm text-[#8B95A1]">
              추천 업종 데이터를 아직 계산하지 못했습니다.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {result.recommended_industries.map((row, idx) => (
                <div
                  key={`${row.industry_code}-${idx}`}
                  className="rounded-xl bg-[#F9FAFB] p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-[#191F28]">
                      {idx + 1}. {row.industry_name}
                    </p>
                    <p className="font-bold text-[#2F80ED]">
                      {row.success_probability}%
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-[#8B95A1]">
                    추정 점포 수 {formatNumber(row.estimated_store_count)}개
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.factors.map((factor) => (
                      <span
                        key={`${row.industry_code}-${factor.name}`}
                        className={`rounded-md px-2 py-1 text-xs ${
                          factor.direction === 'positive'
                            ? 'bg-[#ECFDF3] text-[#00A86B]'
                            : 'bg-[#FFF1F1] text-[#E5484D]'
                        }`}
                      >
                        {factor.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#E5E8EB] bg-white p-6">
            <h3 className="text-base font-bold text-[#191F28]">연령대 분포</h3>
            {result.foot_traffic.demographics.length === 0 ? (
              <p className="mt-2 text-sm text-[#8B95A1]">데이터 없음</p>
            ) : (
              <div className="mt-3 space-y-2">
                {result.foot_traffic.demographics.map((row) => (
                  <div key={row.age_group} className="flex items-center justify-between">
                    <span className="text-sm text-[#4E5968]">{row.age_group}</span>
                    <span className="text-sm font-semibold text-[#191F28]">
                      {row.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#E5E8EB] bg-white p-6">
            <h3 className="text-base font-bold text-[#191F28]">분석 인사이트</h3>
            <div className="mt-3 space-y-2">
              {result.insights.length === 0 ? (
                <p className="text-sm text-[#8B95A1]">인사이트 없음</p>
              ) : (
                result.insights.map((text, idx) => (
                  <p key={idx} className="text-sm text-[#4E5968]">
                    • {text}
                  </p>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
