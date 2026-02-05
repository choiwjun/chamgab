'use client'

const API_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8002'

import { useMutation } from '@tanstack/react-query'
import {
  FileText,
  Download,
  Share2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { useState } from 'react'

// Types matching backend API
interface ReportSection {
  section_type: string
  include: boolean
}

interface ReportGenerationRequest {
  property_id: string
  district_codes?: string[]
  sections: ReportSection[]
  format: string
  language: string
}

interface ReportGenerationResponse {
  report_id: string
  property_id: string
  status: string
  download_url: string
  share_url: string
  expires_at: string
  created_at: string
}

interface ReportGeneratorProps {
  propertyId: string
  districtCodes?: string[]
}

export default function ReportGenerator({
  propertyId,
  districtCodes = [],
}: ReportGeneratorProps) {
  const [selectedSections, setSelectedSections] = useState({
    apartment: true,
    commercial: districtCodes.length > 0,
    integrated: districtCodes.length > 0,
    risk: true,
  })

  const [generatedReport, setGeneratedReport] =
    useState<ReportGenerationResponse | null>(null)

  const generateMutation = useMutation({
    mutationFn: async (request: ReportGenerationRequest) => {
      const response = await fetch(
        `${API_URL}/api/integrated/reports/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        }
      )
      if (!response.ok) {
        throw new Error('Failed to generate report')
      }
      return response.json()
    },
    onSuccess: (data) => {
      setGeneratedReport(data)
    },
  })

  const handleGenerate = () => {
    const sections: ReportSection[] = []

    if (selectedSections.apartment) {
      sections.push({ section_type: 'apartment', include: true })
    }
    if (selectedSections.commercial && districtCodes.length > 0) {
      sections.push({ section_type: 'commercial', include: true })
    }
    if (selectedSections.integrated && districtCodes.length > 0) {
      sections.push({ section_type: 'integrated', include: true })
    }
    if (selectedSections.risk) {
      sections.push({ section_type: 'risk', include: true })
    }

    generateMutation.mutate({
      property_id: propertyId,
      district_codes: districtCodes.length > 0 ? districtCodes : undefined,
      sections,
      format: 'pdf',
      language: 'ko',
    })
  }

  const handleDownload = () => {
    if (generatedReport) {
      window.open(generatedReport.download_url, '_blank')
    }
  }

  const handleShare = async () => {
    if (generatedReport) {
      try {
        await navigator.clipboard.writeText(generatedReport.share_url)
        alert('공유 링크가 클립보드에 복사되었습니다!')
      } catch (err) {
        console.error('Failed to copy:', err)
      }
    }
  }

  const handleKakaoShare = () => {
    if (generatedReport) {
      // 실제 카카오톡 공유 구현은 Kakao SDK 필요
      alert('카카오톡 공유 기능은 향후 구현 예정입니다.')
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-2">
        <FileText className="h-6 w-6 text-blue-600" />
        <h2 className="text-xl font-bold">통합 리포트 생성</h2>
      </div>

      {/* 생성 완료 상태 */}
      {generatedReport && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <div className="flex-1">
              <h3 className="font-semibold text-green-900">
                리포트가 생성되었습니다!
              </h3>
              <p className="mt-1 text-sm text-green-700">
                리포트 ID: {generatedReport.report_id}
              </p>
              <p className="text-xs text-green-600">
                만료일:{' '}
                {new Date(generatedReport.expires_at).toLocaleDateString(
                  'ko-KR'
                )}
              </p>

              {/* 액션 버튼 */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  <Download className="h-4 w-4" />
                  다운로드
                </button>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Share2 className="h-4 w-4" />
                  링크 복사
                </button>
                <button
                  onClick={handleKakaoShare}
                  className="flex items-center gap-2 rounded bg-yellow-400 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-yellow-500"
                >
                  <Share2 className="h-4 w-4" />
                  카카오톡 공유
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 로딩 상태 */}
      {generateMutation.isPending && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-6 w-6 animate-pulse text-blue-600" />
            <div>
              <h3 className="font-semibold text-blue-900">
                리포트를 생성하고 있습니다...
              </h3>
              <p className="text-sm text-blue-700">잠시만 기다려 주세요.</p>
            </div>
          </div>
        </div>
      )}

      {/* 에러 상태 */}
      {generateMutation.isError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-900">
                리포트 생성에 실패했습니다
              </h3>
              <p className="text-sm text-red-700">
                {generateMutation.error.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 섹션 선택 */}
      <div className="mb-6">
        <h3 className="mb-3 font-semibold">포함할 섹션 선택</h3>
        <div className="space-y-3">
          {/* 아파트 섹션 */}
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={selectedSections.apartment}
              onChange={(e) =>
                setSelectedSections({
                  ...selectedSections,
                  apartment: e.target.checked,
                })
              }
              className="mt-1 h-4 w-4"
            />
            <div className="flex-1">
              <h4 className="font-semibold">아파트 분석</h4>
              <p className="text-sm text-gray-600">
                투자 점수, ROI, 전세가율, 유동성 분석
              </p>
            </div>
          </label>

          {/* 상권 섹션 */}
          <label
            className={`flex items-start gap-3 rounded-lg border border-gray-200 p-4 ${
              districtCodes.length === 0
                ? 'cursor-not-allowed opacity-50'
                : 'hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={selectedSections.commercial}
              onChange={(e) =>
                setSelectedSections({
                  ...selectedSections,
                  commercial: e.target.checked,
                })
              }
              disabled={districtCodes.length === 0}
              className="mt-1 h-4 w-4"
            />
            <div className="flex-1">
              <h4 className="font-semibold">상권 분석</h4>
              <p className="text-sm text-gray-600">
                근처 상권의 성공 확률, 매출, 유동인구 분석
              </p>
              {districtCodes.length === 0 && (
                <p className="mt-1 text-xs text-red-600">
                  상권 코드가 필요합니다
                </p>
              )}
            </div>
          </label>

          {/* 통합 섹션 */}
          <label
            className={`flex items-start gap-3 rounded-lg border border-gray-200 p-4 ${
              districtCodes.length === 0
                ? 'cursor-not-allowed opacity-50'
                : 'hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={selectedSections.integrated}
              onChange={(e) =>
                setSelectedSections({
                  ...selectedSections,
                  integrated: e.target.checked,
                })
              }
              disabled={districtCodes.length === 0}
              className="mt-1 h-4 w-4"
            />
            <div className="flex-1">
              <h4 className="font-semibold">통합 분석</h4>
              <p className="text-sm text-gray-600">
                아파트 + 상권 통합 투자 점수 및 생활 편의성
              </p>
              {districtCodes.length === 0 && (
                <p className="mt-1 text-xs text-red-600">
                  상권 코드가 필요합니다
                </p>
              )}
            </div>
          </label>

          {/* 리스크 섹션 */}
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={selectedSections.risk}
              onChange={(e) =>
                setSelectedSections({
                  ...selectedSections,
                  risk: e.target.checked,
                })
              }
              className="mt-1 h-4 w-4"
            />
            <div className="flex-1">
              <h4 className="font-semibold">리스크 분석</h4>
              <p className="text-sm text-gray-600">
                시장 리스크, 유동성 리스크, 금리 리스크 평가
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* 생성 버튼 */}
      <button
        onClick={handleGenerate}
        disabled={
          generateMutation.isPending ||
          !Object.values(selectedSections).some((v) => v)
        }
        className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {generateMutation.isPending ? '생성 중...' : 'PDF 리포트 생성'}
      </button>

      {/* 안내 */}
      <div className="mt-4 rounded-lg bg-gray-50 p-3">
        <p className="text-xs text-gray-600">
          💡 <strong>안내:</strong> 생성된 리포트는 7일간 유효하며, 다운로드 및
          공유할 수 있습니다. 실제 PDF 생성 기능은 향후 ReportLab 라이브러리를
          통해 구현될 예정입니다.
        </p>
      </div>
    </div>
  )
}
