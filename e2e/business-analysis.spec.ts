import { test, expect } from '@playwright/test'

test.describe('상권 분석', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/business-analysis')
  })

  test('상권 분석 메인 페이지 로드', async ({ page }) => {
    // Hero 섹션 확인
    await expect(
      page.getByRole('heading', { name: /AI 창업 성공 예측/ })
    ).toBeVisible()

    // 지역 선택 드롭다운 확인
    const regionSelect = page.locator('select[name="region"]').first()
    await expect(regionSelect).toBeVisible()

    // 업종 선택 드롭다운 확인
    const industrySelect = page.locator('select[name="industry"]').first()
    await expect(industrySelect).toBeVisible()

    // 분석 시작 버튼 확인
    await expect(page.getByRole('button', { name: /분석 시작/ })).toBeVisible()
  })

  test('상권 분석 플로우: 지역 및 업종 선택 후 분석', async ({ page }) => {
    // 지역 선택
    const regionSelect = page.locator('select[name="region"]').first()
    await regionSelect.selectOption({ index: 1 })

    // 업종 선택
    const industrySelect = page.locator('select[name="industry"]').first()
    await industrySelect.selectOption({ index: 1 })

    // 분석 시작 버튼 클릭
    await page.getByRole('button', { name: /분석 시작/ }).click()

    // 결과 페이지로 이동 확인
    await expect(page).toHaveURL(/\/business-analysis\/result/)

    // 로딩 완료 대기 (최대 10초)
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 성공 확률 카드 확인
    await expect(page.getByText(/성공 확률/)).toBeVisible({ timeout: 15000 })

    // 상권 특성 카드 확인
    await expect(page.getByText(/상권 특성/)).toBeVisible()
  })

  test('상권 분석 결과 페이지 - 모든 섹션 표시', async ({ page }) => {
    // 샘플 쿼리 파라미터로 직접 이동
    await page.goto(
      '/business-analysis/result?district=11680-001&industry=I56111'
    )

    // 로딩 대기
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 주요 섹션들 확인
    const sections = [
      /성공 확률/,
      /시간대별 유동인구/,
      /연령대별 고객/,
      /주말\/평일 비교/,
      /상권 프로필/,
      /경쟁 밀집도/,
      /성장 가능성/,
      /AI 업종 추천/,
    ]

    for (const section of sections) {
      await expect(page.getByText(section)).toBeVisible({ timeout: 15000 })
    }
  })

  test('업종 추천 컴포넌트 동작 확인', async ({ page }) => {
    await page.goto(
      '/business-analysis/result?district=11680-001&industry=I56111'
    )

    // 로딩 대기
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // AI 업종 추천 섹션 스크롤
    const recommendationSection = page.getByText(/AI 업종 추천/)
    await recommendationSection.scrollIntoViewIfNeeded()

    // TOP 5 추천 확인
    await expect(page.getByText(/추천 업종 TOP 5/)).toBeVisible()

    // 매칭 점수 표시 확인
    await expect(page.getByText(/매칭/)).toBeVisible()
  })

  test('공유 버튼 동작 확인', async ({ page }) => {
    await page.goto(
      '/business-analysis/result?district=11680-001&industry=I56111'
    )

    // 공유 버튼 클릭
    const shareButton = page.getByRole('button', { name: /공유/ }).first()
    await shareButton.click()

    // 공유 모달 또는 기능 확인 (실제 구현에 따라 조정)
    // 현재는 버튼 클릭 가능 여부만 확인
    await expect(shareButton).toBeVisible()
  })
})
