'use client'

import { useEffect, useState } from 'react'

type AuditRow = {
  id: number
  actor_user_id: string | null
  actor_email: string | null
  action: string
  target_table: string | null
  target_id: string | null
  request: unknown
  created_at: string
}

function fmtTs(s: string) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('ko-KR')
}

export function AdminAuditClient() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/audit?limit=200', {
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load')
      setRows(data.rows || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-[#6B7684]">최근 200건</div>
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
              <th className="px-4 py-3">시각</th>
              <th className="px-4 py-3">actor</th>
              <th className="px-4 py-3">action</th>
              <th className="px-4 py-3">target</th>
              <th className="px-4 py-3">payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E8EB]">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-[#6B7684]">
                  {fmtTs(r.created_at)}
                </td>
                <td className="px-4 py-3 text-[#4E5968]">
                  <div>{r.actor_email || '-'}</div>
                  <div className="mt-1 font-mono text-[11px] text-[#8B95A1]">
                    {r.actor_user_id || '-'}
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-[#191F28]">
                  {r.action}
                </td>
                <td className="px-4 py-3 text-[#4E5968]">
                  {r.target_table || '-'}{' '}
                  {r.target_id ? `(${r.target_id})` : ''}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-[#6B7684]">
                  {r.request ? JSON.stringify(r.request).slice(0, 220) : '-'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
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
