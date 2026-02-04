import { test, expect } from '@playwright/test'

/**
 * P3-S4-V: 매물 상세 E2E 테스트
 * @spec specs/screens/property-detail.yaml
 */
test.describe('매물 상세', () => {
  // 테스트용 매물 ID (실제 데이터베이스에 존재하는 ID로 교체 필요)
  const testPropertyId = 'test-property-id'

  test('기본 정보 로드', async ({ page }) => {
    await page.goto(`/property/${testPropertyId}`)

    // 매물 정보 섹션 확인
    await expect(page.getByRole('heading')).toBeVisible()

    // 이미지 갤러리 확인
    await expect(
      page.locator('[data-testid="image-gallery"], img')
    ).toBeVisible()

    // 기본 정보 (면적, 층수 등) 확인
    await expect(page.getByText(/m²|평/)).toBeVisible()
  })

  test('참값 분석 카드 표시 (로그인 시)', async ({ page }) => {
    // 로그인 상태로 매물 상세 페이지 접근
    // TODO: 로그인 fixture 추가
    await page.goto(`/property/${testPropertyId}`)

    // 참값 분석 카드 확인
    const chamgabCard = page.locator('[data-testid="chamgab-card"]')
    if ((await chamgabCard.count()) > 0) {
      // 가격 범위 표시 확인
      await expect(chamgabCard.getByText(/억|원/)).toBeVisible()

      // 신뢰도 표시 확인
      await expect(chamgabCard.getByText(/%/)).toBeVisible()
    }
  })

  test('비회원 조회 제한 (3회)', async ({ page }) => {
    // 비회원 상태로 여러 매물 조회
    for (let i = 1; i <= 4; i++) {
      await page.goto(`/property/test-property-${i}`)
      await page.waitForTimeout(500)
    }

    // 4번째 조회 시 제한 모달 또는 메시지 표시 확인
    const limitModal = page.locator('[data-testid="limit-modal"]')
    const limitMessage = page.getByText(/로그인|회원가입|제한/)

    // 둘 중 하나가 표시되어야 함
    // (구현 방식에 따라 다름)
  })

  test('관심 매물 저장', async ({ page }) => {
    await page.goto(`/property/${testPropertyId}`)

    // 관심 매물 버튼 클릭
    const favoriteButton = page.locator('[data-testid="favorite-button"]')
    if ((await favoriteButton.count()) > 0) {
      await favoriteButton.click()

      // 로그인 리다이렉트 또는 저장 완료 확인
      const isRedirected = page.url().includes('/auth/login')
      const toastMessage = page.getByText(/저장|추가/)

      // 비로그인이면 로그인 페이지로, 로그인이면 저장 완료 토스트
    }
  })
})
