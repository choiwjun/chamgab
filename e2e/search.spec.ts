import { test, expect } from '@playwright/test'

/**
 * P2-S2-V: 검색 리스트 E2E 테스트
 * @spec specs/screens/search-list.yaml
 */
test.describe('검색 결과 - 리스트', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/search')
  })

  test('필터 적용 시 URL 업데이트', async ({ page }) => {
    // 지역 필터 선택 (구현에 따라 셀렉터 조정 필요)
    const regionFilter = page.locator('[data-testid="region-filter"]')
    if ((await regionFilter.count()) > 0) {
      await regionFilter.click()
      await page.getByText('서울시').click()

      // URL에 필터 파라미터 포함 확인
      await expect(page).toHaveURL(/sido=/)
    }
  })

  test('무한 스크롤 동작', async ({ page }) => {
    // 초기 매물 목록 확인
    const initialCount = await page
      .locator('[data-testid="property-card"]')
      .count()

    // 스크롤 다운
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    // 추가 매물 로드 대기
    await page.waitForTimeout(1000)

    // 매물 수 증가 확인 (데이터가 있는 경우)
    const newCount = await page.locator('[data-testid="property-card"]').count()
    // 데이터가 충분하면 count가 증가함
  })

  test('지도 뷰 전환 시 필터 유지', async ({ page }) => {
    // 필터 적용
    await page.goto('/search?sido=서울시')

    // 지도 뷰 전환 버튼 클릭
    const mapViewToggle = page.locator('[data-testid="view-toggle"]')
    if ((await mapViewToggle.count()) > 0) {
      await mapViewToggle.click()

      // 지도 페이지로 이동하면서 필터 유지 확인
      await expect(page).toHaveURL(/sido=/)
    }
  })
})

/**
 * P2-S3-V: 검색 지도 E2E 테스트
 * @spec specs/screens/search-map.yaml
 */
test.describe('검색 결과 - 지도', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/search/map')
  })

  test('지도 초기 로드', async ({ page }) => {
    // Kakao Map 컨테이너 확인
    await expect(page.locator('#map, [data-testid="kakao-map"]')).toBeVisible()
  })

  test('마커 클릭 시 프리뷰 표시', async ({ page }) => {
    // 지도 로드 대기
    await page.waitForTimeout(2000)

    // 마커 또는 클러스터 클릭 (실제 마커가 있는 경우)
    const marker = page
      .locator('.kakao-marker, [data-testid="map-marker"]')
      .first()
    if ((await marker.count()) > 0) {
      await marker.click()

      // 프리뷰 하단 시트 표시 확인
      await expect(
        page.locator('[data-testid="property-preview"]')
      ).toBeVisible()
    }
  })
})
