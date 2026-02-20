'use client'

import { useEffect, useMemo, useState } from 'react'

type Row = {
  id: string
  property_id: string
  user_id: string | null
  chamgab_price: number
  min_price: number
  max_price: number
  confidence: number
  analyzed_at: string
  expires_at: string
  properties?: { name?: string; address?: string } | null
  latest_tx?: {
    transaction_date?: string
    price?: number
  } | null
  gap_pct?: number | null
  last_event?: {
    status: 'success' | 'error' | 'timeout'
    http_status?: number | null
    error_code?: string | null
    error_message?: string | null
    created_at?: string
  } | null
}

function fmtMoney(v: number) {
  return `${Math.round(v / 10000).toLocaleString('ko-KR')}만원`
}

function fmtTs(s: string) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('ko-KR')
}

export function AdminAnalysesClient() {
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<Record<string, boolean>>({})

  const [eventsFor, setEventsFor] = useState<string | null>(null)
  const [events, setEvents] = useState<
    {
      id?: string
      status?: string
      http_status?: number
      error_code?: string
      error_message?: string
      created_at?: string
      [key: string]: unknown
    }[]
  >([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)

  const totalPages = useMemo(() => {
    if (!total) return null
    return Math.max(1, Math.ceil(total / limit))
  }, [total, limit])

  const load = async (p: number) => {
    setIsLoading(true)
    setError(null)
    try {
      const url = new URL('/api/admin/analyses', window.location.origin)
      url.searchParams.set('page', String(p))
      url.searchParams.set('limit', String(limit))
      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load')
      setRows(data.rows || [])
      setTotal(typeof data.total === 'number' ? data.total : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }

  const reanalyze = async (propertyId: string) => {
    setError(null)
    setRunning((prev) => ({ ...prev, [propertyId]: true }))
    try {
      const res = await fetch('/api/admin/analyses/reanalyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to reanalyze')
      await load(page)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reanalyze')
    } finally {
      setRunning((prev) => ({ ...prev, [propertyId]: false }))
    }
  }

  const openEvents = async (propertyId: string) => {
    setEventsFor(propertyId)
    setEvents([])
    setEventsError(null)
    setEventsLoading(true)
    try {
      const url = new URL('/api/admin/analyses/events', window.location.origin)
      url.searchParams.set('property_id', propertyId)
      url.searchParams.set('limit', '10')
      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load events')
      setEvents(Array.isArray(data.events) ? data.events : [])
    } catch (e) {
      setEventsError(e instanceof Error ? e.message : 'Failed to load events')
    } finally {
      setEventsLoading(false)
    }
  }

  useEffect(() => {
    load(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#E5E8EB]">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#F9FAFB] text-left text-xs font-semibold text-[#6B7684]">
            <tr>
              <th className="px-4 py-3">단지/주소</th>
              <th className="px-4 py-3">참값</th>
              <th className="px-4 py-3">구간</th>
              <th className="px-4 py-3">신뢰도</th>
              <th className="px-4 py-3">분석일</th>
              <th className="px-4 py-3">만료</th>
              <th className="px-4 py-3">최근 실거래</th>
              <th className="px-4 py-3">괴리</th>
              <th className="px-4 py-3">실패 원인</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E8EB]">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-[#191F28]">
                    {r.properties?.name || '(매물명 없음)'}
                  </div>
                  <div className="mt-1 text-xs text-[#8B95A1]">
                    {r.properties?.address || r.property_id}
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-[#191F28]">
                  {fmtMoney(r.chamgab_price)}
                </td>
                <td className="px-4 py-3 text-[#4E5968]">
                  {fmtMoney(r.min_price)} ~ {fmtMoney(r.max_price)}
                </td>
                <td className="px-4 py-3 text-[#4E5968]">
                  {(Number(r.confidence) * 100).toFixed(0)}%
                </td>
                <td className="px-4 py-3 text-[#6B7684]">
                  {fmtTs(r.analyzed_at)}
                </td>
                <td className="px-4 py-3 text-[#6B7684]">
                  {fmtTs(r.expires_at)}
                </td>
                <td className="px-4 py-3 text-xs text-[#6B7684]">
                  {r.latest_tx?.price ? (
                    <div>
                      <div className="font-semibold text-[#191F28]">
                        {fmtMoney(r.latest_tx.price)}
                      </div>
                      {r.latest_tx.transaction_date && (
                        <div className="mt-1 text-[11px] text-[#8B95A1]">
                          {r.latest_tx.transaction_date}
                        </div>
                      )}
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {typeof r.gap_pct === 'number' ? (
                    <span
                      className={
                        Math.abs(r.gap_pct) >= 25
                          ? 'font-semibold text-[#B91C1C]'
                          : 'text-[#6B7684]'
                      }
                    >
                      {r.gap_pct > 0 ? '+' : ''}
                      {r.gap_pct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-[#8B95A1]">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[#6B7684]">
                  {r.last_event?.status === 'error' ||
                  r.last_event?.status === 'timeout'
                    ? `${r.last_event.error_code || ''} ${r.last_event.error_message || ''}`
                        .trim()
                        .slice(0, 80) || r.last_event.status
                    : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <a
                      href={`/property/${r.property_id}`}
                      className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28]"
                      target="_blank"
                      rel="noreferrer"
                    >
                      매물
                    </a>
                    <a
                      href={`/api/properties/${r.property_id}/similar`}
                      className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28]"
                      target="_blank"
                      rel="noreferrer"
                    >
                      유사거래
                    </a>
                    <button
                      onClick={() => reanalyze(r.property_id)}
                      disabled={!!running[r.property_id]}
                      className="rounded-lg bg-[#191F28] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {running[r.property_id] ? '재분석중' : '재분석'}
                    </button>
                    <button
                      onClick={() => openEvents(r.property_id)}
                      className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28]"
                    >
                      이력
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-10 text-center text-[#8B95A1]"
                >
                  {isLoading ? '불러오는 중...' : '결과 없음'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-[#6B7684]">
        <div>
          {total !== null ? (
            <span>
              총 {total.toLocaleString('ko-KR')}건
              {totalPages ? ` / ${totalPages}페이지` : ''}
            </span>
          ) : (
            <span>총계 계산 중</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28] disabled:opacity-30"
          >
            이전
          </button>
          <button
            disabled={
              totalPages !== null ? page >= totalPages : rows.length < limit
            }
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28] disabled:opacity-30"
          >
            다음
          </button>
        </div>
      </div>

      {eventsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[#E5E8EB] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E5E8EB] px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-[#191F28]">
                  분석 이벤트 이력 (최대 10건)
                </div>
                <div className="mt-1 text-xs text-[#8B95A1]">{eventsFor}</div>
              </div>
              <button
                onClick={() => setEventsFor(null)}
                className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28]"
              >
                닫기
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto p-5">
              {eventsError && (
                <div className="mb-4 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                  {eventsError}
                </div>
              )}
              {eventsLoading ? (
                <div className="py-10 text-center text-sm text-[#8B95A1]">
                  불러오는 중...
                </div>
              ) : events.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#8B95A1]">
                  이벤트가 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-xl border border-[#E5E8EB] bg-white px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#191F28]">
                            {ev.status}
                            {ev.http_status ? ` (${ev.http_status})` : ''}
                          </div>
                          <div className="mt-1 text-xs text-[#6B7684]">
                            {ev.error_code ? `${ev.error_code}: ` : ''}
                            {(ev.error_message || '').slice(0, 200) || '-'}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs text-[#8B95A1]">
                          {ev.created_at ? fmtTs(ev.created_at) : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
