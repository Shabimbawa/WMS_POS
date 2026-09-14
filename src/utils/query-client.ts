import { QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase-client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
})

/**
 * Cached rows belong to the session that fetched them — almost every query key
 * in this app is global (["employee"], ['payrolls'], …) rather than scoped by
 * user, so an entry outlives the session and the next sign-in would read it.
 *
 * The clear happens on sign-IN, deliberately, and never on sign-out. Clearing
 * during sign-out runs while an authenticated page is still mounted: its
 * useQuery observers lose their data, refetch on the spot against the session
 * that was just destroyed, and cache the RLS-empty `200 []` as a *successful*
 * result with a fresh 5-minute staleTime. The next sign-in then finds that
 * entry fresh, skips the refetch, and renders an empty page until a hard
 * browser refresh. Here we are on the login page with nothing subscribed, so
 * the clear starts no fetches and the incoming user's pages mount clean.
 */
let lastUserId: string | null | undefined // undefined = no auth event seen yet

supabase.auth.onAuthStateChange((_event, session) => {
  const nextUserId = session?.user?.id ?? null

  if (nextUserId && lastUserId !== undefined && lastUserId !== nextUserId) {
    queryClient.clear()
  }

  lastUserId = nextUserId
})
