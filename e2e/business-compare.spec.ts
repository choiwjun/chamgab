import { test, expect } from '@playwright/test'

/**
 * P5-S3-V: 지역 비교 화면 검증
 * - E2E 테스트
 * - 반응형 테스트
 */

// 공통 API 모킹
async function mockCompareAPIs(page: import('@playwright/test').Page) {
  // 지역 목록
  await page.route('**/api/commercial/districts**', async (route) => {
    if (route.request().url().includes('/districts/')) {
      await route.continue()
      return
    }
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
  await page.route('**/api/commercial/industries**', async (route) => {
    if (route.request().url().includes('/industries/')) {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      body: JSON.stringify([
        { code: 'I56111', name: '커피전문점', category: '음식점업' },
        { code: 'I56191', name: '치킨전문점', category: '음식점업' },
      ]),
    })
  })

  // 비교 API
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
            survival_rate: 78.2,
            monthly_avg_sales: 42000000,
            store_count: 48,
            competition_ratio: 1.2,
            growth_rate: 5.3,
            overall_score: 82,
            rank: 1,
          },
          {
            district_code: '11680-002',
            district_name: '강남역 상권',
            success_probability: 68.3,
            survival_rate: 72.5,
            monthly_avg_sales: 55000000,
            store_count: 95,
            competition_ratio: 1.8,
            growth_rate: 2.1,
            overall_score: 72,
            rank: 2,
          },
          {
            district_code: '11310-001',
            district_name: '홍대입구 상권',
            success_probability: 71.2,
            survival_rate: 75.8,
            monthly_avg_sales: 38000000,
            store_count: 62,
            competition_ratio: 1.4,
            growth_rate: 4.8,
            overall_score: 78,
            rank: 3,
          },
        ],
      }),
    })
  })
}

test.describe('P5-S3-V: 지역 비교 화면 - E2E', () => {
  test('비교 페이지 로드 및 기본 UI 표시', async ({ page }) => {
    await mockCompareAPIs(page)
    await page.goto('/business-analysis/compare')

    // 헤더 확인
    await expect(page.getByRole('heading', { name: /지역 비교/ })).toBeVisible()

    // 설명 텍스트
    await expect(page.getByText(/최대 3개 지역/)).toBeVisible()

    // 비교 설정 패널
    await expect(page.getByText('비교 설정')).toBeVisible()

    // 초기 안내 메시지
    await expect(page.getByText(/비교를 시작하세요/)).toBeVisible()
  })

  test('업종 선택 드롭다운', async ({ page }) => {
    await mockCompareAPIs(page)
    await page.goto('/business-analysis/compare')

    // 업종 선택 라벨
    await expect(page.getByText('업종 선택')).toBeVisible()
  })

  test('지역 추가/제거 기능', async ({ page }) => {
    await mockCompareAPIs(page)
    await page.goto('/business-analysis/compare')

    // 지역 추가 라벨 (0/3)
    await expect(page.getByText(/지역 추가.*0\/3/)).toBeVisible()

    // 초기 상태: 선택된 지역 없음
    await expect(page.getByText(/비교할 지역을 선택해주세요/)).toBeVisible()
  })

  test('비교 버튼 - 미선택 시 비활성화', async ({ page }) => {
    await mockCompareAPIs(page)
    await page.goto('/business-analysis/compare')

    const compareButton = page.getByRole('button', { name: /비교하기/ })
    await expect(compareButton).toBeVisible()
    await expect(compareButton).toBeDisabled()
  })

  test('돌아가기 버튼 네비게이션', async ({ page }) => {
    await mockCompareAPIs(page)
    await page.goto('/business-analysis/compare')

    const backButton = page.getByRole('button', { name: /돌아가기/ })
    await expect(backButton).toBeVisible()

    await backButton.click()
    await expect(page).toHaveURL(/\/business-analysis$/)
  })

  test('URL 파라미터로 초기값 설정', async ({ page }) => {
    await mockCompareAPIs(page)
    await page.goto(
      '/business-analysis/compare?districts=11680-001,11680-002&industry=I56111'
    )

    // 선택된 지역이 표시됨
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    await expect(page.getByText(/11680-001|역삼역/).first()).toBeVisible({
      timeout: 5000,
    })
  })

  test('에러 상태 처리', async ({ page }) => {
    // API 에러 모킹
    await page.route('**/api/commercial/business/compare**', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ detail: '비교 분석 중 오류가 발생했습니다.' }),
      })
    })
    await page.route('**/api/commercial/districts**', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([]),
      })
    })
    await page.route('**/api/commercial/industries**', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([]),
      })
    })

    await page.goto('/business-analysis/compare')

    // 페이지가 크래시하지 않는지 확인
    await expect(page.getByText('비교 설정')).toBeVisible()
  })
})

test.describe('P5-S3-V: 반응형 테스트', () => {
  test('데스크탑: 3컬럼 레이아웃', async ({ page }) => {
    test.skip(
      page.viewportSize()?.width !== undefined &&
        page.viewportSize()!.width < 1024,
      '데스크탑 전용 테스트'
    )
    await mockCompareAPIs(page)
    await page.goto('/business-analysis/compare')

    // lg: 3컬럼 그리드 확인 (왼쪽 1 + 오른쪽 2)
    const grid = page.locator('.grid.grid-cols-1.lg\\:grid-cols-3')
    await expect(grid).toBeVisible()
  })

  test('모바일: 단일 컬럼 레이아웃', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await mockCompareAPIs(page)
    await page.goto('/business-analysis/compare')

    // 주요 요소 세로 스택 표시
    await expect(page.getByRole('heading', { name: /지역 비교/ })).toBeVisible()
    await expect(page.getByText('비교 설정')).toBeVisible()
  })

  test('태블릿: 레이아웃 적응', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await mockCompareAPIs(page)
    await page.goto('/business-analysis/compare')

    // 비교 설정 패널과 결과 영역 모두 표시
    await expect(page.getByRole('heading', { name: /지역 비교/ })).toBeVisible()
    await expect(page.getByText('비교 설정')).toBeVisible()
  })
})
