'use client'

import type { QualityGateStatus, QualityGrade } from '@/types/quality'

interface QualityGateNoticeProps {
  status?: QualityGateStatus
  grade?: QualityGrade
  flags?: string[]
  className?: string
}

function toneByStatus(status: QualityGateStatus | undefined): {
  wrapper: string
  badge: string
  title: string
} {
  if (status === 'pass') {
    return {
      wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      badge: 'bg-emerald-600 text-white',
      title: '품질 게이트 통과',
    }
  }
  if (status === 'warn') {
    return {
      wrapper: 'border-amber-200 bg-amber-50 text-amber-900',
      badge: 'bg-amber-600 text-white',
      title: '품질 경고',
    }
  }
  return {
    wrapper: 'border-rose-200 bg-rose-50 text-rose-900',
    badge: 'bg-rose-600 text-white',
    title: '품질 주의',
  }
}

export function QualityGateNotice({
  status,
  grade,
  flags = [],
  className = '',
}: QualityGateNoticeProps) {
  if (!status) return null
  const tone = toneByStatus(status)
  const showFlags = flags.slice(0, 3)

  return (
    <div
      className={`rounded-xl border p-3 ${tone.wrapper} ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{tone.title}</p>
        {grade && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone.badge}`}
          >
            Grade {grade}
          </span>
        )}
      </div>
      {showFlags.length > 0 && (
        <p className="mt-1 text-xs opacity-90">사유: {showFlags.join(', ')}</p>
      )}
      {status !== 'pass' && (
        <p className="mt-1 text-xs opacity-80">
          참고용 결과입니다. 실제 의사결정 전 추가 검증을 권장합니다.
        </p>
      )}
    </div>
  )
}
