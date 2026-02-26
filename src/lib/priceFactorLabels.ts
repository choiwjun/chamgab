const TECHNICAL_NAME_RE = /^[a-z0-9_]+$/i

export interface PriceFactorLabel {
  title: string
  description: string
}

const DEFAULT_DESCRIPTION = '시장 데이터 기반 영향 요인'

const PRICE_FACTOR_LABELS: Record<string, PriceFactorLabel> = {
  price_lag_1m: {
    title: '최근 1개월 가격 흐름',
    description: '최근 거래가격 변화를 반영한 요인',
  },
  price_lag_3m: {
    title: '최근 3개월 가격 흐름',
    description: '최근 3개월 거래가격 추세를 반영한 요인',
  },
  price_lag_6m: {
    title: '최근 6개월 가격 흐름',
    description: '중기 가격 흐름을 반영한 요인',
  },
  price_lag_12m: {
    title: '최근 12개월 가격 흐름',
    description: '연간 가격 추세를 반영한 요인',
  },
  price_rolling_3m_mean: {
    title: '최근 3개월 평균 가격',
    description: '최근 거래의 평균 가격 수준',
  },
  price_rolling_6m_mean: {
    title: '최근 6개월 평균 가격',
    description: '6개월 거래의 평균 가격 수준',
  },
  price_rolling_12m_mean: {
    title: '최근 12개월 평균 가격',
    description: '1년 거래의 평균 가격 수준',
  },
  sigungu_target_enc: {
    title: '시군구 가격 수준',
    description: '해당 시군구의 평균 가격대를 반영',
  },
  dong_target_enc: {
    title: '동네 선호도',
    description: '읍면동 단위 수요와 선호도를 반영',
  },
  area_exclusive: {
    title: '전용면적',
    description: '면적 규모에 따른 가격 영향',
  },
  total_units: {
    title: '총 세대수',
    description: '단지 규모가 가격에 미치는 영향',
  },
  parking_ratio: {
    title: '주차 여건',
    description: '세대당 주차 가능 수준을 반영',
  },
  building_age: {
    title: '건물 연식',
    description: '준공 후 경과 연수의 영향',
  },
  floor: {
    title: '층수',
    description: '거래 층수에 따른 가격 차이',
  },
  convenience_count_500m: {
    title: '편의시설 접근성',
    description: '반경 500m 내 생활 편의시설 수',
  },
  school_count_500m: {
    title: '학교 접근성',
    description: '인근 학교 수와 접근성 영향',
  },
  subway_count_500m: {
    title: '지하철 접근성',
    description: '인근 역세권 접근성 영향',
  },
  bus_count_500m: {
    title: '버스 접근성',
    description: '대중교통 접근성 영향',
  },
  transaction_count_3m: {
    title: '최근 거래 활발도',
    description: '최근 3개월 거래량을 반영',
  },
  transaction_count_6m: {
    title: '반기 거래 활발도',
    description: '최근 6개월 거래량을 반영',
  },
}

const TOKEN_LABELS: Record<string, string> = {
  price: '가격',
  lag: '시차',
  rolling: '추세',
  mean: '평균',
  median: '중앙값',
  sigungu: '시군구',
  dong: '동네',
  target: '수준',
  enc: '지표',
  area: '면적',
  exclusive: '전용',
  convenience: '편의시설',
  school: '학교',
  subway: '지하철',
  bus: '버스',
  count: '수',
  total: '총',
  units: '세대수',
  parking: '주차',
  ratio: '비율',
  building: '건물',
  age: '연식',
  floor: '층수',
  transaction: '거래',
}

function normalizeKey(value?: string | null): string {
  return (value || '').trim().toLowerCase()
}

function hasReadableKorean(value?: string | null): boolean {
  const text = (value || '').trim()
  if (!text) return false
  if (TECHNICAL_NAME_RE.test(text)) return false
  return /[가-힣]/.test(text)
}

function humanizeTechnicalName(value: string): string {
  const tokens = normalizeKey(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => {
      if (/^\d+m$/.test(token)) {
        return `${token.slice(0, -1)}개월`
      }
      return TOKEN_LABELS[token] || token
    })

  if (tokens.length === 0) return '가격 영향 요인'

  const koreanTokenCount = tokens.filter((token) =>
    /[가-힣]/.test(token)
  ).length
  if (koreanTokenCount < Math.ceil(tokens.length / 2)) {
    return '시장 데이터 기반 요인'
  }

  return tokens.join(' ')
}

export function getPriceFactorLabel(
  factorName: string,
  factorNameKo?: string
): PriceFactorLabel {
  if (hasReadableKorean(factorNameKo)) {
    return {
      title: factorNameKo!.trim(),
      description: DEFAULT_DESCRIPTION,
    }
  }

  const keys = [normalizeKey(factorName), normalizeKey(factorNameKo)]
  for (const key of keys) {
    if (key && PRICE_FACTOR_LABELS[key]) return PRICE_FACTOR_LABELS[key]
  }

  return {
    title: humanizeTechnicalName(factorName || factorNameKo || ''),
    description: DEFAULT_DESCRIPTION,
  }
}
