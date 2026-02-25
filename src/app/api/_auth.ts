import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ApiUser = {
  userId: string
  email: string | null
}

type ApiUnauthorized = {
  response: NextResponse
}

export async function requireApiUser(): Promise<ApiUser | ApiUnauthorized> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user?.id) {
    return {
      response: NextResponse.json(
        { error: 'not_authenticated', code: 'AUTH_REQUIRED' },
        { status: 401 }
      ),
    }
  }

  return {
    userId: user.id,
    email: user.email ?? null,
  }
}
