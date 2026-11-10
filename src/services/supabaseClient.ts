/**
 * عميل Supabase الوحيد للتطبيق.
 *
 * يُنشأ من متغيّرات البيئة VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY. إن غابت
 * الإعدادات يبقى العميل null فتبقى المزامنة معطّلة ويعمل التطبيق محليًا بالكامل.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** هل إعدادات Supabase متوفّرة؟ تُستخدم لتعطيل المزامنة بهدوء عند غيابها. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
