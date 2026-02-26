import type { PriceFactor } from '@/types/chamgab'

export interface FactorLabel {
  title: string
  subtitle?: string
}

const DEFAULT_LABEL: FactorLabel = {
  title: '\uAC00\uACA9 \uC601\uD5A5 \uC694\uC778',
  subtitle: '\uBAA8\uB378 \uBD84\uC11D\uC5D0\uC11C \uBC18\uC601\uB41C \uC8FC\uC694 \uD56D\uBAA9',
}

const FACTOR_LABELS: Record<string, FactorLabel> = {
  area_exclusive: {
    title: '\uC804\uC6A9\uBA74\uC801',
    subtitle: '\uC2E4\uC0AC\uC6A9 \uBA74\uC801 \uAE30\uC900',
  },
  floor: {
    title: '\uCE35\uC218',
    subtitle: '\uD574\uB2F9 \uB9E4\uBB3C \uC704\uCE58 \uCE35',
  },
  transaction_year: {
    title: '\uAC70\uB798 \uC5F0\uB3C4',
    subtitle: '\uAC70\uB798\uAC00 \uBC1C\uC0DD\uD55C \uC5F0\uB3C4',
  },
  transaction_month: {
    title: '\uAC70\uB798 \uC6D4',
    subtitle: '\uAC70\uB798 \uC2DC\uC810 \uC6D4 \uC815\uBCF4',
  },
  transaction_quarter: {
    title: '\uAC70\uB798 \uBD84\uAE30',
    subtitle: '\uACC4\uC808\uC131\uC744 \uBC18\uC601\uD55C \uBD84\uAE30 \uC9C0\uD45C',
  },
  building_age: {
    title: '\uAC74\uCD95 \uC5F0\uCC28',
    subtitle: '\uC900\uACF5 \uD6C4 \uACBD\uACFC \uB144\uC218',
  },
  floor_ratio: {
    title: '\uCE35 \uC704\uCE58 \uBE44\uC728',
    subtitle: '\uC804\uCCB4 \uCE35\uC218 \uB300\uBE44 \uC704\uCE58',
  },
  total_floors: {
    title: '\uCD1D \uCE35\uC218',
    subtitle: '\uB2E8\uC9C0 \uB610\uB294 \uB3D9\uC758 \uC804\uCCB4 \uCE35\uC218',
  },
  total_units: {
    title: '\uCD1D \uC138\uB300\uC218',
    subtitle: '\uB2E8\uC9C0 \uADDC\uBAA8\uB97C \uB098\uD0C0\uB0B4\uB294 \uC9C0\uD45C',
  },
  parking_ratio: {
    title: '\uC8FC\uCC28 \uD658\uACBD',
    subtitle: '\uC138\uB300 \uB300\uBE44 \uC8FC\uCC28 \uC5EC\uAC74',
  },
  brand_tier: {
    title: '\uBE0C\uB79C\uB4DC \uC120\uD638\uB3C4',
    subtitle: '\uBE0C\uB79C\uB4DC \uC778\uC9C0\uB3C4 \uBC0F \uC2E0\uB8B0\uB3C4 \uBC18\uC601',
  },
  sido_encoded: {
    title: '\uC2DC\uB3C4 \uC704\uCE58',
    subtitle: '\uAD11\uC5ED \uD589\uC815\uAD6C\uC5ED \uAE30\uC900',
  },
  sigungu_encoded: {
    title: '\uC2DC\uAD70\uAD6C \uC704\uCE58',
    subtitle: '\uAE30\uCD08 \uD589\uC815\uAD6C\uC5ED \uAE30\uC900',
  },
  sigungu_target_enc: {
    title: '\uC2DC\uAD70\uAD6C \uC2DC\uC138 \uC218\uC900',
    subtitle: '\uD574\uB2F9 \uC9C0\uC5ED \uD3C9\uADE0 \uAC00\uACA9 \uD750\uB984',
  },
  dong_target_enc: {
    title: '\uB3D9\uB124 \uC2DC\uC138 \uC218\uC900',
    subtitle: '\uC138\uBD80 \uC0DD\uD65C\uAD8C\uC758 \uAC00\uACA9 \uD750\uB984',
  },
  price_lag_1m: {
    title: '\uCD5C\uADFC 1\uAC1C\uC6D4 \uC2DC\uC138',
    subtitle: '\uC9C1\uC804 1\uAC1C\uC6D4 \uD3C9\uADE0 \uAC70\uB798\uAC00',
  },
  price_lag_3m: {
    title: '\uCD5C\uADFC 3\uAC1C\uC6D4 \uC2DC\uC138',
    subtitle: '\uC9C1\uC804 3\uAC1C\uC6D4 \uD3C9\uADE0 \uAC70\uB798\uAC00',
  },
  price_rolling_6m_mean: {
    title: '\uCD5C\uADFC 6\uAC1C\uC6D4 \uD3C9\uADE0 \uC2DC\uC138',
    subtitle: '\uC911\uAE30 \uAC00\uACA9 \uD750\uB984',
  },
  price_rolling_6m_std: {
    title: '\uCD5C\uADFC 6\uAC1C\uC6D4 \uC2DC\uC138 \uBCC0\uB3D9\uC131',
    subtitle: '\uAC00\uACA9 \uD754\uB4E4\uB9BC \uC815\uB3C4',
  },
  price_yoy_change: {
    title: '\uC804\uB144 \uB300\uBE44 \uAC00\uACA9 \uBCC0\uD654',
    subtitle: '\uC791\uB144 \uAC19\uC740 \uC2DC\uAE30 \uB300\uBE44 \uBCC0\uD654\uC728',
  },
  volume_lag_1m: {
    title: '\uCD5C\uADFC \uAC70\uB798 \uD65C\uBC1C\uB3C4',
    subtitle: '\uCD5C\uADFC 1\uAC1C\uC6D4 \uAC70\uB798\uB7C9 \uC218\uC900',
  },
  distance_to_subway: {
    title: '\uC9C0\uD558\uCCA0 \uC811\uADFC\uC131',
    subtitle: '\uAC00\uAE4C\uC6B8\uC218\uB85D \uC120\uD638\uB3C4\uAC00 \uB192\uC544\uC9D0',
  },
  subway_count_1km: {
    title: '\uC9C0\uD558\uCCA0 \uC5ED \uC218',
    subtitle: '\uBC18\uACBD 1km \uB0B4 \uC5ED\uC138\uAD8C \uBC00\uB3C4',
  },
  distance_to_school: {
    title: '\uD559\uAD50 \uC811\uADFC\uC131',
    subtitle: '\uD1B5\uD559 \uD3B8\uC758\uC131\uC744 \uBC18\uC601',
  },
  school_count_1km: {
    title: '\uD559\uAD50 \uC218',
    subtitle: '\uBC18\uACBD 1km \uB0B4 \uAD50\uC721 \uC778\uD504\uB77C',
  },
  distance_to_academy: {
    title: '\uD559\uC6D0\uAC00 \uC811\uADFC\uC131',
    subtitle: '\uAD50\uC721 \uC0C1\uAD8C\uACFC\uC758 \uAC70\uB9AC',
  },
  academy_count_1km: {
    title: '\uD559\uC6D0 \uC218',
    subtitle: '\uBC18\uACBD 1km \uB0B4 \uD559\uC6D0 \uBC00\uB3C4',
  },
  distance_to_hospital: {
    title: '\uBCD1\uC6D0 \uC811\uADFC\uC131',
    subtitle: '\uC758\uB8CC \uC778\uD504\uB77C \uC811\uADFC \uC6A9\uC774\uC131',
  },
  hospital_count_1km: {
    title: '\uBCD1\uC6D0 \uC218',
    subtitle: '\uBC18\uACBD 1km \uB0B4 \uC758\uB8CC\uC2DC\uC124 \uAC1C\uC218',
  },
  distance_to_mart: {
    title: '\uB9C8\uD2B8 \uC811\uADFC\uC131',
    subtitle: '\uC0DD\uD65C \uD3B8\uC758\uC2DC\uC124\uACFC\uC758 \uAC70\uB9AC',
  },
  convenience_count_500m: {
    title: '\uD3B8\uC758\uC2DC\uC124 \uBC00\uC9D1\uB3C4',
    subtitle: '\uBC18\uACBD 500m \uB0B4 \uD3B8\uC758\uC810 \uC218',
  },
  distance_to_park: {
    title: '\uACF5\uC6D0 \uC811\uADFC\uC131',
    subtitle: '\uC5EC\uAC00 \uBC0F \uD734\uC2DD \uD658\uACBD \uC9C0\uD45C',
  },
  poi_score: {
    title: '\uC0DD\uD65C \uC778\uD504\uB77C \uC9C0\uC218',
    subtitle: '\uC8FC\uBCC0 \uC2DC\uC124 \uC885\uD569 \uD3C9\uAC00',
  },
  base_rate: {
    title: '\uAE08\uB9AC \uD658\uACBD',
    subtitle: '\uAE30\uC900\uAE08\uB9AC \uBCC0\uD654 \uC601\uD5A5',
  },
  mortgage_rate: {
    title: '\uC8FC\uB2F4\uB300 \uAE08\uB9AC',
    subtitle: '\uC8FC\uD0DD \uAD6C\uB9E4 \uBE44\uC6A9 \uD658\uACBD',
  },
  jeonse_ratio: {
    title: '\uC804\uC138\uAC00\uC728',
    subtitle: '\uB9E4\uB9E4\uAC00 \uB300\uBE44 \uC804\uC138 \uBE44\uC728',
  },
  buying_power_index: {
    title: '\uC218\uC694 \uCCB4\uB825 \uC9C0\uC218',
    subtitle: '\uC2E4\uC218\uC694 \uB9E4\uC218 \uC5EC\uB825 \uBC18\uC601',
  },
  transaction_volume: {
    title: '\uC2DC\uC7A5 \uAC70\uB798\uB7C9',
    subtitle: '\uC2DC\uC7A5 \uD65C\uBC1C\uB3C4 \uC218\uC900',
  },
  price_change_rate: {
    title: '\uC2DC\uC138 \uBCC0\uD654\uC728',
    subtitle: '\uC804\uBC18 \uC2DC\uC7A5 \uC0C1\uC2B9\u00B7\uD558\uB77D \uC555\uB825',
  },
  reb_price_index: {
    title: '\uC8FC\uD0DD \uB9E4\uB9E4 \uC9C0\uC218',
    subtitle: '\uB300\uD45C \uC2DC\uC7A5 \uB9E4\uB9E4 \uC9C0\uD45C',
  },
  reb_rent_index: {
    title: '\uC804\uC138 \uC2DC\uC7A5 \uC9C0\uC218',
    subtitle: '\uC784\uB300\uCC28 \uC2DC\uC7A5 \uD750\uB984 \uC9C0\uD45C',
  },
  is_old_building: {
    title: '\uAD6C\uCD95 \uC5EC\uBD80',
    subtitle: '\uB178\uD6C4\uB3C4\uAC00 \uAC00\uACA9\uC5D0 \uBBF8\uCE58\uB294 \uC601\uD5A5',
  },
  is_reconstruction_target: {
    title: '\uC7AC\uAC74\uCD95 \uAC00\uB2A5\uC131',
    subtitle: '\uC815\uBE44\uC0AC\uC5C5 \uAE30\uB300\uAC10 \uBC18\uC601',
  },
  reconstruction_premium: {
    title: '\uC7AC\uAC74\uCD95 \uAE30\uB300 \uAC00\uCE58',
    subtitle: '\uBBF8\uB798 \uAC1C\uBC1C \uAC00\uCE58 \uBC18\uC601',
  },
  school_district_grade: {
    title: '\uD559\uAD70 \uC120\uD638\uB3C4',
    subtitle: '\uAD50\uC721 \uC218\uC694 \uC9D1\uC911 \uC9C0\uD45C',
  },
  is_premium_school_district: {
    title: '\uC120\uD638 \uD559\uAD70 \uC5EC\uBD80',
    subtitle: '\uC120\uD638 \uB192\uC740 \uD559\uAD70 \uC601\uD5A5 \uBC18\uC601',
  },
  price_vs_previous: {
    title: '\uC9C1\uC804 \uAC70\uB798 \uB300\uBE44 \uAC00\uACA9',
    subtitle: '\uC774\uC804 \uAC70\uB798\uAC00\uC640 \uBE44\uAD50',
  },
  price_vs_complex_avg: {
    title: '\uB2E8\uC9C0 \uD3C9\uADE0 \uB300\uBE44 \uAC00\uACA9',
    subtitle: '\uAC19\uC740 \uB2E8\uC9C0 \uB0B4 \uAC00\uACA9 \uC218\uC900 \uBE44\uAD50',
  },
  price_vs_area_avg: {
    title: '\uC9C0\uC5ED \uD3C9\uADE0 \uB300\uBE44 \uAC00\uACA9',
    subtitle: '\uC8FC\uBCC0 \uC0C1\uAD8C \uB300\uBE44 \uAC00\uACA9 \uC218\uC900',
  },
  direction_premium: {
    title: '\uD5A5 \uC120\uD638\uB3C4',
    subtitle: '\uB0A8\uD5A5 \uB4F1 \uD5A5 \uC870\uAC74 \uBC18\uC601',
  },
  view_premium: {
    title: '\uC870\uB9DD \uAC00\uCE58',
    subtitle: '\uD55C\uAC15\uBDF0\u00B7\uACF5\uC6D0\uBDF0 \uB4F1 \uC870\uB9DD \uC601\uD5A5',
  },
  is_remodeled: {
    title: '\uB9AC\uBAA8\uB378\uB9C1 \uC5EC\uBD80',
    subtitle: '\uC2E4\uB0B4 \uC0C1\uD0DC \uAC1C\uC120 \uC5EC\uBD80',
  },
  remodel_premium: {
    title: '\uB9AC\uBAA8\uB378\uB9C1 \uAC00\uCE58',
    subtitle: '\uC778\uD14C\uB9AC\uC5B4 \uBC0F \uC8FC\uAC70 \uD488\uC9C8 \uD6A8\uACFC',
  },
  footfall_score: {
    title: '\uC720\uB3D9\uC778\uAD6C \uC9C0\uC218',
    subtitle: '\uC8FC\uBCC0 \uC0C1\uAD8C \uD65C\uC131\uB3C4',
  },
  commercial_density: {
    title: '\uC0C1\uC5C5\uC2DC\uC124 \uBC00\uB3C4',
    subtitle: '\uC8FC\uBCC0 \uC0C1\uC5C5 \uC778\uD504\uB77C \uC9D1\uC911\uB3C4',
  },
  store_diversity_index: {
    title: '\uC0C1\uC810 \uB2E4\uC591\uC131 \uC9C0\uC218',
    subtitle: '\uC0DD\uD65C \uD3B8\uC758\uC5C5\uC885 \uAD6C\uC131 \uB2E4\uC591\uC131',
  },
  floor_area_ratio: {
    title: '\uC6A9\uC801\uB960',
    subtitle: '\uB300\uC9C0 \uB300\uBE44 \uC5F0\uBA74\uC801 \uBE44\uC728',
  },
  building_coverage_ratio: {
    title: '\uAC74\uD3D0\uC728',
    subtitle: '\uB300\uC9C0 \uB300\uBE44 \uAC74\uCD95 \uBA74\uC801 \uBE44\uC728',
  },
  total_parking: {
    title: '\uCD1D \uC8FC\uCC28 \uB300\uC218',
    subtitle: '\uB2E8\uC9C0 \uC804\uCCB4 \uC8FC\uCC28 \uC218\uC6A9 \uADDC\uBAA8',
  },
  indoor_parking_ratio: {
    title: '\uC2E4\uB0B4 \uC8FC\uCC28 \uBE44\uC728',
    subtitle: '\uCC9C\uD6C4 \uC601\uD5A5\uC774 \uC801\uC740 \uC8FC\uCC28 \uC5EC\uAC74',
  },
  ground_floors: {
    title: '\uC9C0\uC0C1 \uCE35\uC218',
    subtitle: '\uAC74\uBB3C \uC9C0\uC0C1 \uAD6C\uC131',
  },
  underground_floors: {
    title: '\uC9C0\uD558 \uCE35\uC218',
    subtitle: '\uC9C0\uD558 \uACF5\uAC04 \uADDC\uBAA8',
  },
  dong_count: {
    title: '\uB3D9 \uAC1C\uC218',
    subtitle: '\uB2E8\uC9C0 \uB3D9 \uAD6C\uC131 \uADDC\uBAA8',
  },
  plat_area: {
    title: '\uB300\uC9C0 \uBA74\uC801',
    subtitle: '\uD1A0\uC9C0 \uAE30\uBC18 \uADDC\uBAA8',
  },
  total_area: {
    title: '\uC5F0\uBA74\uC801',
    subtitle: '\uAC74\uBB3C \uC804\uCCB4 \uBA74\uC801',
  },
  area_per_unit: {
    title: '\uC138\uB300\uB2F9 \uBA74\uC801',
    subtitle: '\uC138\uB300 \uAE30\uC900 \uAC74\uBB3C \uADDC\uBAA8',
  },
  parking_per_unit: {
    title: '\uC138\uB300\uB2F9 \uC8FC\uCC28 \uB300\uC218',
    subtitle: '\uC138\uB300 \uAE30\uC900 \uC8FC\uCC28 \uC5EC\uC720 \uC815\uB3C4',
  },
  building_structure_encoded: {
    title: '\uAC74\uBB3C \uAD6C\uC870',
    subtitle: '\uCCA0\uADFC\uCF58\uD06C\uB9AC\uD2B8 \uB4F1 \uAD6C\uC870 \uD2B9\uC131',
  },
}

const TECHNICAL_KEY = /^[a-z][a-z0-9_]*$/i
const HAS_KOREAN = /[\uAC00-\uD7A3]/

function isReadableKorean(text: string) {
  return HAS_KOREAN.test(text)
}

function isTechnicalKey(text: string) {
  return TECHNICAL_KEY.test(text)
}

export function getPriceFactorLabel(
  factor: Pick<PriceFactor, 'factor_name' | 'factor_name_ko'>
): FactorLabel {
  const key = (factor.factor_name || '').trim().toLowerCase()
  if (key && FACTOR_LABELS[key]) {
    return FACTOR_LABELS[key]
  }

  const localized = (factor.factor_name_ko || '').trim()
  if (localized && isReadableKorean(localized) && !isTechnicalKey(localized)) {
    return {
      title: localized,
      subtitle: DEFAULT_LABEL.subtitle,
    }
  }

  return DEFAULT_LABEL
}
