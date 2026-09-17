// DEV AUTH BYPASS — temporary. Lets the app run without a Supabase backend.
// Enable with VITE_AUTH_BYPASS=true in .env. To remove entirely, delete this
// file and every line tagged "DEV AUTH BYPASS" (grep for it).
import type { Profile } from '../pages/login/auth-useQuery'

export const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === 'true'

export const MOCK_PROFILE: Profile = { id: 0, user_id: 'dev', roles: 'pos_admin' }
export const MOCK_EMAIL = 'dev@local'
