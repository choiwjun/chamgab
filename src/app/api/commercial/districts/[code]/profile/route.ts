/**
 * GET /api/commercial/districts/[code]/profile
 *
 * 상권 프로필 분석
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getSupabase,
  fetchDistrictCharAggregated,
  fetchFootTraffic,
  fetchBusinessStats,
  latestByIndustry,
  isExcludedIndustry,
  num,
} from '../../../_helpers'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const supabase = getSupabase()
    const charData = await fetchDistrictCharAggregated(supabase, code)

    let districtType = (charData.district_type as string) || ''
    let primaryAge = (charData.primary_age_group as string) || ''

    // 유동인구 기반 추론
    if (!districtType) {
      const footData = await fetchFootTraffic(supabase, code)
      if (Object.keys(footData).length) {
        const ages: Record<string, number> = {
          '20대': num(footData.age_20s),
          '30대': num(footData.age_30s),
          '40대': num(footData.age_40s),
        }
        const total = Object.values(ages).reduce((a, b) => a + b, 0) || 1
        if (ages['20대'] / total > 0.25) {
          districtType = '대학상권'
          primaryAge = '20대'
        } else if (ages['30대'] / total > 0.28) {
          districtType = '오피스상권'
          primaryAge = '30-40대'
        } else if (ages['40대'] / total > 0.25) {
          districtType = '주거상권'
          primaryAge = '40-50대'
        } else {
          districtType = '복합상권'
          primaryAge = '30대'
        }
      }
    }
    if (!districtType) districtType = '복합상권'
    if (!primaryAge) primaryAge = '20-30대'

    const descriptionMap: Record<string, string> = {
      대학상권: '트렌디한 카페와 음식점이 밀집된 젊은 상권',
      오피스상권: '직장인 대상 점심/저녁 수요가 높은 비즈니스 상권',
      주거상권: '주민 대상 생활 밀착형 업종이 강세인 주거지역',
      역세권: '유동인구가 많고 접근성이 우수한 역 주변 상권',
      복합상권: '다양한 업종과 고객층이 공존하는 복합 상권',
      먹자상권: '음식점 위주의 외식 특화 상권',
      골목상권: '소규모 점포 위주의 골목형 상권',
    }
    const customerMap: Record<string, string> = {
      '10-20대': '학생 및 청년층',
      '20대': 'MZ세대',
      '20-30대': 'MZ세대 직장인',
      '30대': '30대 직장인',
      '30-40대': '가족 단위 고객',
      '40-50대': '중장년층',
    }
    const lifestyleMap: Record<string, string> = {
      '20대': 'SNS 활발, 트렌드 민감, 경험 소비',
      '20-30대': '워라밸 중시, 경험 소비, 프리미엄 선호',
      '30대': '워라밸 중시, 커리어 집중',
      '30-40대': '가족 중심, 안정 추구, 품질 중시',
      '40-50대': '실속 추구, 건강 관심, 편의성 중시',
    }
    const successFactorsMap: Record<string, string[]> = {
      대학상권: [
        'SNS 마케팅 필수',
        '인스타그램 감성 인테리어',
        '합리적인 가격대',
        '독특한 콘셉트',
      ],
      오피스상권: [
        '점심 시간 회전율 중시',
        '배달 서비스 필수',
        '빠른 서빙',
        '단골 고객 확보',
      ],
      주거상권: [
        '주민 밀착형 서비스',
        '장기 신뢰 관계',
        '생활 편의 제공',
        '안정적인 운영',
      ],
      역세권: [
        '높은 회전율 대응',
        '접근성 최대화',
        '테이크아웃 강화',
        '피크 타임 집중',
      ],
    }

    // 실데이터 기반 추천 업종 (업종별 최신 월만, 중복 제거, 비상업 업종 제외)
    const bizAll = latestByIndustry(await fetchBusinessStats(supabase, code))
    let bestIndustries = Array.from(
      new Set(
        bizAll
          .filter(
            (b) =>
              b.industry_name &&
              !isExcludedIndustry(
                String(b.industry_small_code || ''),
                String(b.industry_name || '')
              )
          )
          .sort((a, b) => num(b.survival_rate) - num(a.survival_rate))
          .slice(0, 4)
          .map((b) => b.industry_name as string)
      )
    )

    if (!bestIndustries.length) {
      const fallbackMap: Record<string, string[]> = {
        대학상권: ['커피전문점', '치킨전문점', '분식/김밥', '패스트푸드'],
        오피스상권: ['한식음식점', '도시락/밥집', '커피전문점', '편의점'],
        주거상권: ['슈퍼마켓', '편의점', '한식음식점', '분식/김밥'],
      }
      bestIndustries = fallbackMap[districtType] || [
        '커피전문점',
        '한식음식점',
        '편의점',
      ]
    }

    return NextResponse.json({
      district_type: districtType,
      description: descriptionMap[districtType] || '다양한 특성을 가진 상권',
      primary_customer: customerMap[primaryAge] || '다양한 연령층',
      lifestyle: lifestyleMap[primaryAge] || '다양한 라이프스타일',
      success_factors: successFactorsMap[districtType] || [
        '고객 니즈 파악',
        '차별화된 서비스',
        '꾸준한 품질 관리',
      ],
      best_industries: bestIndustries,
    })
  } catch (err) {
    console.error('[Profile] Exception:', err)
    return NextResponse.json(
      { detail: '상권 프로필 분석 오류' },
      { status: 500 }
    )
  }
}
