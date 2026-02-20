'use client'

import { useEffect, useState } from 'react'

type Status = {
  is_running?: boolean
  jobs?: unknown[]
  last_collection_job?: string | null
  last_analysis_job?: string | null
  last_training_job?: string | null
  current_job_running?: boolean | null
  current_job_type?: string | null
  current_job_started_at?: string | null
  current_job_finished_at?: string | null
  current_job_ok?: boolean | null
  current_job_error?: string | null
  error?: string
}

type MlHealth = {
  configured?: boolean
  ml_api_url?: string
  compat?: boolean
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

  // Known-good probe pair (has data coverage in Supabase). This is used to verify
  // that ML_API_URL points to the compatible "ml-api" service.
  const [districtCode, setDistrictCode] = useState('11680')
  const [industryCode, setIndustryCode] = useState('Q12')
  const [dataHealth, setDataHealth] = useState<CommercialDataHealth | null>(
    null
  )
  const [predictProbe, setPredictProbe] = useState<Record<
    string,
    unknown
  > | null>(null)

  const [fixFlow, setFixFlow] = useState<{
    running: boolean
    step:
      | 'idle'
      | 'check_health'
      | 'collect_commercial'
      | 'train_business'
      | 'probe'
      | 'done'
    note?: string
  }>({ running: false, step: 'idle' })

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))

  const fetchStatus = async () => {
    const sRes = await fetch('/api/admin/scheduler/status', {
      cache: 'no-store',
    })
    const sData = await sRes.json().catch(() => ({}))
    if (!sRes.ok)
      throw new Error(
        sData?.detail || sData?.error || 'Failed to poll scheduler'
      )
    setStatus(sData)
    return sData as Status
  }

  const waitForJob = async (
    expectedJobType: string,
    timeoutMs: number,
    baseline?: { startedAt?: string | null; finishedAt?: string | null }
  ) => {
    const start = Date.now()
    const baseStartedAt = baseline?.startedAt ?? null
    const baseFinishedAt = baseline?.finishedAt ?? null

    // Phase 1) Wait until we observe a *new* start (started_at changes) for this job type.
    while (Date.now() - start < timeoutMs) {
      const sData = await fetchStatus()
      const jt = (sData?.current_job_type as string | undefined) || null
      const startedAt =
        (sData?.current_job_started_at as string | undefined) || null
      const running = Boolean(sData?.current_job_running)

      const isNewStart =
        jt === expectedJobType &&
        startedAt != null &&
        startedAt !== baseStartedAt

      if (isNewStart && (running || startedAt)) break
      await sleep(1000)
    }

    // Phase 2) Wait until it finishes (finished_at changes) and report ok/error.
    while (Date.now() - start < timeoutMs) {
      const sData = await fetchStatus()
      const jt = (sData?.current_job_type as string | undefined) || null
      const running = Boolean(sData?.current_job_running)
      const startedAt =
        (sData?.current_job_started_at as string | undefined) || null
      const finishedAt =
        (sData?.current_job_finished_at as string | undefined) || null
      const ok = (sData?.current_job_ok as boolean | undefined) ?? null
      const err =
        (sData?.current_job_error as string | undefined) || 'job failed'

      if (
        jt === expectedJobType &&
        startedAt != null &&
        startedAt !== baseStartedAt &&
        !running
      ) {
        const isNewFinish = finishedAt != null && finishedAt !== baseFinishedAt
        if (isNewFinish) {
          if (ok === false) throw new Error(err)
          return
        }
      }

      await sleep(2000)
    }

    throw new Error(`Timeout waiting for job: ${expectedJobType}`)
  }

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

  const fetchDataHealth = async (dc: string, ic: string) => {
    const qs = new URLSearchParams()
    if (dc.trim()) qs.set('district_code', dc.trim())
    if (ic.trim()) qs.set('industry_code', ic.trim())

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
    return data
  }

  const fetchPredictProbe = async (dc: string, ic: string) => {
    if (!dc.trim() || !ic.trim())
      throw new Error('district_code / industry_code 를 입력하세요')
    const qs = new URLSearchParams({
      district_code: dc.trim(),
      industry_code: ic.trim(),
    })
    const res = await fetch(`/api/commercial/predict?${qs.toString()}`, {
      method: 'POST',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok)
      throw new Error(data?.detail || data?.error || 'Failed to predict')
    setPredictProbe(data)
    return data
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
      await fetchDataHealth(districtCode, industryCode)
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
      await fetchPredictProbe(districtCode, industryCode)
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

  const runFixFlow = async () => {
    setFixFlow({ running: true, step: 'check_health' })
    setLoading(true)
    setError(null)
    try {
      // Always re-check health before running expensive jobs.
      const hRes = await fetch('/api/admin/ml/health', { cache: 'no-store' })
      const hData = await hRes.json().catch(() => ({}))
      setMlHealth(hData)
      if (!hRes.ok)
        throw new Error(
          hData?.detail || hData?.error || 'Failed to load health'
        )

      if (!hData?.configured) {
        throw new Error('ML_API_URL not configured')
      }
      if (hData?.compat === false) {
        throw new Error(
          'ML API is incompatible. ML_API_URL must point to the latest ml-api deployment.'
        )
      }

      const tokenOk = true // requireAdmin already gates this page; run route checks token.
      if (!tokenOk) throw new Error('ML_ADMIN_TOKEN not configured')

      // 1) Collect commercial stats (may take long; SBIZ API).
      setFixFlow({ running: true, step: 'collect_commercial' })
      const pre1 = await fetchStatus()
      {
        const res = await fetch('/api/admin/scheduler/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_type: 'collect_commercial' }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok)
          throw new Error(
            data?.detail || data?.error || 'Failed to start collect_commercial'
          )
      }
      await waitForJob('collect_commercial', 65 * 60 * 1000, {
        startedAt: pre1?.current_job_started_at ?? null,
        finishedAt: pre1?.current_job_finished_at ?? null,
      })

      // 2) Train business model (writes app/models/business_model.pkl).
      setFixFlow({ running: true, step: 'train_business' })
      const pre2 = await fetchStatus()
      {
        const res = await fetch('/api/admin/scheduler/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_type: 'train_business' }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok)
          throw new Error(
            data?.detail || data?.error || 'Failed to start train_business'
          )
      }
      await waitForJob('train_business', 20 * 60 * 1000, {
        startedAt: pre2?.current_job_started_at ?? null,
        finishedAt: pre2?.current_job_finished_at ?? null,
      })

      // 3) Probe predict via Next.js API (must return source=ml_model).
      setFixFlow({ running: true, step: 'probe' })
      await fetchDataHealth(districtCode, industryCode)
      const probe = await fetchPredictProbe(districtCode, industryCode)

      const src = (probe?.source as string | undefined) || null
      if (src !== 'ml_model') {
        setFixFlow({
          running: false,
          step: 'probe',
          note: "Probe finished but source isn't ml_model. Check ML_API_URL, data coverage, and ML API logs.",
        })
        return
      }

      setFixFlow({ running: false, step: 'done' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run fix flow')
      setFixFlow({ running: false, step: 'idle' })
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

      {mlHealth?.configured && mlHealth?.compat === false && (
        <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
          ML API는 응답은 하지만 현재 스펙과 호환되지 않습니다. (구버전 HF
          Space일 가능성 높음)
          <div className="mt-1 text-xs text-[#92400E]">
            `ML_API_URL`이 최신 `ml-api` 배포를 가리키도록 교체해야
            `source=ml_model`과 90%+ 신뢰도가 가능합니다.
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#E5E8EB] bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-[#191F28]">
              ML 경로 고정 플로우
            </div>
            <div className="mt-1 text-xs text-[#6B7684]">
              health 호환성 확인 → 상권 수집(`collect_commercial`) → 상권 학습(
              `train_business`) → 예측 probe에서 `source=ml_model` 확인
            </div>
            {fixFlow.step !== 'idle' && (
              <div className="mt-2 text-xs text-[#191F28]">
                step: <span className="font-semibold">{fixFlow.step}</span>
                {fixFlow.note ? ` (${fixFlow.note})` : ''}
              </div>
            )}
          </div>
          <button
            onClick={runFixFlow}
            disabled={loading || fixFlow.running}
            className="rounded-xl bg-[#111827] px-4 py-3 text-sm font-semibold text-white disabled:opacity-30"
          >
            고정 플로우 실행
          </button>
        </div>
      </div>

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
