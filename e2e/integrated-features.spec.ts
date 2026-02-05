import { test, expect } from '@playwright/test'

test.describe('통합 기능', () => {
  // 테스트용 샘플 데이터
  const samplePropertyId = '123e4567-e89b-12d3-a456-426614174000'
  const sampleUserId = 'test-user-123'

  test.describe('통합 대시보드', () => {
    test('통합 대시보드 로드 및 모든 섹션 표시', async ({ page }) => {
      // API 모킹 (필요시)
      await page.route('**/api/integrated/analysis**', async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            property_analysis: {
              property_id: samplePropertyId,
              property_name: '테스트 아파트',
              address: '서울특별시 강남구',
              investment_score: 85,
              roi_1year: 5.2,
              roi_3year: 18.5,
              jeonse_ratio: 68.5,
              liquidity_score: 78,
            },
            nearby_districts: [
              {
                code: '11680-001',
                name: '역삼역 상권',
                distance_km: 0.3,
                success_probability: 75.5,
                avg_monthly_sales: 15000000,
                foot_traffic_score: 88,
              },
            ],
            convenience: {
              total_score: 82.5,
              transport_score: 90,
              commercial_score: 85,
              education_score: 75,
              medical_score: 80,
              amenities_count: 5,
            },
            integrated_score: {
              total_score: 83.5,
              apartment_weight: 0.6,
              convenience_weight: 0.4,
              rating: 'excellent',
              recommendation: '매우 우수한 투자처입니다.',
            },
            analyzed_at: new Date().toISOString(),
          }),
        })
      })

      // 통합 대시보드 페이지로 이동 (실제 경로에 맞게 조정)
      await page.goto(`/property/${samplePropertyId}?tab=integrated`)

      // 통합 투자 점수 섹션 확인
      await expect(page.getByText(/통합 투자 점수/)).toBeVisible({
        timeout: 10000,
      })

      // 아파트 투자 분석 섹션 확인
      await expect(page.getByText(/아파트 투자 분석/)).toBeVisible()

      // 생활 편의성 분석 섹션 확인
      await expect(page.getByText(/생활 편의성 분석/)).toBeVisible()

      // 근처 상권 정보 섹션 확인
      await expect(page.getByText(/근처 상권 정보/)).toBeVisible()
    })

    test('통합 점수 등급 표시 확인', async ({ page }) => {
      await page.route('**/api/integrated/analysis**', async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            integrated_score: {
              total_score: 85,
              rating: 'excellent',
              recommendation: '매우 우수한 투자처입니다.',
            },
          }),
        })
      })

      await page.goto(`/property/${samplePropertyId}?tab=integrated`)

      // 점수 표시 확인
      await expect(page.getByText(/85/)).toBeVisible({ timeout: 10000 })

      // 등급 라벨 확인
      await expect(page.getByText(/매우 우수/)).toBeVisible()
    })
  })

  test.describe('알림 센터', () => {
    test('알림 센터 로드 및 필터링', async ({ page }) => {
      // API 모킹
      await page.route('**/api/integrated/alerts/**', async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify([
            {
              alert_id: '1',
              alert_type: 'price_change',
              title: '가격 변동 알림',
              message: '매물 가격이 5% 상승했습니다.',
              severity: 'warning',
              data: { change_percent: 5 },
              created_at: new Date().toISOString(),
            },
            {
              alert_id: '2',
              alert_type: 'district_growth',
              title: '상권 성장 알림',
              message: '상권이 10% 성장했습니다.',
              severity: 'info',
              data: { growth_rate: 10 },
              created_at: new Date().toISOString(),
            },
            {
              alert_id: '3',
              alert_type: 'opportunity',
              title: '투자 기회 알림',
              message: '투자 기회가 발생했습니다.',
              severity: 'critical',
              data: {},
              created_at: new Date().toISOString(),
            },
          ]),
        })
      })

      // 알림 센터 페이지로 이동
      await page.goto('/notifications')

      // 알림 센터 헤더 확인
      await expect(
        page.getByRole('heading', { name: /알림 센터/ })
      ).toBeVisible({
        timeout: 10000,
      })

      // 전체 알림 개수 확인
      await expect(page.getByText(/전체.*3/)).toBeVisible()

      // 가격 변동 필터 클릭
      await page.getByRole('button', { name: /가격 변동/ }).click()

      // 필터링된 알림만 표시 확인
      await expect(page.getByText(/가격 변동 알림/)).toBeVisible()

      // 상권 성장 알림은 보이지 않아야 함
      await expect(page.getByText(/상권 성장 알림/)).not.toBeVisible()
    })

    test('알림 새로고침 기능', async ({ page }) => {
      let callCount = 0

      await page.route('**/api/integrated/alerts/**', async (route) => {
        callCount++
        await route.fulfill({
          status: 200,
          body: JSON.stringify([
            {
              alert_id: callCount.toString(),
              alert_type: 'price_change',
              title: `알림 ${callCount}`,
              message: '테스트 알림',
              severity: 'info',
              data: {},
              created_at: new Date().toISOString(),
            },
          ]),
        })
      })

      await page.goto('/notifications')

      // 첫 번째 로드
      await expect(page.getByText(/알림 1/)).toBeVisible({ timeout: 10000 })

      // 새로고침 버튼 클릭
      await page.getByRole('button', { name: /새로고침/ }).click()

      // 두 번째 로드 확인
      await expect(page.getByText(/알림 2/)).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('리포트 생성', () => {
    test('리포트 생성 폼 및 섹션 선택', async ({ page }) => {
      // API 모킹
      await page.route('**/api/integrated/reports/generate', async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            report_id: 'test-report-123',
            property_id: samplePropertyId,
            status: 'completed',
            download_url: 'https://example.com/download/test-report-123.pdf',
            share_url: 'https://example.com/reports/test-report-123',
            expires_at: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
            created_at: new Date().toISOString(),
          }),
        })
      })

      // 리포트 생성 페이지로 이동
      await page.goto(`/property/${samplePropertyId}/report`)

      // 섹션 선택 체크박스 확인
      await expect(page.getByText(/아파트 분석/)).toBeVisible()
      await expect(page.getByText(/상권 분석/)).toBeVisible()
      await expect(page.getByText(/통합 분석/)).toBeVisible()
      await expect(page.getByText(/리스크 분석/)).toBeVisible()

      // 리포트 생성 버튼 클릭
      await page.getByRole('button', { name: /PDF 리포트 생성/ }).click()

      // 생성 완료 메시지 확인
      await expect(page.getByText(/리포트가 생성되었습니다/)).toBeVisible({
        timeout: 10000,
      })

      // 다운로드 버튼 확인
      await expect(page.getByRole('button', { name: /다운로드/ })).toBeVisible()
    })
  })
})
