// @TASK P1-R1-T2 - 이메일 로그인 API
// @SPEC specs/domain/resources.yaml#users
// @SPEC specs/screens/auth-login.yaml

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/validations/auth'
import type { AuthErrorResponse, AuthSuccessResponse } from '@/types/auth'

/**
 * POST /api/auth/login
 * 이메일 로그인
 *
 * @body {email, password}
 * @returns {AuthSuccessResponse | AuthErrorResponse}
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // 입력값 검증 (Layer 1: API 진입점 검증)
    const validationResult = loginSchema.safeParse(body)

    if (!validationResult.success) {
      const errorMessage =
        validationResult.error.errors[0]?.message ||
        '입력값이 올바르지 않습니다'
      return NextResponse.json<AuthErrorResponse>(
        { error: errorMessage },
        { status: 400 }
      )
    }

    const { email, password } = validationResult.data

    // Supabase Auth 로그인
    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      // 인증 실패 (잘못된 이메일/비밀번호)
      if (error.message.includes('Invalid login credentials')) {
        return NextResponse.json<AuthErrorResponse>(
          {
            error: '이메일 또는 비밀번호가 올바르지 않습니다',
            code: 'INVALID_CREDENTIALS',
          },
          { status: 401 }
        )
      }

      // 이메일 미인증
      if (error.message.includes('Email not confirmed')) {
        return NextResponse.json<AuthErrorResponse>(
          { error: '이메일 인증이 필요합니다', code: 'EMAIL_NOT_CONFIRMED' },
          { status: 403 }
        )
      }

      return NextResponse.json<AuthErrorResponse>(
        { error: error.message, code: error.name },
        { status: 400 }
      )
    }

    // 로그인 성공
    return NextResponse.json<AuthSuccessResponse>(
      {
        message: '로그인 성공',
        user: data.user
          ? {
              id: data.user.id,
              email: data.user.email || '',
              name: data.user.user_metadata?.name || '',
            }
          : undefined,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json<AuthErrorResponse>(
      { error: '로그인 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
