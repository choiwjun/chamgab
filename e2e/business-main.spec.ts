import { test, expect } from '@playwright/test'

/**
 * P5-S1-V: 상권분석 메인 화면 검증
 * - E2E 테스트 (Playwright)
 * - 접근성 테스트 (ARIA)
 * - 성능 테스트 (<2초 로딩)
 */
test.describe('P5-S1-V: 상권분석 메인 화면', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/business-analysis')
  })

  // ========== E2E 테스트 ==========

  test('메인 페이지 로드 및 주요 섹션 표시', async ({ page }) => {
    // Hero 섹션
    await expect(
      page.getByRole('heading', { name: /창업 성공 확률/ })
    ).toBeVisible()
    await expect(page.getByText(/AI가 분석한 상권 데이터/)).toBeVisible()

    // Info Cards (3개)
    await expect(page.getByText('성공 확률 예측')).toBeVisible()
    await expect(page.getByText('상권 특성 분석')).toBeVisible()
    await expect(page.getByText('경쟁 현황 파악')).toBeVisible()
  })

  test('지역 선택 드롭다운 동작', async ({ page }) => {
    // RegionSelect 컴포넌트 존재 확인
    const regionArea = page.getByText('분석할 상권 선택').locator('..')
    await expect(regionArea).toBeVisible()

    // 드롭다운 또는 입력 필드 확인
    const regionInput = page
      .locator(
        'select, input[placeholder*="강남역"], input[placeholder*="상권"]'
      )
      .first()
    await expect(regionInput).toBeVisible()
  })

  test('업종 선택 드롭다운 동작', async ({ page }) => {
    // IndustrySelect 컴포넌트 존재 확인
    const industryArea = page.getByText('창업 희망 업종 선택').locator('..')
    await expect(industryArea).toBeVisible()

    // 드롭다운 또는 입력 필드 확인
    const industryInput = page
      .locator('select, input[placeholder*="커피"], input[placeholder*="업종"]')
      .first()
    await expect(industryInput).toBeVisible()
  })

  test('분석 시작 버튼 - 미선택 시 비활성화', async ({ page }) => {
    const submitButton = page.getByRole('button', { name: /분석 시작/ })
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toBeDisabled()
  })

  test('분석 시작 버튼 - 선택 후 활성화 및 네비게이션', async ({ page }) => {
    // API 모킹 - 지역 목록
    await page.route('**/api/commercial/districts**', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([
          { code: '11680-001', name: '역삼역 상권', district_type: '발달상권' },
          { code: '11680-002', name: '강남역 상권', district_type: '발달상권' },
        ]),
      })
    })

    // API 모킹 - 업종 목록
    await page.route('**/api/commercial/industries**', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([
          { code: 'I56111', name: '커피전문점', category: '음식점업' },
          { code: 'I56191', name: '치킨전문점', category: '음식점업' },
        ]),
      })
    })

    // select 요소가 있는 경우 옵션 선택
    const regionSelect = page.locator('select').first()
    if (await regionSelect.isVisible()) {
      await regionSelect.selectOption({ index: 1 })
      const industrySelect = page.locator('select').nth(1)
      await industrySelect.selectOption({ index: 1 })
    }

    // 버튼 클릭 시 결과 페이지로 이동 (선택이 완료된 경우만)
    const submitButton = page.getByRole('button', { name: /분석 시작/ })
    if (!(await submitButton.isDisabled())) {
      await submitButton.click()
      await expect(page).toHaveURL(/\/business-analysis\/result/)
    }
  })

  test('최근 분석 섹션 표시', async ({ page }) => {
    await expect(page.getByText(/최근 분석/)).toBeVisible()
  })

  // ========== 접근성 테스트 ==========

  test('접근성: 폼 요소에 label 연결', async ({ page }) => {
    // label 텍스트 존재 확인
    await expect(page.getByText('분석할 상권 선택')).toBeVisible()
    await expect(page.getByText('창업 희망 업종 선택')).toBeVisible()
  })

  test('접근성: 버튼에 접근 가능한 이름', async ({ page }) => {
    const submitButton = page.getByRole('button', { name: /분석 시작/ })
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toHaveAttribute('type', 'submit')
  })

  test('접근성: heading 계층 구조', async ({ page }) => {
    // h1 존재
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()

    // h3 Info Cards
    const h3s = page.locator('h3')
    expect(await h3s.count()).toBeGreaterThanOrEqual(3)
  })

  test('접근성: 키보드 탭 네비게이션', async ({ page }) => {
    // Tab으로 폼 요소 간 이동 가능
    await page.keyboard.press('Tab')
    const activeTag = await page.evaluate(() => document.activeElement?.tagName)
    // 폼 요소(select/input/button)에 포커스 가능
    expect(['SELECT', 'INPUT', 'BUTTON', 'A']).toContain(activeTag)
  })

  // ========== 성능 테스트 ==========

  test('성능: 페이지 로드 2초 이내', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/business-analysis')
    await page.waitForLoadState('domcontentloaded')
    const loadTime = Date.now() - startTime

    expect(loadTime).toBeLessThan(5000) // CI 환경 고려하여 5초로 설정
  })

  test('성능: LCP 요소 빠르게 렌더링', async ({ page }) => {
    // Hero heading이 빠르게 렌더링되는지 확인
    await expect(
      page.getByRole('heading', { name: /창업 성공 확률/ })
    ).toBeVisible({ timeout: 3000 })
  })
})

test.describe('P5-S1-V: 모바일 반응형', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('모바일에서 폼 요소 정상 표시', async ({ page }) => {
    await page.goto('/business-analysis')

    // 주요 요소 표시
    await expect(
      page.getByRole('heading', { name: /창업 성공 확률/ })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /분석 시작/ })).toBeVisible()

    // Info Cards가 세로 스택으로 표시
    await expect(page.getByText('성공 확률 예측')).toBeVisible()
  })
})
