import { NextResponse } from 'next/server'

export function GET(request: Request) {
  return NextResponse.redirect(new URL('/auth/login?error=네이버 로그인을 사용할 수 없습니다. 이메일 로그인을 이용해주세요.', request.url))
}
