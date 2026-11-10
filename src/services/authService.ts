/**
 * خدمة المصادقة (Supabase Auth) — تربط جلسة المستخدم السحابية بالبيانات المحلية.
 *
 * عند نجاح الدخول يُنادى adoptAuthenticatedUser الذي يعيد نسب البيانات المحلية
 * إلى مُعرّف المستخدم (auth.uid) ويضمن وجود ملف شخصي، تمهيدًا للمزامنة.
 * كل دوال الخدمة آمنة عندما تكون Supabase غير مهيّأة (تُعيد null/ترمي خطأ واضحًا).
 */

import { type Session, type User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { claimLocalData, getLocalUserId, profileRepo, setLocalUserId } from './databaseService';

export interface AuthUser {
  id: string;
  email: string | null;
}

/** هل المصادقة السحابية متاحة (إعدادات Supabase موجودة ومعمّرة بالعميل)؟ */
export function isAuthAvailable(): boolean {
  return isSupabaseConfigured && !!supabase;
}

function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email ?? null };
}

/** يوائم الهوية المحلية مع المستخدم المصادَق ويرحّل بياناته إن لزم. */
function adoptAuthenticatedUser(user: User): void {
  const localId = getLocalUserId();
  if (localId !== user.id) {
    claimLocalData(localId, user.id);
    setLocalUserId(user.id);
  }
  profileRepo.upsert(user.id, { email: user.email ?? null });
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthUser> {
  if (!supabase) throw new Error('المزامنة السحابية غير مهيّأة');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  // إن كان تأكيد البريد مفعّلًا لا تُنشأ جلسة فورًا؛ نطلب من المستخدم التأكيد.
  if (!data.session || !data.user) {
    throw new Error('أُنشئ الحساب — يرجى تأكيد بريدك الإلكتروني ثم تسجيل الدخول.');
  }
  adoptAuthenticatedUser(data.user);
  return toAuthUser(data.user);
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  if (!supabase) throw new Error('المزامنة السحابية غير مهيّأة');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('تعذّر تسجيل الدخول');
  adoptAuthenticatedUser(data.user);
  return toAuthUser(data.user);
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** المستخدم الحالي من الجلسة المحفوظة (أو null). */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  adoptAuthenticatedUser(user);
  return toAuthUser(user);
}

/** يستمع لتغيّرات الجلسة (دخول/خروج/تجديد) ويعيد دالة لإلغاء الاشتراك. */
export function observeAuth(onUser: (user: AuthUser | null) => void): () => void {
  if (!supabase) {
    onUser(null);
    return () => {};
  }

  const handle = (session: Session | null) => {
    if (session?.user) {
      adoptAuthenticatedUser(session.user);
      onUser(toAuthUser(session.user));
    } else {
      onUser(null);
    }
  };

  void supabase.auth
    .getSession()
    .then(({ data }) => handle(data.session))
    .catch(() => handle(null));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => handle(session));
  return () => data.subscription.unsubscribe();
}
