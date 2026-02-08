/**
 * GET /api/commercial/industries
 *
 * 업종 목록 조회 - 전체 업종 static 목록 + DB 데이터 병합
 * 소상공인진흥공단 업종 분류 기준
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase, getIndustryCategory } from '../_helpers'

/** 전체 업종 목록 (소상공인진흥공단 업종분류 기반) */
const ALL_INDUSTRIES: { code: string; name: string; category: string }[] = [
  // 음식
  { code: 'Q01', name: '한식음식점', category: '음식' },
  { code: 'Q02', name: '중식음식점', category: '음식' },
  { code: 'Q03', name: '일식음식점', category: '음식' },
  { code: 'Q04', name: '서양식음식점', category: '음식' },
  { code: 'Q05', name: '기타외국식음식점', category: '음식' },
  { code: 'Q06', name: '치킨전문점', category: '음식' },
  { code: 'Q07', name: '패스트푸드점', category: '음식' },
  { code: 'Q08', name: '분식전문점', category: '음식' },
  { code: 'Q09', name: '호프/간이주점', category: '음식' },
  { code: 'Q10', name: '제과점', category: '음식' },
  { code: 'Q11', name: '피자/햄버거/샌드위치', category: '음식' },
  { code: 'Q12', name: '커피전문점', category: '음식' },
  { code: 'Q13', name: '카페', category: '음식' },
  { code: 'Q14', name: '아이스크림/빙수', category: '음식' },
  { code: 'Q15', name: '도시락/밥집', category: '음식' },

  // 소매
  { code: 'D01', name: '슈퍼마켓', category: '소매' },
  { code: 'D02', name: '편의점', category: '소매' },
  { code: 'D03', name: '농수산물', category: '소매' },
  { code: 'D04', name: '정육점', category: '소매' },
  { code: 'D05', name: '반찬가게', category: '소매' },
  { code: 'R01', name: '의류/패션', category: '소매' },
  { code: 'R02', name: '신발/가방', category: '소매' },
  { code: 'R03', name: '화장품', category: '소매' },
  { code: 'R04', name: '꽃집/화원', category: '소매' },
  { code: 'R05', name: '문구/팬시', category: '소매' },
  { code: 'N01', name: '약국', category: '소매' },
  { code: 'N02', name: '안경/콘택트렌즈', category: '소매' },
  { code: 'N03', name: '건강식품', category: '소매' },

  // 서비스
  { code: 'I01', name: '미용실', category: '서비스' },
  { code: 'I02', name: '네일아트/피부관리', category: '서비스' },
  { code: 'I03', name: '세탁소', category: '서비스' },
  { code: 'I04', name: '사진스튜디오', category: '서비스' },
  { code: 'I05', name: '인테리어/건축', category: '서비스' },
  { code: 'I06', name: '부동산중개', category: '서비스' },
  { code: 'S01', name: '학원/교습소', category: '서비스' },
  { code: 'S02', name: '헬스/피트니스', category: '서비스' },
  { code: 'S03', name: '노래방/오락', category: '서비스' },
  { code: 'S04', name: '세차/자동차정비', category: '서비스' },
  { code: 'S05', name: '반려동물/펫샵', category: '서비스' },
  { code: 'S06', name: '코인세탁/빨래방', category: '서비스' },

  // 생활
  { code: 'L01', name: '병원/의원', category: '생활' },
  { code: 'L02', name: '치과', category: '생활' },
  { code: 'L03', name: '한의원', category: '생활' },
  { code: 'L04', name: '어린이집/유치원', category: '생활' },
  { code: 'L05', name: '장례식장', category: '생활' },
  { code: 'L06', name: '주유소', category: '생활' },
]

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const category = request.nextUrl.searchParams.get('category')

    // DB에서 실제 데이터가 있는 업종 코드 수집
    const { data } = await supabase
      .from('business_statistics')
      .select('industry_small_code, industry_name')

    const dbCodes = new Set<string>()
    const dbNames: Record<string, string> = {}
    for (const row of data || []) {
      const code = row.industry_small_code || ''
      if (code) {
        dbCodes.add(code)
        if (!dbNames[code]) dbNames[code] = row.industry_name || ''
      }
    }

    // 전체 목록 + DB 데이터 병합
    const seen = new Set<string>()
    let industries: {
      code: string
      name: string
      category: string
      description: string
      has_data: boolean
    }[] = []

    // 1. static 목록 기반
    for (const item of ALL_INDUSTRIES) {
      seen.add(item.code)
      const hasData = dbCodes.has(item.code)
      // DB에 이름이 있으면 우선 사용
      const name = dbNames[item.code] || item.name
      industries.push({
        code: item.code,
        name,
        category: item.category,
        description: `${item.category} > ${name}`,
        has_data: hasData,
      })
    }

    // 2. DB에만 있는 업종 추가 (static 목록에 없는 경우)
    for (const code of Array.from(dbCodes)) {
      if (!seen.has(code)) {
        seen.add(code)
        const name = dbNames[code]
        const cat = getIndustryCategory(code)
        industries.push({
          code,
          name,
          category: cat,
          description: `${cat} > ${name}`,
          has_data: true,
        })
      }
    }

    if (category) {
      industries = industries.filter((i) => i.category === category)
    }

    // 데이터 있는 업종 우선, 카테고리→이름순 정렬
    industries.sort((a, b) => {
      if (a.has_data !== b.has_data) return a.has_data ? -1 : 1
      const catCmp = a.category.localeCompare(b.category)
      if (catCmp !== 0) return catCmp
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json(industries)
  } catch (err) {
    console.error('[Industries] Exception:', err)
    return NextResponse.json([], { status: 500 })
  }
}
