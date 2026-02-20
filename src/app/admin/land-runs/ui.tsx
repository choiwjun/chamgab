'use client'

import { useEffect, useState } from 'react'

type Row = {
  region_code: string
  deal_ymd: string
  region_name: string | null
  status: 'success' | 'no_data' | 'error'
  total_count: number | null
  fetched_count: number | null
  error_code: string | null
  error_message: string | null
  updated_at: string
}

function fmtTs(s: string) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('ko-KR')
}

export function AdminLandRunsClient() {
  const [rows, setRows] = useState<Row[]>([])
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = new URL('/api/admin/land/runs', window.location.origin)
      if (status) url.searchParams.set('status', status)
      url.searchParams.set('limit', '200')
      const res = await fetch(url.toString(), { cache: 'no-store' })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <label className="block text-xs font-semibold text-[#6B7684]">
            status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-2 w-56 rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#3182F6]"
          >
            <option value="">all</option>
            <option value="success">success</option>
            <option value="no_data">no_data</option>
            <option value="error">error</option>
          </select>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-sm font-semibold text-[#191F28] disabled:opacity-30"
        >
          새로고침
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E5E8EB]">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#F9FAFB] text-left text-xs font-semibold text-[#6B7684]">
            <tr>
              <th className="px-4 py-3">region</th>
              <th className="px-4 py-3">ym</th>
              <th className="px-4 py-3">status</th>
              <th className="px-4 py-3">fetched/total</th>
              <th className="px-4 py-3">updated_at</th>
              <th className="px-4 py-3">error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E8EB]">
            {rows.map((r) => (
              <tr key={`${r.region_code}:${r.deal_ymd}`}>
                <td className="px-4 py-3">
                  <div className="font-medium text-[#191F28]">
                    {r.region_name || r.region_code}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-[#8B95A1]">
                    {r.region_code}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#4E5968]">{r.deal_ymd}</td>
                <td className="px-4 py-3 text-[#4E5968]">{r.status}</td>
                <td className="px-4 py-3 text-[#4E5968]">
                  {(r.fetched_count ?? 0).toLocaleString('ko-KR')} /{' '}
                  {(r.total_count ?? 0).toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-3 text-[#6B7684]">
                  {fmtTs(r.updated_at)}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-[#6B7684]">
                  {r.error_code || ''} {r.error_message || ''}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
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
    </div>
  )
}
