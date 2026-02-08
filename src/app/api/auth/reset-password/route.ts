import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/auth/reset-password
 * 비밀번호 재설정 이메일 발송
 *
 * @body {email: string}
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: '이메일 주소를 입력해주세요.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${new URL(request.url).origin}/auth/login`,
    })

    if (error) {
      console.error('Password reset error:', error)
      // 보안상 이메일 존재 여부를 노출하지 않음
      return NextResponse.json(
        { message: '등록된 이메일이라면 재설정 링크가 발송됩니다.' },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { message: '비밀번호 재설정 링크가 이메일로 발송되었습니다.' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Reset password error:', error)
    return NextResponse.json(
      { error: '요청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
