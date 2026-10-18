import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const missingSupabaseConfig = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
].filter((key): key is string => Boolean(key));

export const supabase =
  missingSupabaseConfig.length === 0
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
