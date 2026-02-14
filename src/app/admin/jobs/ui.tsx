'use client'

import { useEffect, useState } from 'react'

type Status = {
  is_running?: boolean
  jobs?: unknown[]
  last_collection_job?: string | null
  last_analysis_job?: string | null
  last_training_job?: string | null
  error?: string
}

type MlHealth = {
  configured?: boolean
  ml_api_url?: string
  status?: string
  models?: Record<string, boolean>
  database?: { connected?: boolean; error?: string | null }
  error?: string
}

type CommercialDataHealth = {
  as_of: string
  filters: { district_code: string | null; industry_code: string | null }
  tables: Record<
    string,
    | {
        ok: true
        latest_base_year_month: string | null
        months_since_latest: number | null
        row_count: number | null
      }
    | { ok: false; error: string }
  >
}

const JOBS = [
  'daily',
  'weekly',
  'monthly',
  'collect_commercial',
  'train_business',
  'train_all',
]

export function AdminJobsClient() {
  const [status, setStatus] = useState<Status | null>(null)
  const [mlHealth, setMlHealth] = useState<MlHealth | null>(null)
  const [jobType, setJobType] = useState(JOBS[0])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [districtCode, setDistrictCode] = useState('')
  const [industryCode, setIndustryCode] = useState('')
  const [dataHealth, setDataHealth] = useState<CommercialDataHealth | null>(
    null
  )
  const [predictProbe, setPredictProbe] = useState<Record<
    string,
    unknown
  > | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [sRes, hRes] = await Promise.all([
        fetch('/api/admin/scheduler/status', { cache: 'no-store' }),
        fetch('/api/admin/ml/health', { cache: 'no-store' }),
      ])

      const sData = await sRes.json().catch(() => ({}))
      if (!sRes.ok)
        throw new Error(
          sData?.detail || sData?.error || 'Failed to load scheduler'
        )
      setStatus(sData)

      const hData = await hRes.json().catch(() => ({}))
      setMlHealth(hData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setStatus(null)
      setMlHealth(null)
    } finally {
      setLoading(false)
    }
  }

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/scheduler/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_type: jobType }),
      })
      const data = await res.json()
      if (!res.ok)
        throw new Error(data?.detail || data?.error || 'Failed to run')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run')
    } finally {
      setLoading(false)
    }
  }

  const checkDataHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (districtCode.trim()) qs.set('district_code', districtCode.trim())
      if (industryCode.trim()) qs.set('industry_code', industryCode.trim())

      const res = await fetch(
        `/api/admin/commercial/data-health?${qs.toString()}`,
        {
          cache: 'no-store',
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok)
        throw new Error(data?.detail || data?.error || 'Failed to check')
      setDataHealth(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check')
      setDataHealth(null)
    } finally {
      setLoading(false)
    }
  }

  const probePredict = async () => {
    setLoading(true)
    setError(null)
    try {
      const dc = districtCode.trim()
      const ic = industryCode.trim()
      if (!dc || !ic)
        throw new Error('district_code / industry_code 를 입력하세요')

      const qs = new URLSearchParams({ district_code: dc, industry_code: ic })
      const res = await fetch(`/api/commercial/predict?${qs.toString()}`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok)
        throw new Error(data?.detail || data?.error || 'Failed to predict')
      setPredictProbe(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to predict')
      setPredictProbe(null)
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-[#E5E8EB] bg-[#F9FAFB] p-4">
          <div className="text-xs font-semibold text-[#6B7684]">running</div>
          <div className="mt-2 text-2xl font-bold text-[#191F28]">
            {String(status?.is_running ?? '-')}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E5E8EB] bg-[#F9FAFB] p-4">
          <div className="text-xs font-semibold text-[#6B7684]">
            last_collection
          </div>
          <div className="mt-2 text-sm font-semibold text-[#191F28]">
            {status?.last_collection_job || '-'}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E5E8EB] bg-[#F9FAFB] p-4">
          <div className="text-xs font-semibold text-[#6B7684]">
            last_training
          </div>
          <div className="mt-2 text-sm font-semibold text-[#191F28]">
            {status?.last_training_job || '-'}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E5E8EB] bg-[#F9FAFB] p-4">
          <div className="text-xs font-semibold text-[#6B7684]">ml_health</div>
          <div className="mt-2 text-sm font-semibold text-[#191F28]">
            {mlHealth?.status ||
              mlHealth?.error ||
              (mlHealth ? 'unknown' : '-')}
          </div>
          <div className="mt-1 text-xs text-[#6B7684]">
            {mlHealth?.ml_api_url ? `url: ${mlHealth.ml_api_url}` : 'url: -'}
          </div>
          <div className="mt-1 text-xs text-[#6B7684]">
            business_model: {String(mlHealth?.models?.business_model ?? '-')},
            db: {String(mlHealth?.database?.connected ?? '-')}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-[#6B7684]">
            즉시 실행
          </label>
          <select
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#3182F6]"
          >
            {JOBS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-sm font-semibold text-[#191F28] disabled:opacity-30"
          >
            새로고침
          </button>
          <button
            onClick={run}
            disabled={loading}
            className="rounded-xl bg-[#191F28] px-4 py-3 text-sm font-semibold text-white disabled:opacity-30"
          >
            실행
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E5E8EB] bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <div className="text-sm font-semibold text-[#191F28]">
              상권 데이터 점검
            </div>
            <div className="mt-1 text-xs text-[#6B7684]">
              `business_statistics / sales_statistics / store_statistics`
              최신월(YYYYMM)과 row count를 확인합니다.
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                value={districtCode}
                onChange={(e) => setDistrictCode(e.target.value)}
                placeholder="district_code (시군구 5자리) 예: 11680"
                className="w-full rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#3182F6]"
              />
              <input
                value={industryCode}
                onChange={(e) => setIndustryCode(e.target.value)}
                placeholder="industry_code 예: Q12"
                className="w-full rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#3182F6]"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={checkDataHealth}
              disabled={loading}
              className="rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-sm font-semibold text-[#191F28] disabled:opacity-30"
            >
              점검
            </button>
            <button
              onClick={probePredict}
              disabled={loading}
              className="rounded-xl bg-[#3182F6] px-4 py-3 text-sm font-semibold text-white disabled:opacity-30"
            >
              ML 예측 테스트
            </button>
          </div>
        </div>

        {dataHealth && (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {Object.entries(dataHealth.tables).map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] p-4"
              >
                <div className="text-xs font-semibold text-[#6B7684]">{k}</div>
                {'ok' in v && v.ok ? (
                  <>
                    <div className="mt-2 text-sm font-semibold text-[#191F28]">
                      latest: {v.latest_base_year_month || '-'}
                    </div>
                    <div className="mt-1 text-xs text-[#6B7684]">
                      months_since: {String(v.months_since_latest ?? '-')},
                      rows: {String(v.row_count ?? '-')}
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm font-semibold text-[#B91C1C]">
                    error: {'error' in v ? String(v.error) : 'unknown'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {predictProbe && (
          <div className="mt-4 rounded-xl border border-[#E5E8EB] bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-[#191F28]">
                예측 결과: source={String(predictProbe?.source || '-')},
                confidence={String(predictProbe?.confidence || '-')}
              </div>
              <div className="text-xs text-[#6B7684]">
                source가 `ml_model`로 뜨면 UI에서 “ML 모델” 라벨과 함께 신뢰도
                90%+가 가능합니다.
              </div>
            </div>
            <pre className="mt-3 overflow-auto rounded-lg bg-[#0B1220] p-3 text-xs text-white">
              {JSON.stringify(predictProbe, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <details className="rounded-xl border border-[#E5E8EB] bg-white px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-[#191F28]">
          jobs payload
        </summary>
        <pre className="mt-3 overflow-auto rounded-lg bg-[#0B1220] p-3 text-xs text-white">
          {JSON.stringify(status, null, 2)}
        </pre>
      </details>
    </div>
  )
}
