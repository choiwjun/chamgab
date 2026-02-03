// @TASK P1-R1-T2 - 이메일 회원가입 API
// @SPEC specs/domain/resources.yaml#users
// @SPEC specs/screens/auth-login.yaml

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { signupSchema } from '@/lib/validations/auth'
import type { AuthErrorResponse, AuthSuccessResponse } from '@/types/auth'

/**
 * POST /api/auth/signup
 * 이메일 회원가입
 *
 * @body {email, password, name}
 * @returns {AuthSuccessResponse | AuthErrorResponse}
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // 입력값 검증 (Layer 1: API 진입점 검증)
    const validationResult = signupSchema.safeParse(body)

    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors[0]?.message || '입력값이 올바르지 않습니다'
      return NextResponse.json<AuthErrorResponse>(
        { error: errorMessage },
        { status: 400 }
      )
    }

    const { email, password, name } = validationResult.data

    // Supabase Auth 회원가입
    const supabase = await createClient()

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    })

    if (error) {
      // 이메일 중복 처리
      if (error.message.includes('already registered')) {
        return NextResponse.json<AuthErrorResponse>(
          { error: '이미 가입된 이메일입니다', code: 'EMAIL_ALREADY_EXISTS' },
          { status: 409 }
        )
      }

      return NextResponse.json<AuthErrorResponse>(
        { error: error.message, code: error.name },
        { status: 400 }
      )
    }

    // 회원가입 성공
    return NextResponse.json<AuthSuccessResponse>(
      {
        message: '회원가입이 완료되었습니다. 이메일을 확인해주세요.',
        user: data.user
          ? {
              id: data.user.id,
              email: data.user.email || '',
              name,
            }
          : undefined,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json<AuthErrorResponse>(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
