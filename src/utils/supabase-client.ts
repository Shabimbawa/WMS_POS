import { createClient } from '@supabase/supabase-js';
import { AUTH_BYPASS } from './dev-auth-bypass'; // DEV AUTH BYPASS

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (AUTH_BYPASS ? 'http://localhost:54321' : undefined); // DEV AUTH BYPASS
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || (AUTH_BYPASS ? 'placeholder' : undefined); // DEV AUTH BYPASS


export const supabase = createClient(supabaseUrl, supabaseKey);