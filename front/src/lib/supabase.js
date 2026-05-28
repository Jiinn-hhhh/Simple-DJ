import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabaseAuthSettingsUrl = supabaseUrl
  ? `${supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`
  : '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
