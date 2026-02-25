export type CreditProduct = 'home_price' | 'commercial' | 'school' | 'land'

export const CREDIT_COST_DEFAULTS: Record<CreditProduct, number> = {
  home_price: 2,
  commercial: 1,
  school: 1,
  land: 4,
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  min = 1,
  max = 100
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

const CREDIT_COST_MAP: Record<CreditProduct, number> = {
  home_price: parsePositiveInt(
    process.env.CREDIT_COST_HOME_PRICE,
    CREDIT_COST_DEFAULTS.home_price
  ),
  commercial: parsePositiveInt(
    process.env.CREDIT_COST_COMMERCIAL,
    CREDIT_COST_DEFAULTS.commercial
  ),
  school: parsePositiveInt(
    process.env.CREDIT_COST_SCHOOL,
    CREDIT_COST_DEFAULTS.school
  ),
  land: parsePositiveInt(process.env.CREDIT_COST_LAND, CREDIT_COST_DEFAULTS.land),
}

export function getCreditCost(product: CreditProduct): number {
  return CREDIT_COST_MAP[product]
}
