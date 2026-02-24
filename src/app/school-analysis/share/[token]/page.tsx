'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { APIError, getSharedSchoolReport } from '@/lib/api/school-analysis'
import type { SchoolAnalysisReport } from '@/types/school-analysis'

export default function SharedSchoolReportPage() {
  const params = useParams<{ token: string }>()
  const token = decodeURIComponent(params.token)

  const [report, setReport] = useState<SchoolAnalysisReport | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await getSharedSchoolReport(token)
        setReport(response.report)
        setExpiresAt(response.expires_at)
      } catch (err) {
        const message =
          err instanceof APIError
            ? err.message
            : 'Failed to load shared report.'
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    void run()
  }, [token])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="h-10 w-10 animate-spin text-[#2563EB]" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-5">
          <p className="text-sm text-[#B91C1C]">
            {error || '공유 리포트를 찾을 수 없습니다.'}
          </p>
          <Link
            href={'/school-analysis' as never}
            className="mt-3 inline-block text-sm font-medium text-[#1D4ED8]"
          >
            학군분석 프리뷰로 이동
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <p className="text-xs font-semibold uppercase text-[#1D4ED8]">
            Read-only shared report
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[#111827]">
            {report.district_name}
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            overall score {report.overall_score.value?.toFixed(1) ?? '-'} |
            confidence {report.confidence_score.toFixed(1)}
          </p>
          {expiresAt && (
            <p className="mt-1 text-xs text-[#6B7280]">
              expires {new Date(expiresAt).toLocaleString()}
            </p>
          )}
        </header>

        <section className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#111827]">학교 목록</h2>
          <ul className="mt-3 space-y-2">
            {report.schools.map((school) => (
              <li
                key={school.school_id}
                className="flex items-center justify-between rounded-lg border border-[#F3F4F6] px-3 py-2"
              >
                <span className="text-sm text-[#111827]">
                  {school.school_name}
                </span>
                <span className="text-sm font-medium text-[#1D4ED8]">
                  {school.overall_score.value?.toFixed(1) ?? '-'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
