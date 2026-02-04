// @TASK P2-S1 - 포맷팅 유틸리티 함수

/**
 * 숫자를 억/만 단위 한글 표기로 변환
 * @example formatCurrency(250000000) => "2억 5천만원"
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '-'

  const eok = Math.floor(amount / 100000000)
  const man = Math.floor((amount % 100000000) / 10000)
  const chun = Math.floor((amount % 10000) / 1000)

  const parts: string[] = []

  if (eok > 0) parts.push(`${eok}억`)
  if (man > 0) parts.push(`${man}만`)
  if (chun > 0 && eok === 0 && man < 10) parts.push(`${chun}천`)

  return parts.length > 0 ? `${parts.join(' ')}원` : '0원'
}

/**
 * 가격 변동률 포맷팅 (+/-5.2%)
 */
export function formatPriceChange(change: number | null | undefined): string {
  if (change === null || change === undefined) return '-'
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

/**
 * 면적을 평수로 변환
 * @param area 제곱미터
 */
export function formatArea(area: number | null | undefined): string {
  if (area === null || area === undefined) return '-'
  const pyeong = (area / 3.305785).toFixed(1)
  return `${pyeong}평 (${area.toFixed(1)}㎡)`
}

/**
 * 숫자에 콤마 추가
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-'
  return num.toLocaleString('ko-KR')
}

/**
 * 가격을 한글로 포맷팅 (formatCurrency의 별칭)
 * @example formatPrice(250000000) => "2억 5천만원"
 */
export const formatPrice = formatCurrency
