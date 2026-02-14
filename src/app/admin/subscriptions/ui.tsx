'use client'

import { useEffect, useState } from 'react'

type SubRow = {
  id: string
  user_id: string
  plan: string
  status: string
  current_period_end: string
  created_at: string
} & Record<string, unknown>
type PayRow = Record<string, unknown>

function fmtTs(v: unknown) {
  const s = typeof v === 'string' ? v : ''
  const d = new Date(s)
  if (!s || Number.isNaN(d.getTime())) return s || '-'
  return d.toLocaleString('ko-KR')
}

export function AdminSubscriptionsClient() {
  const [subs, setSubs] = useState<SubRow[]>([])
  const [pays, setPays] = useState<PayRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [sRes, pRes] = await Promise.all([
        fetch('/api/admin/subscriptions?limit=50', { cache: 'no-store' }),
        fetch('/api/admin/payments?limit=50', { cache: 'no-store' }),
      ])
      const sData = await sRes.json()
      const pData = await pRes.json()
      if (!sRes.ok)
        throw new Error(sData?.error || 'Failed to load subscriptions')
      if (!pRes.ok) throw new Error(pData?.error || 'Failed to load payments')
      setSubs(sData.rows || [])
      setPays(pData.rows || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const action = async (subscriptionId: string, kind: 'cancel' | 'expire') => {
    setLoading(true)
    setError(null)
    try {
      const ok = window.confirm(
        kind === 'cancel'
          ? '해당 구독을 강제 취소(즉시) 하시겠습니까?'
          : '해당 구독을 강제 만료 처리하시겠습니까?'
      )
      if (!ok) return

      const res = await fetch('/api/admin/subscriptions/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: kind,
          subscription_id: subscriptionId,
          immediate: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#191F28]">최근 구독 50건</h2>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28] disabled:opacity-30"
        >
          새로고침
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E5E8EB]">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#F9FAFB] text-left text-xs font-semibold text-[#6B7684]">
            <tr>
              <th className="px-4 py-3">user_id</th>
              <th className="px-4 py-3">plan</th>
              <th className="px-4 py-3">status</th>
              <th className="px-4 py-3">period_end</th>
              <th className="px-4 py-3">created_at</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E8EB]">
            {subs.map((r, idx) => (
              <tr key={String(r.id ?? idx)}>
                <td className="px-4 py-3 font-mono text-xs text-[#191F28]">
                  {String(r.user_id ?? '-')}
                </td>
                <td className="px-4 py-3 text-[#4E5968]">
                  {String(r.plan ?? '-')}
                </td>
                <td className="px-4 py-3 text-[#4E5968]">
                  {String(r.status ?? '-')}
                </td>
                <td className="px-4 py-3 text-[#6B7684]">
                  {fmtTs(r.current_period_end)}
                </td>
                <td className="px-4 py-3 text-[#6B7684]">
                  {fmtTs(r.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => action(String(r.id), 'cancel')}
                      className="rounded-lg bg-[#F04452] px-3 py-2 text-xs font-semibold text-white"
                      disabled={loading}
                    >
                      강제 취소
                    </button>
                    <button
                      onClick={() => action(String(r.id), 'expire')}
                      className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28]"
                      disabled={loading}
                    >
                      강제 만료
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {subs.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[#8B95A1]"
                >
                  {loading ? '불러오는 중...' : '데이터 없음'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold text-[#191F28]">최근 결제 50건</h2>
      <div className="overflow-x-auto rounded-xl border border-[#E5E8EB]">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#F9FAFB] text-left text-xs font-semibold text-[#6B7684]">
            <tr>
              <th className="px-4 py-3">user_id</th>
              <th className="px-4 py-3">amount</th>
              <th className="px-4 py-3">status</th>
              <th className="px-4 py-3">method</th>
              <th className="px-4 py-3">created_at</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E8EB]">
            {pays.map((r, idx) => (
              <tr key={String(r.id ?? idx)}>
                <td className="px-4 py-3 font-mono text-xs text-[#191F28]">
                  {String(r.user_id ?? '-')}
                </td>
                <td className="px-4 py-3 text-[#4E5968]">
                  {typeof r.amount === 'number'
                    ? r.amount.toLocaleString('ko-KR')
                    : String(r.amount ?? '-')}
                </td>
                <td className="px-4 py-3 text-[#4E5968]">
                  {String(r.status ?? '-')}
                </td>
                <td className="px-4 py-3 text-[#4E5968]">
                  {String(r.payment_method ?? '-')}
                </td>
                <td className="px-4 py-3 text-[#6B7684]">
                  {fmtTs(r.created_at)}
                </td>
              </tr>
            ))}
            {pays.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[#8B95A1]"
                >
                  {loading ? '불러오는 중...' : '데이터 없음'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
