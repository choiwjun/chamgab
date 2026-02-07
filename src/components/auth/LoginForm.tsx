'use client'

// @TASK P3-S5-T2 - 로그인 폼 컴포넌트
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'

// 로그인 스키마
const loginSchema = z.object({
  email: z.string().email('올바른 이메일 주소를 입력해주세요.'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
})

type LoginFormData = z.infer<typeof loginSchema>

interface LoginFormProps {
  redirectUrl?: string
}

export function LoginForm({ redirectUrl = '/' }: LoginFormProps) {
  const router = useRouter()
  const { setUser } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // 이메일 로그인
  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        })

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.')
        } else {
          setError(authError.message)
        }
        return
      }

      if (authData.user) {
        setUser(authData.user)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(redirectUrl as any)
        router.refresh()
      }
    } catch {
      setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  // 소셜 로그인
  const handleSocialLogin = async (provider: 'google' | 'kakao' | 'naver') => {
    setSocialLoading(provider)
    setError(null)

    try {
      // 네이버는 Supabase 미지원으로 직접 구현한 API 사용
      if (provider === 'naver') {
        window.location.href = `/api/auth/naver?redirect=${encodeURIComponent(redirectUrl)}`
        return
      }

      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectUrl)}`,
        },
      })

      if (authError) {
        setError(authError.message)
        setSocialLoading(null)
      }
    } catch {
      setError('소셜 로그인 중 오류가 발생했습니다.')
      setSocialLoading(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* 소셜 로그인 버튼 */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => handleSocialLogin('google')}
          disabled={!!socialLoading}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3.5 text-sm text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {socialLoading === 'google' ? (
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          Google로 계속하기
        </button>

        <button
          type="button"
          onClick={() => handleSocialLogin('kakao')}
          disabled={!!socialLoading}
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#FEE500] px-4 py-3.5 text-sm text-[#191919] transition-colors hover:bg-[#FDD800] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {socialLoading === 'kakao' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#191919"
                d="M12 3c-5.52 0-10 3.59-10 8 0 2.86 1.9 5.38 4.76 6.8-.21.76-.77 2.76-.88 3.19-.14.54.2.53.42.39.17-.11 2.7-1.84 3.79-2.57.61.08 1.25.13 1.91.13 5.52 0 10-3.59 10-8s-4.48-8-10-8z"
              />
            </svg>
          )}
          카카오로 계속하기
        </button>

        <button
          type="button"
          onClick={() => handleSocialLogin('naver')}
          disabled={!!socialLoading}
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#03C75A] px-4 py-3.5 text-sm text-white transition-colors hover:bg-[#02B350] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {socialLoading === 'naver' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="white"
                d="M16.27 12.53L7.47 3H3v18h4.73v-9.53L16.53 21H21V3h-4.73v9.53z"
              />
            </svg>
          )}
          네이버로 계속하기
        </button>
      </div>

      {/* 구분선 */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-4 text-sm text-gray-500">또는</span>
        </div>
      </div>

      {/* 이메일 로그인 폼 */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            이메일
          </label>
          <input
            {...register('email')}
            type="email"
            id="email"
            placeholder="email@example.com"
            className="block w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.email && (
            <p className="mt-2 text-xs text-red-500">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            비밀번호
          </label>
          <div className="relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              id="password"
              placeholder="비밀번호 입력"
              className="block w-full rounded-lg border border-gray-200 bg-white px-4 py-3 pr-12 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-2 text-xs text-red-500">
              {errors.password.message}
            </p>
          )}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* 로그인 버튼 */}
        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center rounded-lg bg-blue-500 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              로그인 중...
            </>
          ) : (
            '로그인'
          )}
        </button>
      </form>

      {/* 비밀번호 찾기 링크 */}
      <div className="text-center">
        <a
          href="/auth/forgot-password"
          className="text-sm text-blue-500 transition-colors hover:text-blue-600"
        >
          비밀번호를 잊으셨나요?
        </a>
      </div>
    </div>
  )
}
