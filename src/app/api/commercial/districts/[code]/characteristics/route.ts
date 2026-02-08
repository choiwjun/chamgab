/**
 * GET /api/commercial/districts/[code]/characteristics
 *
 * 상권 특성 분석 - Supabase 실데이터
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getSupabase,
  getDistrictName,
  fullName,
  fetchFootTraffic,
  fetchDistrictChar,
  fetchSalesStats,
  latestByIndustry,
  num,
} from '../../../_helpers'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const supabase = getSupabase()

    const { name, sido } = await getDistrictName(supabase, code)
    const dname = fullName(name, sido)

    const footData = await fetchFootTraffic(supabase, code)
    const charData = await fetchDistrictChar(supabase, code)
    const salesStats = latestByIndustry(await fetchSalesStats(supabase, code))

    // 시간대별 유동인구
    const timeSlots: Record<string, number> = {
      '00-06': num(footData.time_00_06),
      '06-11': num(footData.time_06_11),
      '11-14': num(footData.time_11_14),
      '14-17': num(footData.time_14_17),
      '17-21': num(footData.time_17_21),
      '21-24': num(footData.time_21_24),
    }
    const rawTraffic = Object.values(timeSlots).reduce((a, b) => a + b, 0)
    const hasFootTraffic = rawTraffic > 0
    const totalTraffic = rawTraffic || 1
    const timeDistribution = Object.entries(timeSlots).map(([slot, count]) => ({
      time_slot: slot,
      traffic_count: count,
      percentage: Math.round((count / totalTraffic) * 1000) / 10,
    }))

    // 연령대별
    const ageGroups: Record<string, number> = {
      '10대': num(footData.age_10s),
      '20대': num(footData.age_20s),
      '30대': num(footData.age_30s),
      '40대': num(footData.age_40s),
      '50대': num(footData.age_50s),
      '60대 이상': num(footData.age_60s_plus),
    }
    const totalAge = Object.values(ageGroups).reduce((a, b) => a + b, 0) || 1
    const ageDistribution = Object.entries(ageGroups).map(([group, count]) => ({
      age_group: group,
      count,
      percentage: Math.round((count / totalAge) * 1000) / 10,
    }))

    // 상권 유형
    let districtType = (charData.district_type as string) || ''
    let primaryAgeGroup = (charData.primary_age_group as string) || ''

    if (!districtType) {
      const r20 = ageGroups['20대'] / totalAge
      const r30 = ageGroups['30대'] / totalAge
      const r40 = ageGroups['40대'] / totalAge
      if (r20 > 0.25) districtType = '대학상권'
      else if (r30 > 0.28) districtType = '오피스상권'
      else if (r40 > 0.25) districtType = '주거상권'
      else districtType = '복합상권'
    }
    if (!primaryAgeGroup) {
      if (hasFootTraffic) {
        primaryAgeGroup = Object.entries(ageGroups).sort(
          (a, b) => b[1] - a[1]
        )[0][0]
      } else {
        primaryAgeGroup = '30대'
      }
    }

    // 인구 비율
    const officeWorkerRatio =
      num(charData.office_worker_ratio) ||
      (districtType === '오피스상권'
        ? 65
        : districtType === '대학상권'
          ? 20
          : 30)
    const studentRatio =
      num(charData.student_ratio) ||
      (districtType === '대학상권'
        ? 45
        : districtType === '오피스상권'
          ? 5
          : 15)
    const residentRatio =
      Math.round((100 - officeWorkerRatio - studentRatio) * 10) / 10

    // 피크 타임
    let peakTimeStart = (charData.peak_time_start as string) || ''
    let peakTimeEnd = (charData.peak_time_end as string) || ''
    if (!peakTimeStart) {
      if (hasFootTraffic) {
        const peakSlot = Object.entries(timeSlots).sort(
          (a, b) => b[1] - a[1]
        )[0][0]
        const slotMap: Record<string, [string, string]> = {
          '06-11': ['06:00', '11:00'],
          '11-14': ['11:00', '14:00'],
          '14-17': ['14:00', '17:00'],
          '17-21': ['17:00', '21:00'],
          '21-24': ['21:00', '24:00'],
          '00-06': ['00:00', '06:00'],
        }
        ;[peakTimeStart, peakTimeEnd] = slotMap[peakSlot] || ['11:00', '21:00']
      } else {
        peakTimeStart = '11:00'
        peakTimeEnd = '14:00'
      }
    }
    const peakTraffic =
      num(charData.peak_time_traffic) || Math.max(...Object.values(timeSlots))

    // 주중/주말
    const weekdayAvg = num(footData.weekday_avg)
    const weekendAvg = num(footData.weekend_avg)
    const weekendSalesRatio =
      num(charData.weekend_sales_ratio) ||
      (weekdayAvg + weekendAvg > 0
        ? Math.round((weekendAvg / (weekdayAvg + weekendAvg)) * 1000) / 10
        : 40)

    // 객단가
    let avgMonthly = 0
    if (salesStats.length) {
      avgMonthly =
        salesStats.reduce((s, r) => s + num(r.monthly_avg_sales), 0) /
        salesStats.length
    }
    const avgTicketPrice =
      num(charData.avg_ticket_price) ||
      (avgMonthly ? Math.round(avgMonthly / 1500) : 15000)
    const consumptionLevel =
      (charData.consumption_level as string) ||
      (avgTicketPrice >= 30000
        ? '높음'
        : avgTicketPrice >= 15000
          ? '중간'
          : '낮음')

    // 추천 운영시간
    let recommendedHours: string
    if (peakTimeStart === '17:00') {
      recommendedHours = `${peakTimeStart}-22:00 (저녁 피크 타임)`
    } else if (peakTimeStart === '11:00') {
      recommendedHours = `${peakTimeStart}-15:00 (점심 피크 타임)`
    } else {
      recommendedHours = '11:00-22:00 (점심/저녁 모두 운영)'
    }

    const profileMap: Record<string, string> = {
      대학상권: '대학생 및 20대 직장 초년생',
      오피스상권: '30-40대 직장인 (점심/저녁 고객)',
      주거상권: '지역 주민 (가족 단위)',
      복합상권: '다양한 연령층',
    }

    return NextResponse.json({
      district_code: code,
      district_name: dname,
      district_type: districtType,
      primary_age_group: primaryAgeGroup,
      primary_age_ratio:
        Math.round((Math.max(...Object.values(ageGroups)) / totalAge) * 1000) /
        10,
      office_worker_ratio: officeWorkerRatio,
      resident_ratio: residentRatio,
      student_ratio: studentRatio,
      peak_time_start: peakTimeStart,
      peak_time_end: peakTimeEnd,
      peak_time_traffic: peakTraffic,
      time_distribution: timeDistribution,
      age_distribution: ageDistribution,
      avg_ticket_price: avgTicketPrice,
      consumption_level: consumptionLevel,
      weekday_dominant: weekendSalesRatio < 50,
      weekend_sales_ratio: weekendSalesRatio,
      recommended_business_hours: recommendedHours,
      target_customer_profile: profileMap[districtType] || '다양한 연령층',
    })
  } catch (err) {
    console.error('[Characteristics] Exception:', err)
    return NextResponse.json(
      { detail: '상권 특성 조회 중 오류' },
      { status: 500 }
    )
  }
}
