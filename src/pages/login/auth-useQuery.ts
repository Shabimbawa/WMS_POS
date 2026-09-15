import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../utils/supabase-client' // adjust to your actual client import path
import { AUTH_BYPASS, MOCK_EMAIL, MOCK_PROFILE } from '../../utils/dev-auth-bypass' // DEV AUTH BYPASS

export type ProfileRole = 'warehouse_admin' | 'pos_admin' 

export interface Profile {
  id: number
  user_id: string
  roles: ProfileRole
}

/**
 * Shared so callers that need the profile before `useCurrentProfile` can run —
 * the login page, which must know the role to pick a landing route — prime this
 * exact key instead of hardcoding their own.
 */
export const profileQueryKey = (userId: string) => ['profile', userId] as const

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, roles')
    .eq('user_id', userId)
    .single()

  if (error) throw error
  return data
}

/**
 * Returns the current logged-in user's profile (role + employee_id),
 * cached for 1 hour. Re-fetches automatically on sign-in/sign-out.
 *
 * Usage:
 *   const { data: profile, isLoading } = useCurrentProfile()
 *   if (profile?.role === 'admin') { ... }
 */
export function useCurrentProfile() {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [authResolved, setAuthResolved] = useState(false)

  useEffect(() => {

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null)
      setEmail(session?.user?.email ?? null)
      setAuthResolved(true)
    })


    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session: Session | null) => {
        setUserId(session?.user?.id ?? null)
        setEmail(session?.user?.email ?? null)
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  const query = useQuery({
    queryKey: profileQueryKey(userId as string),
    queryFn: () => fetchProfile(userId as string),
    enabled: authResolved && !!userId,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  })

  if (AUTH_BYPASS) return { ...query, data: MOCK_PROFILE, isLoading: false, isError: false, email: MOCK_EMAIL } // DEV AUTH BYPASS
  return { ...query, email }
}