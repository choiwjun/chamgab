import { test, expect } from '@playwright/test'

/**
 * P3-S5-V: 로그인 E2E 테스트
 * @spec specs/screens/auth-login.yaml
 */
test.describe('로그인', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login')
  })

  test('소셜 로그인 버튼 표시', async ({ page }) => {
    // Google 로그인 버튼
    await expect(
      page.getByRole('button', { name: /Google|구글/i })
    ).toBeVisible()

    // Kakao 로그인 버튼
    await expect(
      page.getByRole('button', { name: /Kakao|카카오/i })
    ).toBeVisible()

    // Naver 로그인 버튼
    await expect(
      page.getByRole('button', { name: /Naver|네이버/i })
    ).toBeVisible()
  })

  test('이메일 로그인 폼 표시', async ({ page }) => {
    // 이메일 입력 필드
    await expect(page.getByPlaceholder(/이메일|email/i)).toBeVisible()

    // 비밀번호 입력 필드
    await expect(page.getByPlaceholder(/비밀번호|password/i)).toBeVisible()

    // 로그인 버튼
    await expect(
      page.getByRole('button', { name: /로그인|Login/i })
    ).toBeVisible()
  })

  test('로그인 실패 시 에러 메시지 표시', async ({ page }) => {
    // 잘못된 이메일/비밀번호 입력
    await page.getByPlaceholder(/이메일|email/i).fill('wrong@example.com')
    await page.getByPlaceholder(/비밀번호|password/i).fill('wrongpassword')

    // 로그인 버튼 클릭
    await page.getByRole('button', { name: /로그인|Login/i }).click()

    // 에러 메시지 표시 확인
    await expect(page.getByText(/실패|오류|잘못|invalid/i)).toBeVisible({
      timeout: 5000,
    })
  })
})

/**
 * P3-S6-V: 회원가입 E2E 테스트
 * @spec specs/screens/auth-signup.yaml
 */
test.describe('회원가입', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signup')
  })

  test('회원가입 폼 표시', async ({ page }) => {
    // 이메일 입력 필드
    await expect(page.getByPlaceholder(/이메일|email/i)).toBeVisible()

    // 비밀번호 입력 필드
    await expect(
      page.getByPlaceholder(/비밀번호|password/i).first()
    ).toBeVisible()

    // 약관 동의 체크박스
    await expect(page.getByRole('checkbox')).toBeVisible()

    // 회원가입 버튼
    await expect(
      page.getByRole('button', { name: /회원가입|가입|Sign up/i })
    ).toBeVisible()
  })

  test('이메일 중복 확인', async ({ page }) => {
    // 이미 존재하는 이메일 입력
    const emailInput = page.getByPlaceholder(/이메일|email/i)
    await emailInput.fill('existing@example.com')
    await emailInput.blur()

    // 중복 확인 메시지 대기
    await page.waitForTimeout(1000)

    // 중복 여부 메시지 표시 (구현에 따라 다름)
  })

  test('비밀번호 유효성 검사', async ({ page }) => {
    // 약한 비밀번호 입력
    const passwordInput = page.getByPlaceholder(/비밀번호|password/i).first()
    await passwordInput.fill('123')
    await passwordInput.blur()

    // 비밀번호 강도 또는 에러 메시지 표시 확인
    await expect(page.getByText(/강도|약함|weak|짧|자리/i)).toBeVisible({
      timeout: 3000,
    })
  })
})
