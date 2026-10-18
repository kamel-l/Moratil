import { useState, type FormEvent } from 'react';
import { BookOpen, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { missingSupabaseConfig, supabase } from '../services/supabase';

type AuthMode = 'signIn' | 'signUp' | 'resetPassword';

interface LoginScreenProps {
  authError?: string | null;
}

function getAuthErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';

  if (message.includes('Invalid login credentials')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }
  if (message.includes('User already registered')) {
    return 'هذا البريد مسجل بالفعل. جرّب تسجيل الدخول.';
  }
  if (message.includes('Password should be at least')) {
    return 'كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.';
  }
  if (message.includes('Email not confirmed')) {
    return 'أكد بريدك الإلكتروني من الرابط الذي أرسلناه إليك قبل تسجيل الدخول.';
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'محاولات كثيرة. يرجى الانتظار قليلًا ثم المحاولة مجددًا.';
  }
  if (message.toLowerCase().includes('fetch')) {
    return 'تعذر الاتصال بالخدمة. تحقق من رابط Supabase واتصالك بالإنترنت.';
  }

  return message || 'تعذر إكمال الطلب. تحقق من إعدادات Supabase وحاول مجددًا.';
}

export function LoginScreen({ authError }: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isConfigured = missingSupabaseConfig.length === 0 && supabase !== null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'signUp' && password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }

    if (!supabase) {
      setError('أكمل إعداد Supabase أولًا لتفعيل تسجيل الدخول.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'signUp') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice('أنشأنا حسابك. تحقق من بريدك الإلكتروني واضغط رابط التأكيد لتفعيل الحساب.');
        }
      } else if (mode === 'resetPassword') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (resetError) throw resetError;
        setNotice('إذا كان البريد مسجلًا، فستصلك رسالة لإعادة تعيين كلمة المرور.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (authRequestError) {
      setError(getAuthErrorMessage(authRequestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setNotice('');
    setConfirmPassword('');
  };

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900 sm:flex sm:items-center sm:justify-center"
    >
      <section className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5">
        <div className="bg-islamic-pattern px-8 py-8 text-center text-white">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-amber-300">
            <BookOpen className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="font-serif text-3xl font-bold">مُرتِّل</p>
          <p className="mt-2 text-sm text-emerald-50">رفيقك في حفظ القرآن ومراجعته</p>
        </div>

        <div className="p-6 sm:p-8">
          <h1 className="text-xl font-bold">
            {mode === 'signUp'
              ? 'إنشاء حساب جديد'
              : mode === 'resetPassword'
                ? 'استعادة كلمة المرور'
                : 'مرحبًا بعودتك'}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {mode === 'resetPassword'
              ? 'أدخل بريدك الإلكتروني لنرسل لك رابط إعادة التعيين.'
              : 'سجّل الدخول لمتابعة رحلتك في الحفظ والمراجعة.'}
          </p>

          {!isConfigured && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
            >
              <p className="font-bold">يلزم إعداد Supabase لتفعيل تسجيل الدخول.</p>
              <p className="mt-1">
                أضف القيم التالية إلى ملف <code dir="ltr">.env.local</code> من إعدادات
                مشروع Supabase:
              </p>
              <ul dir="ltr" className="mt-2 list-inside list-disc text-xs">
                {missingSupabaseConfig.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm font-semibold text-stone-700">
              البريد الإلكتروني
              <span className="relative mt-1.5 block">
                <Mail
                  className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                  aria-hidden="true"
                />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-stone-300 bg-white py-3 pe-10 ps-3 text-left text-sm font-normal outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  dir="ltr"
                />
              </span>
            </label>

            {mode !== 'resetPassword' && (
              <>
                <label className="block text-sm font-semibold text-stone-700">
                  كلمة المرور
                  <span className="relative mt-1.5 block">
                    <LockKeyhole
                      className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                      aria-hidden="true"
                    />
                    <input
                      type="password"
                      autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="6 أحرف على الأقل"
                      className="w-full rounded-xl border border-stone-300 bg-white py-3 pe-10 ps-3 text-sm font-normal outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    />
                  </span>
                </label>

                {mode === 'signUp' && (
                  <label className="block text-sm font-semibold text-stone-700">
                    تأكيد كلمة المرور
                    <span className="relative mt-1.5 block">
                      <LockKeyhole
                        className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                        aria-hidden="true"
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="أعد إدخال كلمة المرور"
                        className="w-full rounded-xl border border-stone-300 bg-white py-3 pe-10 ps-3 text-sm font-normal outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      />
                    </span>
                  </label>
                )}
              </>
            )}

            {(error || authError) && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error || authError}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 font-bold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {mode === 'signUp'
                ? 'إنشاء الحساب'
                : mode === 'resetPassword'
                  ? 'إرسال رابط الاستعادة'
                  : 'تسجيل الدخول'}
            </button>
          </form>

          <div className="mt-5 flex flex-col items-center gap-3 text-sm">
            {mode === 'signIn' && (
              <button
                type="button"
                onClick={() => changeMode('resetPassword')}
                className="font-semibold text-emerald-800 hover:text-emerald-950"
              >
                نسيت كلمة المرور؟
              </button>
            )}
            {mode === 'resetPassword' ? (
              <button
                type="button"
                onClick={() => changeMode('signIn')}
                className="font-semibold text-emerald-800 hover:text-emerald-950"
              >
                العودة إلى تسجيل الدخول
              </button>
            ) : (
              <p className="text-stone-600">
                {mode === 'signUp' ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب؟'}{' '}
                <button
                  type="button"
                  onClick={() => changeMode(mode === 'signUp' ? 'signIn' : 'signUp')}
                  className="font-bold text-emerald-800 hover:text-emerald-950"
                >
                  {mode === 'signUp' ? 'سجّل الدخول' : 'أنشئ حسابًا'}
                </button>
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
