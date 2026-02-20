// @TASK P1-R1 - 네이버 OAuth 콜백 라우트
// 네이버 인증 완료 후 Supabase 세션 생성

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface NaverTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  error?: string
  error_description?: string
}

interface NaverUserResponse {
  resultcode: string
  message: string
  response: {
    id: string
    email?: string
    name?: string
    nickname?: string
    profile_image?: string
  }
}

/**
 * GET /api/auth/naver/callback
 * 네이버 OAuth 콜백 처리
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // 에러 처리
  if (error) {
    console.error('Naver OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent('인증 코드가 없습니다.')}`
    )
  }

  // state에서 redirect URL 추출 (Open Redirect 방지)
  let redirect = '/'
  if (state) {
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
      const raw = stateData.redirect || '/'
      // 내부 경로만 허용 (프로토콜 상대 URL, 외부 URL 차단)
      redirect =
        typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')
          ? raw
          : '/'
    } catch {
      // state 파싱 실패 시 기본값 사용
    }
  }

  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!clientId || !clientSecret) {
    console.error('Naver OAuth credentials not configured')
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent('네이버 로그인 설정 오류')}`
    )
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase service role key not configured')
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent('서버 설정 오류')}`
    )
  }

  try {
    // 1. 코드로 액세스 토큰 교환
    const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token')
    tokenUrl.searchParams.set('grant_type', 'authorization_code')
    tokenUrl.searchParams.set('client_id', clientId)
    tokenUrl.searchParams.set('client_secret', clientSecret)
    tokenUrl.searchParams.set('code', code)
    tokenUrl.searchParams.set('state', state || '')

    const tokenResponse = await fetch(tokenUrl.toString())
    const tokenData: NaverTokenResponse = await tokenResponse.json()

    if (tokenData.error) {
      console.error(
        'Naver token error:',
        tokenData.error,
        tokenData.error_description
      )
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent(tokenData.error_description || '토큰 발급 실패')}`
      )
    }

    // 2. 사용자 정보 가져오기
    const userResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })
    const userData: NaverUserResponse = await userResponse.json()

    if (userData.resultcode !== '00') {
      console.error('Naver user info error:', userData.message)
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent('사용자 정보 조회 실패')}`
      )
    }

    const naverUser = userData.response
    const email = naverUser.email

    if (!email) {
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent('이메일 정보가 필요합니다. 네이버 계정 설정에서 이메일 제공을 허용해주세요.')}`
      )
    }

    // 3. Supabase Admin API로 사용자 생성/조회
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    let userId: string

    // Fast-path: lookup by email in user_profiles first (avoids listUsers O(n)).
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingProfile?.id) {
      userId = existingProfile.id

      // Load auth user to merge metadata safely.
      const { data: authUser } =
        await supabaseAdmin.auth.admin.getUserById(userId)
      const existingMeta = authUser?.user?.user_metadata || {}

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingMeta,
          naver_id: naverUser.id,
          name: naverUser.name || naverUser.nickname || existingMeta?.name,
          avatar_url: naverUser.profile_image || existingMeta?.avatar_url,
          provider: 'naver',
        },
      })
    } else {
      // Create new user (will also create user_profiles via trigger in most cases).
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            naver_id: naverUser.id,
            name: naverUser.name || naverUser.nickname,
            avatar_url: naverUser.profile_image,
            provider: 'naver',
          },
        })

      if (createError || !newUser.user) {
        // Rare fallback: user exists but profile missing; fall back to listUsers once.
        const msg = (createError?.message || '').toLowerCase()
        if (msg.includes('already') || msg.includes('exists')) {
          const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers()
          const found = usersPage?.users?.find((u) => u.email === email)
          if (found?.id) {
            userId = found.id
          } else {
            console.error('Failed to resolve existing user by email')
            return NextResponse.redirect(
              `${origin}/auth/login?error=${encodeURIComponent('사용자 조회 실패')}`
            )
          }
        } else {
          console.error('Failed to create user:', createError)
          return NextResponse.redirect(
            `${origin}/auth/login?error=${encodeURIComponent('사용자 생성 실패')}`
          )
        }
      } else {
        userId = newUser.user.id
      }
    }

    // Suspended user gate (banned accounts cannot proceed)
    try {
      const { data: prof } = await supabaseAdmin
        .from('user_profiles')
        .select('is_suspended,suspended_until')
        .eq('id', userId)
        .maybeSingle()
      const suspended = !!prof?.is_suspended
      const until = prof?.suspended_until
        ? new Date(prof.suspended_until)
        : null
      const activeSuspension =
        suspended &&
        (!until ||
          (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()))
      if (activeSuspension) {
        return NextResponse.redirect(
          `${origin}/auth/login?error=${encodeURIComponent('정지된 계정입니다. 관리자에게 문의해주세요.')}`
        )
      }
    } catch {
      // ignore
    }

    // 4. 세션 생성 (magic link 방식 사용)
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${origin}${redirect}`,
        },
      })

    if (linkError || !linkData.properties?.hashed_token) {
      console.error('Failed to generate link:', linkError)
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent('세션 생성 실패')}`
      )
    }

    // 5. 토큰으로 세션 교환
    const supabase = await createServerClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    })

    if (verifyError) {
      console.error('Failed to verify OTP:', verifyError)
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent('로그인 실패')}`
      )
    }

    // 성공 - 리다이렉트
    return NextResponse.redirect(`${origin}${redirect}`)
  } catch (err) {
    console.error('Naver callback error:', err)
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent('네이버 로그인 처리 중 오류가 발생했습니다.')}`
    )
  }
}
