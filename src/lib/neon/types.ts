import type { SupabaseAuthAdapterInstance } from '@neondatabase/neon-js'

export type User = NonNullable<
  Awaited<ReturnType<SupabaseAuthAdapterInstance['getUser']>>['data']['user']
>
export type Session = NonNullable<
  Awaited<
    ReturnType<SupabaseAuthAdapterInstance['getSession']>
  >['data']['session']
>
export type AuthChangeEvent = Parameters<
  Parameters<SupabaseAuthAdapterInstance['onAuthStateChange']>[0]
>[0]
