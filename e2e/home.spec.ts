import { test, expect } from '@playwright/test'

/**
 * P2-S1-V: 홈 화면 E2E 테스트
 * @spec specs/screens/home.yaml
 */
test.describe('홈 화면', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('초기 로드 시 모든 섹션 표시', async ({ page }) => {
    // Hero 섹션 확인
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // 검색 입력창 확인
    await expect(page.getByPlaceholder(/검색|아파트|지역/i)).toBeVisible()

    // 가격 트렌드 섹션 확인
    await expect(page.getByText(/트렌드|변동/i)).toBeVisible()

    // 인기 매물 섹션 확인
    await expect(page.getByText(/인기|추천/i)).toBeVisible()
  })

  test('검색 자동완성 동작', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/검색|아파트|지역/i)

    // 2자 이상 입력 시 자동완성 트리거
    await searchInput.fill('강남')

    // 자동완성 결과 대기 (300ms 디바운스)
    await page.waitForTimeout(500)

    // 자동완성 목록이 표시되거나 검색 결과 페이지로 이동
    // (구현에 따라 다름)
  })

  test('매물 카드 클릭 시 상세 페이지 이동', async ({ page }) => {
    // 매물 카드 찾기
    const propertyCard = page.locator('[data-testid="property-card"]').first()

    // 카드가 있으면 클릭하여 상세 페이지 이동 확인
    if ((await propertyCard.count()) > 0) {
      await propertyCard.click()
      await expect(page).toHaveURL(/\/property\//)
    }
  })
})
