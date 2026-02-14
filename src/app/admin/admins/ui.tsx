'use client'

import { useEffect, useState } from 'react'

type AdminRow = {
  user_id: string
  role: 'viewer' | 'admin' | 'super_admin'
  is_active: boolean
  note: string | null
  created_at: string
  created_by: string | null
}

function fmtTs(s: string) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('ko-KR')
}

export function AdminAdminsClient() {
  const [rows, setRows] = useState<AdminRow[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AdminRow['role']>('admin')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/admin-users', { cache: 'no-store' })
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

  const add = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to add')
      setEmail('')
      setNote('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (userId: string, isActive: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/admin-users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, is_active: isActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to update')
      setRows((prev) => prev.map((r) => (r.user_id === userId ? data.row : r)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-[#6B7684]">
            이메일로 관리자 추가
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            className="mt-2 w-full rounded-xl border border-[#E5E8EB] px-4 py-3 text-sm outline-none focus:border-[#3182F6]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#6B7684]">
            역할
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRow['role'])}
            className="mt-2 w-full rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#3182F6]"
          >
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
            <option value="super_admin">super_admin</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#6B7684]">
            메모
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="권한 부여 사유"
            className="mt-2 w-full rounded-xl border border-[#E5E8EB] px-4 py-3 text-sm outline-none focus:border-[#3182F6]"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28] disabled:opacity-30"
        >
          새로고침
        </button>
        <button
          onClick={add}
          disabled={loading || !email.trim()}
          className="rounded-lg bg-[#191F28] px-3 py-2 text-xs font-semibold text-white disabled:opacity-30"
        >
          추가
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E5E8EB]">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#F9FAFB] text-left text-xs font-semibold text-[#6B7684]">
            <tr>
              <th className="px-4 py-3">user_id</th>
              <th className="px-4 py-3">role</th>
              <th className="px-4 py-3">active</th>
              <th className="px-4 py-3">created_at</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E8EB]">
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td className="px-4 py-3 font-mono text-xs text-[#191F28]">
                  {r.user_id}
                </td>
                <td className="px-4 py-3 text-[#4E5968]">{r.role}</td>
                <td className="px-4 py-3 text-[#4E5968]">
                  {r.is_active ? 'true' : 'false'}
                </td>
                <td className="px-4 py-3 text-[#6B7684]">
                  {fmtTs(r.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggleActive(r.user_id, !r.is_active)}
                    disabled={loading}
                    className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28] disabled:opacity-30"
                  >
                    {r.is_active ? '비활성화' : '활성화'}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[#8B95A1]"
                >
                  {loading ? '불러오는 중...' : '데이터 없음 또는 권한 없음'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
