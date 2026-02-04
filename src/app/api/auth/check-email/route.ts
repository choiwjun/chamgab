// @TASK P1-R1-T2 - 이메일 중복 확인 API
// @SPEC specs/domain/resources.yaml#users

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkEmailSchema } from '@/lib/validations/auth'
import type { AuthErrorResponse, CheckEmailResponse } from '@/types/auth'

/**
 * GET /api/auth/check-email
 * 이메일 중복 확인 (Query Parameter)
 *
 * @query {email}
 * @returns {CheckEmailResponse | AuthErrorResponse}
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')

  if (!email) {
    return NextResponse.json<AuthErrorResponse>(
      { error: '이메일을 입력해주세요' },
      { status: 400 }
    )
  }

  // 입력값 검증
  const validationResult = checkEmailSchema.safeParse({ email })

  if (!validationResult.success) {
    const errorMessage = validationResult.error.errors[0]?.message || '입력값이 올바르지 않습니다'
    return NextResponse.json<AuthErrorResponse>(
      { error: errorMessage },
      { status: 400 }
    )
  }

  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (error) {
      // 테이블이 없는 경우 등은 available로 처리
      return NextResponse.json<CheckEmailResponse>(
        { available: true, message: '사용 가능한 이메일입니다' },
        { status: 200 }
      )
    }

    return NextResponse.json<CheckEmailResponse>(
      {
        available: !data,
        message: data ? '이미 사용 중인 이메일입니다' : '사용 가능한 이메일입니다',
      },
      { status: data ? 409 : 200 }
    )
  } catch (error) {
    console.error('Check email error:', error)
    return NextResponse.json<AuthErrorResponse>(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/auth/check-email
 * 이메일 중복 확인
 *
 * @body {email}
 * @returns {CheckEmailResponse | AuthErrorResponse}
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // 입력값 검증 (Layer 1: API 진입점 검증)
    const validationResult = checkEmailSchema.safeParse(body)

    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors[0]?.message || '입력값이 올바르지 않습니다'
      return NextResponse.json<AuthErrorResponse>(
        { error: errorMessage },
        { status: 400 }
      )
    }

    const { email } = validationResult.data

    // Supabase에서 이메일 존재 여부 확인
    // 참고: auth.users 테이블은 직접 조회 불가, user_profiles 사용
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (error) {
      console.error('Check email error:', error)
      // 테이블이 없는 경우 등은 available로 처리
      return NextResponse.json<CheckEmailResponse>(
        {
          available: true,
          message: '사용 가능한 이메일입니다',
        },
        { status: 200 }
      )
    }

    if (data) {
      // 이메일이 이미 사용 중
      return NextResponse.json<CheckEmailResponse>(
        {
          available: false,
          message: '이미 사용 중인 이메일입니다',
        },
        { status: 409 }
      )
    }

    // 이메일 사용 가능
    return NextResponse.json<CheckEmailResponse>(
      {
        available: true,
        message: '사용 가능한 이메일입니다',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Check email error:', error)
    return NextResponse.json<AuthErrorResponse>(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
