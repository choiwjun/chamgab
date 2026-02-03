// @TASK P1-R1-T2 - Auth 검증 스키마
// @SPEC specs/screens/auth-login.yaml

import { z } from 'zod'

/**
 * 회원가입 스키마
 * - 이메일: 필수, 이메일 형식
 * - 비밀번호: 필수, 최소 8자
 * - 이름: 필수, 최소 2자
 */
export const signupSchema = z.object({
  email: z
    .string()
    .min(1, '이메일을 입력해주세요')
    .email('올바른 이메일 형식이 아닙니다'),
  password: z
    .string()
    .min(8, '비밀번호는 최소 8자 이상이어야 합니다'),
  name: z
    .string()
    .min(2, '이름은 최소 2자 이상이어야 합니다'),
})

/**
 * 로그인 스키마
 * - 이메일: 필수, 이메일 형식
 * - 비밀번호: 필수
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, '이메일을 입력해주세요')
    .email('올바른 이메일 형식이 아닙니다'),
  password: z
    .string()
    .min(1, '비밀번호를 입력해주세요'),
})

/**
 * 이메일 확인 스키마
 */
export const checkEmailSchema = z.object({
  email: z
    .string()
    .min(1, '이메일을 입력해주세요')
    .email('올바른 이메일 형식이 아닙니다'),
})

// 타입 추출
export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type CheckEmailInput = z.infer<typeof checkEmailSchema>
