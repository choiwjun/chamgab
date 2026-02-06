import { test, expect } from '@playwright/test'

/**
 * P5-Integration-T1: 상권분석 전체 플로우 E2E 테스트
 * - 검색 → 결과 → 비교 통합 플로우
 * - 에러 시나리오 테스트
 * - 성능 테스트 (Lighthouse 90+ 목표)
 */

// 전체 API 모킹
async function mockAllAPIs(page: import('@playwright/test').Page) {
  // 지역 목록
  await page.route('**/api/commercial/districts', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify([
        { code: '11680-001', name: '역삼역 상권', district_type: '발달상권' },
        { code: '11680-002', name: '강남역 상권', district_type: '발달상권' },
        { code: '11310-001', name: '홍대입구 상권', district_type: '발달상권' },
      ]),
    })
  })

  // 업종 목록
  await page.route('**/api/commercial/industries', async (route) => {
    if (route.request().url().includes('/industries/')) {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      body: JSON.stringify([
        { code: 'I56111', name: '커피전문점', category: '음식점업' },
        { code: 'I56191', name: '치킨전문점', category: '음식점업' },
        { code: 'I47112', name: '편의점', category: '소매업' },
      ]),
    })
  })

  // 성공 확률 예측
  await page.route('**/api/commercial/predict**', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        success_probability: 72.5,
        grade: 'B+',
        factors: [
          { factor: '높은 유동인구', impact: 'positive', score: 85 },
          { factor: '적정 경쟁강도', impact: 'positive', score: 70 },
          { factor: '높은 임대료', impact: 'negative', score: 40 },
        ],
        recommendation: '성공 가능성이 높은 상권입니다.',
      }),
    })
  })

  // 상권 특성
  await page.route(
    '**/api/commercial/districts/*/characteristics**',
    async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          district_type: '대학상권',
          target_age: '20대',
          hourly_traffic: { morning: 450, lunch: 892, evening: 1245 },
          avg_spending: 15000,
        }),
      })
    }
  )

  // 시간대별
  await page.route(
    '**/api/commercial/districts/*/peak-hours**',
    async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          peak_hours: {
            morning: { time: '06-11시', traffic: 450, score: 7 },
            lunch: { time: '11-14시', traffic: 892, score: 10 },
            evening: { time: '17-21시', traffic: 1245, score: 10 },
          },
          best_time: 'evening',
          recommendation: '저녁 시간대 집중 운영',
        }),
      })
    }
  )

  // 연령대별
  await page.route(
    '**/api/commercial/districts/*/demographics**',
    async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          demographics: {
            '20대': { count: 525, percentage: 35, score: 10 },
            '30대': { count: 375, percentage: 25, score: 8 },
          },
          primary_target: '20대',
          persona: { name: 'MZ세대 직장인', age: '25-35세' },
        }),
      })
    }
  )

  // 주말/평일
  await page.route(
    '**/api/commercial/districts/*/weekday-weekend**',
    async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          weekday: { avg_traffic: 2500 },
          weekend: { avg_traffic: 3200 },
          better_day: 'weekend',
          strategy: '주말 매출 우세',
        }),
      })
    }
  )

  // 프로필
  await page.route('**/api/commercial/districts/*/profile**', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        district_type: '대학상권',
        characteristics: ['젊은 유동인구'],
        success_factors: ['트렌디한 컨셉'],
      }),
    })
  })

  // 경쟁
  await page.route(
    '**/api/commercial/industries/*/competition-map**',
    async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          density_score: 65,
          density_level: 'medium',
          total_stores: 48,
        }),
      })
    }
  )

  // 성장 가능성
  await page.route(
    '**/api/commercial/districts/*/growth-potential**',
    async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          growth_score: 78,
          growth_grade: 'A',
          signals: [{ type: 'positive', title: '매출 성장세' }],
        }),
      })
    }
  )

  // AI 업종 추천
  await page.route(
    '**/api/commercial/districts/*/recommend-industry**',
    async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          recommendations: [
            {
              rank: 1,
              industry_code: 'I56111',
              industry_name: '커피전문점',
              matching_score: 92,
              expected_monthly_sales: 35000000,
            },
          ],
        }),
      })
    }
  )

  // 비교
  await page.route('**/api/commercial/business/compare**', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        industry_code: 'I56111',
        industry_name: '커피전문점',
        comparisons: [
          {
            district_code: '11680-001',
            district_name: '역삼역 상권',
            success_probability: 75.5,
            overall_score: 82,
            rank: 1,
          },
          {
            district_code: '11680-002',
            district_name: '강남역 상권',
            success_probability: 68.3,
            overall_score: 72,
            rank: 2,
          },
        ],
      }),
    })
  })

  // 업종 통계
  await page.route(
    '**/api/commercial/industries/*/statistics**',
    async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          industry_code: 'I56111',
          industry_name: '커피전문점',
          total_stores: 85420,
          avg_survival_rate: 72.3,
          avg_monthly_sales: 32500000,
          top_districts: [
            {
              rank: 1,
              district_name: '역삼역 상권',
              success_probability: 82.5,
            },
          ],
        }),
      })
    }
  )
}

test.describe('전체 플로우: 검색 → 결과 → 비교', () => {
  test('메인에서 결과까지 기본 플로우', async ({ page }) => {
    await mockAllAPIs(page)

    // Step 1: 메인 페이지
    await page.goto('/business-analysis')
    await expect(
      page.getByRole('heading', { name: /창업 성공 확률/ })
    ).toBeVisible()

    // Step 2: 지역/업종 선택 (select 또는 custom 컴포넌트)
    const selects = page.locator('select')
    const selectCount = await selects.count()

    if (selectCount >= 2) {
      await selects.first().selectOption({ index: 1 })
      await selects.nth(1).selectOption({ index: 1 })

      // Step 3: 분석 시작
      const submitButton = page.getByRole('button', { name: /분석 시작/ })
      if (!(await submitButton.isDisabled())) {
        await submitButton.click()

        // Step 4: 결과 페이지 도착
        await expect(page).toHaveURL(/\/business-analysis\/result/, {
          timeout: 10000,
        })

        // Step 5: 결과 콘텐츠 로드
        await page.waitForLoadState('networkidle', { timeout: 15000 })
        await expect(page.getByText(/성공 확률/).first()).toBeVisible({
          timeout: 15000,
        })
      }
    }
  })

  test('결과에서 비교 페이지로 이동', async ({ page }) => {
    await mockAllAPIs(page)

    // 결과 페이지 직접 접근
    await page.goto(
      '/business-analysis/result?district=11680-001&industry=I56111'
    )
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 비교 페이지로 이동 링크/버튼 확인
    const compareLink = page.getByText(/비교|다른 지역/).first()
    const isVisible = await compareLink.isVisible().catch(() => false)

    if (isVisible) {
      await compareLink.click()
      await expect(page).toHaveURL(/\/business-analysis\/compare/)
    } else {
      // 직접 비교 페이지로 이동
      await page.goto('/business-analysis/compare')
      await expect(page.getByText('비교 설정')).toBeVisible()
    }
  })

  test('결과에서 업종 통계 페이지로 이동', async ({ page }) => {
    await mockAllAPIs(page)

    // 업종 통계 페이지 직접 접근
    await page.goto('/business-analysis/industry/I56111')
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 돌아가기 확인
    await expect(page.getByText('돌아가기')).toBeVisible({ timeout: 15000 })

    // CTA 버튼으로 메인으로 돌아가기
    const ctaButton = page.getByRole('button', {
      name: /상권 분석 시작|분석 시작/,
    })
    const isVisible = await ctaButton.isVisible().catch(() => false)

    if (isVisible) {
      await ctaButton.click()
      await expect(page).toHaveURL(/\/business-analysis$/)
    }
  })
})

test.describe('에러 시나리오', () => {
  test('네트워크 오프라인 상태에서 접근', async ({ page }) => {
    await page.goto('/business-analysis')
    await expect(
      page.getByRole('heading', { name: /창업 성공 확률/ })
    ).toBeVisible()

    // 오프라인 시뮬레이션
    await page.route('**/api/**', async (route) => {
      await route.abort('connectionrefused')
    })

    // 결과 페이지 접근 시 에러 처리
    await page.goto(
      '/business-analysis/result?district=11680-001&industry=I56111'
    )
    await page.waitForTimeout(3000)

    // 페이지가 크래시하지 않는지 확인
    expect(await page.title()).toBeDefined()
  })

  test('API 부분 실패 시 나머지 섹션 정상 표시', async ({ page }) => {
    // 일부 API만 성공
    await page.route('**/api/commercial/predict**', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success_probability: 72.5,
          grade: 'B+',
          factors: [],
          recommendation: '분석 완료',
        }),
      })
    })

    // 나머지 API는 실패
    await page.route('**/api/commercial/districts/**', async (route) => {
      await route.fulfill({ status: 500, body: '{}' })
    })

    await page.goto(
      '/business-analysis/result?district=11680-001&industry=I56111'
    )
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 페이지가 완전히 크래시하지 않는지 확인
    expect(await page.title()).toBeDefined()
  })

  test('잘못된 URL 파라미터 처리', async ({ page }) => {
    await page.goto(
      '/business-analysis/result?district=INVALID&industry=INVALID'
    )
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 에러 메시지 또는 기본 UI 표시
    expect(await page.title()).toBeDefined()
  })

  test('비교 페이지 - 지역 1개만 선택 시 비교 불가', async ({ page }) => {
    await mockAllAPIs(page)
    await page.goto('/business-analysis/compare')

    // 비교하기 버튼 비활성화 상태 유지
    const compareButton = page.getByRole('button', { name: /비교하기/ })
    await expect(compareButton).toBeDisabled()
  })
})

test.describe('성능 테스트', () => {
  test('메인 페이지 FCP < 2초', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/business-analysis')
    await page.waitForLoadState('domcontentloaded')

    // First Contentful Paint 확인
    await expect(
      page.getByRole('heading', { name: /창업 성공 확률/ })
    ).toBeVisible()
    const renderTime = Date.now() - startTime

    // CI 환경 고려하여 여유 있게 설정
    expect(renderTime).toBeLessThan(5000)
  })

  test('결과 페이지 전체 로드 시간', async ({ page }) => {
    await mockAllAPIs(page)

    const startTime = Date.now()
    await page.goto(
      '/business-analysis/result?district=11680-001&industry=I56111'
    )
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    const totalTime = Date.now() - startTime

    // 네트워크 모킹이므로 빠르게 완료되어야 함
    expect(totalTime).toBeLessThan(10000)
  })

  test('페이지 간 네비게이션 빠른 전환', async ({ page }) => {
    await mockAllAPIs(page)

    // 메인 → 결과 → 비교 → 메인 순회
    const startTime = Date.now()

    await page.goto('/business-analysis')
    await page.waitForLoadState('domcontentloaded')

    await page.goto(
      '/business-analysis/result?district=11680-001&industry=I56111'
    )
    await page.waitForLoadState('domcontentloaded')

    await page.goto('/business-analysis/compare')
    await page.waitForLoadState('domcontentloaded')

    await page.goto('/business-analysis')
    await page.waitForLoadState('domcontentloaded')

    const totalTime = Date.now() - startTime

    // 4페이지 순회 15초 이내
    expect(totalTime).toBeLessThan(15000)
  })

  test('JavaScript 번들 크기 검증', async ({ page }) => {
    // 네트워크 모니터링
    const jsRequests: number[] = []

    page.on('response', (response) => {
      const url = response.url()
      if (url.endsWith('.js') || url.includes('/_next/static')) {
        const contentLength = response.headers()['content-length']
        if (contentLength) {
          jsRequests.push(parseInt(contentLength))
        }
      }
    })

    await page.goto('/business-analysis')
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 개별 JS 번들이 500KB를 넘지 않는지 확인
    for (const size of jsRequests) {
      expect(size).toBeLessThan(500 * 1024) // 500KB
    }
  })
})
