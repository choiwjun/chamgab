// @TASK P1-R1 - Auth 인증 테스트
// @SPEC specs/domain/resources.yaml#users
// @SPEC specs/screens/auth-login.yaml

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          maybeSingle: vi.fn(),
        })),
      })),
    })),
  })),
}))

// Mock server Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        signUp: vi.fn(() =>
          Promise.resolve({
            data: { user: { id: 'test-id', email: 'test@example.com' } },
            error: null,
          })
        ),
        signInWithPassword: vi.fn(() =>
          Promise.resolve({
            data: { user: { id: 'test-id', email: 'test@example.com', user_metadata: { name: 'Test' } } },
            error: null,
          })
        ),
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: null },
            error: null,
          })
        ),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
    })
  ),
}))

describe('P1-R1-T1: AuthProvider', () => {
  describe('Supabase Auth 설정', () => {
    it('should export AuthProvider component', async () => {
      const { AuthProvider } = await import('@/providers/AuthProvider')
      expect(AuthProvider).toBeDefined()
      expect(typeof AuthProvider).toBe('function')
    })

    it('should export useAuth hook', async () => {
      const { useAuth } = await import('@/providers/AuthProvider')
      expect(useAuth).toBeDefined()
      expect(typeof useAuth).toBe('function')
    })
  })
})

describe('P1-R1-T2: Auth API Routes', () => {
  describe('POST /api/auth/signup', () => {
    it('should validate email format', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')

      const request = new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'password123',
          name: 'Test User',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBeDefined()
    })

    it('should validate password minimum length', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')

      const request = new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'short',
          name: 'Test User',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBeDefined()
    })

    it('should require name field', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')

      const request = new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/auth/login', () => {
    it('should validate email format', async () => {
      const { POST } = await import('@/app/api/auth/login/route')

      const request = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'password123',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })

    it('should require password field', async () => {
      const { POST } = await import('@/app/api/auth/login/route')

      const request = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/auth/check-email', () => {
    it('should validate email format', async () => {
      const { POST } = await import('@/app/api/auth/check-email/route')

      const request = new Request('http://localhost/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })

    it('should return availability status for valid email', async () => {
      const { POST } = await import('@/app/api/auth/check-email/route')

      const request = new Request('http://localhost/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      })

      const response = await POST(request)
      // Should return 200 with availability info
      expect([200, 409]).toContain(response.status)
    })
  })
})

describe('P1-R1-T3: Auth Middleware', () => {
  describe('Protected routes', () => {
    it('should export middleware function', async () => {
      const { middleware } = await import('@/middleware')
      expect(middleware).toBeDefined()
      expect(typeof middleware).toBe('function')
    })

    it('should export config with matcher', async () => {
      const { config } = await import('@/middleware')
      expect(config).toBeDefined()
      expect(config.matcher).toBeDefined()
    })
  })
})

describe('Auth Types', () => {
  it('should export auth schemas', async () => {
    const { signupSchema, loginSchema, checkEmailSchema } = await import('@/lib/validations/auth')
    expect(signupSchema).toBeDefined()
    expect(loginSchema).toBeDefined()
    expect(checkEmailSchema).toBeDefined()
  })
})
