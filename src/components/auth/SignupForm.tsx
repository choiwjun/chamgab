'use client'

// @TASK P3-S6-T2 - 회원가입 폼 컴포넌트
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, Check, X, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// 회원가입 스키마
const signupSchema = z
  .object({
    email: z.string().email('올바른 이메일 주소를 입력해주세요.'),
    password: z
      .string()
      .min(8, '비밀번호는 8자 이상이어야 합니다.')
      .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, '영문과 숫자를 포함해야 합니다.'),
    passwordConfirm: z.string(),
    agreeService: z.boolean().refine((val) => val === true, {
      message: '서비스 이용약관에 동의해주세요.',
    }),
    agreePrivacy: z.boolean().refine((val) => val === true, {
      message: '개인정보 처리방침에 동의해주세요.',
    }),
    agreeMarketing: z.boolean().optional(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: '비밀번호가 일치하지 않습니다.',
    path: ['passwordConfirm'],
  })

type SignupFormData = z.infer<typeof signupSchema>

export function SignupForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<string | null>(null)
  const [emailChecking, setEmailChecking] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      agreeService: false,
      agreePrivacy: false,
      agreeMarketing: false,
    },
  })

  const password = watch('password')
  const agreeService = watch('agreeService')
  const agreePrivacy = watch('agreePrivacy')
  const agreeMarketing = watch('agreeMarketing')

  // 비밀번호 강도 계산
  const getPasswordStrength = (pwd: string | undefined) => {
    if (!pwd) return { score: 0, label: '', color: '' }
    let score = 0
    if (pwd.length >= 8) score++
    if (pwd.length >= 12) score++
    if (/[A-Z]/.test(pwd)) score++
    if (/[a-z]/.test(pwd)) score++
    if (/\d/.test(pwd)) score++
    if (/[^A-Za-z0-9]/.test(pwd)) score++

    if (score <= 2) return { score, label: '약함', color: 'bg-red-500' }
    if (score <= 4) return { score, label: '보통', color: 'bg-yellow-500' }
    return { score, label: '강함', color: 'bg-green-500' }
  }

  const passwordStrength = getPasswordStrength(password)

  // 이메일 중복 확인
  const checkEmailAvailability = useCallback(async (email: string) => {
    if (!email || !email.includes('@')) {
      setEmailAvailable(null)
      return
    }

    setEmailChecking(true)
    try {
      const res = await fetch(
        `/api/auth/check-email?email=${encodeURIComponent(email)}`
      )
      const data = await res.json()
      setEmailAvailable(data.available)
    } catch {
      setEmailAvailable(null)
    } finally {
      setEmailChecking(false)
    }
  }, [])

  // 전체 동의
  const handleAgreeAll = (checked: boolean) => {
    setValue('agreeService', checked)
    setValue('agreePrivacy', checked)
    setValue('agreeMarketing', checked)
  }

  const allAgreed = agreeService && agreePrivacy && agreeMarketing

  // 이메일 회원가입
  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            marketing_consent: data.agreeMarketing || false,
          },
        },
      })

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('이미 가입된 이메일입니다.')
        } else {
          setError(authError.message)
        }
        return
      }

      if (authData.user) {
        // 이메일 인증 안내 페이지로 이동
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(
          ('/auth/verify-email?email=' + encodeURIComponent(data.email)) as any
        )
      }
    } catch {
      setError('회원가입 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  // 소셜 로그인
  const handleSocialSignup = async (provider: 'google' | 'kakao' | 'naver') => {
    setSocialLoading(provider)
    setError(null)

    try {
      const supabase = createClient()
      // Supabase Provider 타입 캐스팅 (naver는 커스텀 OIDC로 설정 필요)
      const { error: authError } = await supabase.auth.signInWithOAuth({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: provider as any,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (authError) {
        setError(authError.message)
        setSocialLoading(null)
      }
    } catch {
      setError('소셜 회원가입 중 오류가 발생했습니다.')
      setSocialLoading(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* 소셜 회원가입 버튼 */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => handleSocialSignup('google')}
          disabled={!!socialLoading}
          className="flex w-full items-center justify-center gap-3 border border-editorial-dark/10 bg-white px-4 py-3.5 text-sm tracking-wide text-editorial-dark transition-colors hover:border-editorial-dark/30 hover:bg-editorial-sand/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {socialLoading === 'google' ? (
            <Loader2 className="h-5 w-5 animate-spin text-editorial-ink/50" />
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
          Google로 시작하기
        </button>

        <button
          type="button"
          onClick={() => handleSocialSignup('kakao')}
          disabled={!!socialLoading}
          className="flex w-full items-center justify-center gap-3 bg-[#FEE500] px-4 py-3.5 text-sm tracking-wide text-[#191919] transition-colors hover:bg-[#FDD800] disabled:cursor-not-allowed disabled:opacity-50"
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
          카카오로 시작하기
        </button>

        <button
          type="button"
          onClick={() => handleSocialSignup('naver')}
          disabled={!!socialLoading}
          className="flex w-full items-center justify-center gap-3 bg-[#03C75A] px-4 py-3.5 text-sm tracking-wide text-white transition-colors hover:bg-[#02B350] disabled:cursor-not-allowed disabled:opacity-50"
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
          네이버로 시작하기
        </button>
      </div>

      {/* 구분선 */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-editorial-dark/10" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-editorial-bg px-6 text-xs uppercase tracking-widest text-editorial-ink/40">
            or
          </span>
        </div>
      </div>

      {/* 이메일 회원가입 폼 */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* 이메일 */}
        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-xs uppercase tracking-widest text-editorial-ink/60"
          >
            Email
          </label>
          <div className="relative">
            <input
              {...register('email')}
              type="email"
              id="email"
              placeholder="email@example.com"
              onBlur={(e) => checkEmailAvailability(e.target.value)}
              className="block w-full border border-editorial-dark/10 bg-white px-4 py-3.5 pr-12 text-sm text-editorial-dark placeholder-editorial-ink/30 transition-colors focus:border-editorial-gold focus:outline-none"
            />
            {emailChecking && (
              <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-editorial-ink/40" />
            )}
            {!emailChecking && emailAvailable === true && (
              <Check className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-green-600" />
            )}
            {!emailChecking && emailAvailable === false && (
              <X className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-red-600" />
            )}
          </div>
          {errors.email && (
            <p className="mt-2 text-xs text-red-600">{errors.email.message}</p>
          )}
          {emailAvailable === false && (
            <p className="mt-2 text-xs text-red-600">
              이미 사용 중인 이메일입니다.
            </p>
          )}
        </div>

        {/* 비밀번호 */}
        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-xs uppercase tracking-widest text-editorial-ink/60"
          >
            Password
          </label>
          <div className="relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              id="password"
              placeholder="8자 이상, 영문+숫자"
              className="block w-full border border-editorial-dark/10 bg-white px-4 py-3.5 pr-12 text-sm text-editorial-dark placeholder-editorial-ink/30 transition-colors focus:border-editorial-gold focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-editorial-ink/40 transition-colors hover:text-editorial-dark"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-2 text-xs text-red-600">
              {errors.password.message}
            </p>
          )}
          {/* 비밀번호 강도 표시 */}
          {password && (
            <div className="mt-3">
              <div className="flex items-center gap-3">
                <div className="h-0.5 flex-1 bg-editorial-dark/10">
                  <div
                    className={`h-full transition-all ${passwordStrength.color}`}
                    style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                  />
                </div>
                <span className="text-xs tracking-wide text-editorial-ink/50">
                  {passwordStrength.label}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 비밀번호 확인 */}
        <div>
          <label
            htmlFor="passwordConfirm"
            className="mb-2 block text-xs uppercase tracking-widest text-editorial-ink/60"
          >
            Confirm Password
          </label>
          <div className="relative">
            <input
              {...register('passwordConfirm')}
              type={showPasswordConfirm ? 'text' : 'password'}
              id="passwordConfirm"
              placeholder="비밀번호 다시 입력"
              className="block w-full border border-editorial-dark/10 bg-white px-4 py-3.5 pr-12 text-sm text-editorial-dark placeholder-editorial-ink/30 transition-colors focus:border-editorial-gold focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-editorial-ink/40 transition-colors hover:text-editorial-dark"
            >
              {showPasswordConfirm ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.passwordConfirm && (
            <p className="mt-2 text-xs text-red-600">
              {errors.passwordConfirm.message}
            </p>
          )}
        </div>

        {/* 약관 동의 */}
        <div className="space-y-4 border border-editorial-dark/10 bg-editorial-sand/20 p-5">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={allAgreed}
              onChange={(e) => handleAgreeAll(e.target.checked)}
              className="h-4 w-4 border-editorial-dark/20 text-editorial-gold accent-editorial-gold focus:ring-editorial-gold"
            />
            <span className="text-sm font-medium text-editorial-dark">
              전체 동의
            </span>
          </label>

          <div className="space-y-3 border-t border-editorial-dark/10 pt-4">
            <label className="flex cursor-pointer items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  {...register('agreeService')}
                  className="h-3.5 w-3.5 border-editorial-dark/20 text-editorial-gold accent-editorial-gold focus:ring-editorial-gold"
                />
                <span className="text-sm text-editorial-ink/70">
                  (필수) 서비스 이용약관
                </span>
              </div>
              <a
                href="/terms/service"
                target="_blank"
                className="text-editorial-ink/40 transition-colors hover:text-editorial-gold"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </label>
            {errors.agreeService && (
              <p className="pl-6 text-xs text-red-600">
                {errors.agreeService.message}
              </p>
            )}

            <label className="flex cursor-pointer items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  {...register('agreePrivacy')}
                  className="h-3.5 w-3.5 border-editorial-dark/20 text-editorial-gold accent-editorial-gold focus:ring-editorial-gold"
                />
                <span className="text-sm text-editorial-ink/70">
                  (필수) 개인정보 처리방침
                </span>
              </div>
              <a
                href="/terms/privacy"
                target="_blank"
                className="text-editorial-ink/40 transition-colors hover:text-editorial-gold"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </label>
            {errors.agreePrivacy && (
              <p className="pl-6 text-xs text-red-600">
                {errors.agreePrivacy.message}
              </p>
            )}

            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                {...register('agreeMarketing')}
                className="h-3.5 w-3.5 border-editorial-dark/20 text-editorial-gold accent-editorial-gold focus:ring-editorial-gold"
              />
              <span className="text-sm text-editorial-ink/70">
                (선택) 마케팅 정보 수신
              </span>
            </label>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 가입하기 버튼 */}
        <button
          type="submit"
          disabled={isLoading || emailAvailable === false}
          className="flex w-full items-center justify-center bg-editorial-dark px-4 py-3.5 text-sm uppercase tracking-widest text-white transition-colors hover:bg-editorial-gold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            'Create Account'
          )}
        </button>
      </form>
    </div>
  )
}
