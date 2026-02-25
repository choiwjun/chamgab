import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ApiAuthOk = { userId: string }
type ApiAuthFailed = { response: NextResponse }

export async function requireApiUser(): Promise<ApiAuthOk | ApiAuthFailed> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    }
  }

  return { userId: user.id }
}
