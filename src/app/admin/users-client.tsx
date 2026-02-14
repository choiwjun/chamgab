'use client'

import { useEffect, useMemo, useState } from 'react'

type UserTier = 'free' | 'premium' | 'business'

type UserProfileRow = {
  id: string
  email: string
  name: string | null
  tier: UserTier

  // Credit-based billing
  daily_credit_used?: number
  daily_credit_limit?: number
  monthly_credit_used?: number
  monthly_credit_limit?: number
  bonus_credits?: number

  // Legacy fields (kept for backward compatibility)
  daily_analysis_count: number
  daily_analysis_limit: number

  // Ops controls
  force_logout_at?: string | null
  is_suspended?: boolean
  suspended_until?: string | null
  suspended_reason?: string | null

  created_at: string
  updated_at: string
}

function fmtTs(s: string) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('ko-KR')
}

export function AdminUsersClient() {
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<UserProfileRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState<Record<string, Partial<UserProfileRow>>>(
    {}
  )
  const [suspendReason, setSuspendReason] = useState<Record<string, string>>({})
  const [suspendDuration, setSuspendDuration] = useState<
    Record<string, string>
  >({})
  const [bonusGrant, setBonusGrant] = useState<Record<string, string>>({})
  const [bonusReason, setBonusReason] = useState<Record<string, string>>({})

  const visible = useMemo(() => users, [users])

  const load = async (query: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const url = new URL('/api/admin/users', window.location.origin)
      if (query.trim()) url.searchParams.set('q', query.trim())
      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load')
      setUsers(data.users || [])
      setDirty({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load('')
  }, [])

  const updateDirty = (id: string, patch: Partial<UserProfileRow>) => {
    setDirty((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }))
  }

  const save = async (id: string) => {
    const patch = dirty[id]
    if (!patch) return
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: id,
          tier: patch.tier,
          daily_credit_used: patch.daily_credit_used,
          daily_credit_limit: patch.daily_credit_limit,
          monthly_credit_used: patch.monthly_credit_used,
          monthly_credit_limit: patch.monthly_credit_limit,
          // bonus_credits is managed via RPC to keep ledger.
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to save')
      setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)))
      setDirty((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  const suspend = async (id: string) => {
    setError(null)
    try {
      const reason = (suspendReason[id] || '').trim()
      const dur = (suspendDuration[id] || '720h').trim() // default 30d
      const res = await fetch('/api/admin/users/suspension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: id,
          action: 'suspend',
          ban_duration: dur,
          reason,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to suspend')
      await load(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to suspend')
    }
  }

  const unsuspend = async (id: string) => {
    setError(null)
    try {
      const res = await fetch('/api/admin/users/suspension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: id, action: 'unsuspend' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to unsuspend')
      await load(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unsuspend')
    }
  }

  const forceLogout = async (id: string) => {
    setError(null)
    try {
      const res = await fetch('/api/admin/users/force-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to force logout')
      await load(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to force logout')
    }
  }

  const grantBonus = async (id: string) => {
    setError(null)
    const raw = (bonusGrant[id] || '').trim()
    const amt = Number(raw)
    if (!Number.isFinite(amt) || amt === 0) {
      setError('보너스 크레딧 수량을 입력하세요. (0 제외)')
      return
    }
    try {
      const res = await fetch('/api/admin/users/bonus-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: id,
          amount: Math.trunc(amt),
          reason: (bonusReason[id] || '').trim() || 'admin_grant',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to grant bonus')
      setBonusGrant((prev) => ({ ...prev, [id]: '' }))
      await load(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to grant bonus')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-[#6B7684]">
            사용자 검색 (이메일)
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="example@domain.com"
            className="mt-2 w-full rounded-xl border border-[#E5E8EB] px-4 py-3 text-sm outline-none focus:border-[#3182F6]"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => load(q)}
            disabled={isLoading}
            className="rounded-xl bg-[#3182F6] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            조회
          </button>
          <button
            onClick={() => {
              setQ('')
              load('')
            }}
            disabled={isLoading}
            className="rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-sm font-semibold text-[#191F28] disabled:opacity-60"
          >
            초기화
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#E5E8EB]">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-[#F9FAFB] text-left text-xs font-semibold text-[#6B7684]">
            <tr>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">티어</th>
              <th className="px-4 py-3">일 크레딧</th>
              <th className="px-4 py-3">월 크레딧</th>
              <th className="px-4 py-3">보너스</th>
              <th className="px-4 py-3">정지</th>
              <th className="px-4 py-3">최근 업데이트</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E8EB]">
            {visible.map((u) => {
              const d = dirty[u.id] || {}
              const tier = (d.tier ?? u.tier) as UserTier
              const dailyUsed = (d.daily_credit_used ??
                u.daily_credit_used ??
                0) as number
              const dailyLimit = (d.daily_credit_limit ??
                u.daily_credit_limit ??
                0) as number
              const monthlyUsed = (d.monthly_credit_used ??
                u.monthly_credit_used ??
                0) as number
              const monthlyLimit = (d.monthly_credit_limit ??
                u.monthly_credit_limit ??
                0) as number
              const bonus = (d.bonus_credits ?? u.bonus_credits ?? 0) as number
              const hasDirty = !!dirty[u.id]
              const suspended =
                !!u.is_suspended &&
                (!u.suspended_until ||
                  new Date(u.suspended_until).getTime() > Date.now())

              return (
                <tr key={u.id} className={hasDirty ? 'bg-[#F8FAFF]' : ''}>
                  <td className="px-4 py-3 font-medium text-[#191F28]">
                    <div>{u.email}</div>
                    <div className="mt-1 text-xs text-[#8B95A1]">{u.id}</div>
                  </td>
                  <td className="px-4 py-3 text-[#4E5968]">{u.name || '-'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={tier}
                      onChange={(e) =>
                        updateDirty(u.id, { tier: e.target.value as UserTier })
                      }
                      className="w-36 rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-sm outline-none focus:border-[#3182F6]"
                    >
                      <option value="free">free</option>
                      <option value="premium">premium</option>
                      <option value="business">business</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={dailyUsed}
                        onChange={(e) =>
                          updateDirty(u.id, {
                            daily_credit_used: Number(e.target.value),
                          })
                        }
                        className="w-20 rounded-lg border border-[#E5E8EB] px-3 py-2 text-sm outline-none focus:border-[#3182F6]"
                      />
                      <span className="text-[#8B95A1]">/</span>
                      <input
                        type="number"
                        value={dailyLimit}
                        onChange={(e) =>
                          updateDirty(u.id, {
                            daily_credit_limit: Number(e.target.value),
                          })
                        }
                        className="w-24 rounded-lg border border-[#E5E8EB] px-3 py-2 text-sm outline-none focus:border-[#3182F6]"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={monthlyUsed}
                        onChange={(e) =>
                          updateDirty(u.id, {
                            monthly_credit_used: Number(e.target.value),
                          })
                        }
                        className="w-20 rounded-lg border border-[#E5E8EB] px-3 py-2 text-sm outline-none focus:border-[#3182F6]"
                      />
                      <span className="text-[#8B95A1]">/</span>
                      <input
                        type="number"
                        value={monthlyLimit}
                        onChange={(e) =>
                          updateDirty(u.id, {
                            monthly_credit_limit: Number(e.target.value),
                          })
                        }
                        className="w-28 rounded-lg border border-[#E5E8EB] px-3 py-2 text-sm outline-none focus:border-[#3182F6]"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-[#191F28]">
                        {bonus}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          value={bonusGrant[u.id] || ''}
                          onChange={(e) =>
                            setBonusGrant((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }))
                          }
                          placeholder="+10"
                          className="w-20 rounded-lg border border-[#E5E8EB] px-2 py-2 text-xs outline-none focus:border-[#3182F6]"
                        />
                        <input
                          value={bonusReason[u.id] || ''}
                          onChange={(e) =>
                            setBonusReason((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }))
                          }
                          placeholder="사유"
                          className="w-28 rounded-lg border border-[#E5E8EB] px-2 py-2 text-xs outline-none focus:border-[#3182F6]"
                        />
                        <button
                          onClick={() => grantBonus(u.id)}
                          className="rounded-lg border border-[#E5E8EB] bg-white px-2 py-2 text-xs font-semibold text-[#191F28]"
                        >
                          지급
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold text-[#191F28]">
                        {suspended ? '정지됨' : '정상'}
                      </div>
                      {u.force_logout_at && (
                        <div className="text-[11px] text-[#8B95A1]">
                          force logout: {fmtTs(u.force_logout_at)}
                        </div>
                      )}
                      {suspended && u.suspended_until && (
                        <div className="text-[11px] text-[#8B95A1]">
                          until: {fmtTs(u.suspended_until)}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <select
                          value={suspendDuration[u.id] || '720h'}
                          onChange={(e) =>
                            setSuspendDuration((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }))
                          }
                          className="w-24 rounded-lg border border-[#E5E8EB] bg-white px-2 py-2 text-xs outline-none focus:border-[#3182F6]"
                          disabled={suspended}
                        >
                          <option value="24h">24h</option>
                          <option value="168h">7d</option>
                          <option value="720h">30d</option>
                          <option value="8760h">1y</option>
                          <option value="87600h">10y</option>
                        </select>
                        <input
                          value={suspendReason[u.id] || ''}
                          onChange={(e) =>
                            setSuspendReason((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }))
                          }
                          placeholder="사유"
                          className="w-44 rounded-lg border border-[#E5E8EB] px-2 py-2 text-xs outline-none focus:border-[#3182F6]"
                          disabled={suspended}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => suspend(u.id)}
                          disabled={suspended}
                          className="rounded-lg bg-[#F04452] px-3 py-2 text-xs font-semibold text-white disabled:opacity-30"
                        >
                          정지
                        </button>
                        <button
                          onClick={() => unsuspend(u.id)}
                          disabled={!suspended}
                          className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28] disabled:opacity-30"
                        >
                          해제
                        </button>
                        <button
                          onClick={() => forceLogout(u.id)}
                          className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 text-xs font-semibold text-[#191F28]"
                        >
                          강제 로그아웃
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#6B7684]">
                    {fmtTs(u.updated_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => save(u.id)}
                      disabled={!hasDirty}
                      className="rounded-lg bg-[#191F28] px-3 py-2 text-xs font-semibold text-white disabled:opacity-30"
                    >
                      저장
                    </button>
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-sm text-[#8B95A1]"
                >
                  {isLoading ? '불러오는 중...' : '결과 없음'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[#8B95A1]">
        접근 제어: `admin_users` 테이블이 기본이며, 초기 부트스트랩이 필요할
        때만 `ADMIN_BOOTSTRAP=true` + `ADMIN_EMAILS` allowlist를 사용하세요.
      </p>
    </div>
  )
}
