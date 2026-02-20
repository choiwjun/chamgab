'use client'

import { useEffect, useState } from 'react'

type Row = {
  suggestion_type: 'region' | 'complex' | 'property' | 'keyword'
  suggestion_id: string | null
  suggestion_name: string
  click_count: number
  updated_at: string
}

function fmtTs(s: string) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('ko-KR')
}

export function AdminSearchStatsClient() {
  const [rows, setRows] = useState<Row[]>([])
  const [type, setType] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = new URL(
        '/api/admin/search/suggestions',
        window.location.origin
      )
      if (type) url.searchParams.set('type', type)
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
  }, [type])

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
            type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-2 w-56 rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#3182F6]"
          >
            <option value="">all</option>
            <option value="region">region</option>
            <option value="complex">complex</option>
            <option value="property">property</option>
            <option value="keyword">keyword</option>
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
              <th className="px-4 py-3">type</th>
              <th className="px-4 py-3">name</th>
              <th className="px-4 py-3">clicks</th>
              <th className="px-4 py-3">updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E8EB]">
            {rows.map((r, idx) => (
              <tr
                key={`${r.suggestion_type}:${r.suggestion_id || r.suggestion_name}:${idx}`}
              >
                <td className="px-4 py-3 text-[#4E5968]">
                  {r.suggestion_type}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-[#191F28]">
                    {r.suggestion_name}
                  </div>
                  {r.suggestion_id && (
                    <div className="mt-1 font-mono text-[11px] text-[#8B95A1]">
                      {r.suggestion_id}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-[#191F28]">
                  {Number(r.click_count).toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-3 text-[#6B7684]">
                  {fmtTs(r.updated_at)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
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
