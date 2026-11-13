import { useState, type FormEvent } from 'react';
import { ArrowLeft, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { missingSupabaseConfig, supabase } from '../services/supabase';

type AuthMode = 'signIn' | 'signUp' | 'resetPassword';

interface LoginScreenProps {
  authError?: string | null;
  onBackToLanding?: () => void;
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

export function LoginScreen({ authError, onBackToLanding }: LoginScreenProps) {
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
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        setNotice('أُنشئ الحساب بنجاح. تحقق من بريدك الإلكتروني لتأكيد التسجيل ثم سجّل الدخول.');
        setMode('signIn');
      } else if (mode === 'resetPassword') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (resetError) throw resetError;
        setNotice('أرسلنا رابط استعادة كلمة المرور إلى بريدك الإلكتروني.');
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
      className="relative isolate min-h-screen bg-jade-950 text-white px-4 py-10 flex items-center justify-center overflow-hidden"
    >
      {/* Halos décoratifs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-[-6rem] w-[28rem] h-[28rem] rounded-full bg-gold-400/15 blur-3xl animate-float-orb"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-8rem] left-[-6rem] w-[30rem] h-[30rem] rounded-full bg-jade-400/15 blur-3xl animate-float-orb"
        style={{ animationDelay: '2s' }}
      />

      <section className="relative z-10 mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-jade-900/75 shadow-2xl backdrop-blur-xl">
        <div className="bg-islamic-pattern px-8 py-8 text-center text-white border-b border-white/10">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-400 text-jade-950 font-display text-2xl font-bold shadow-lg shadow-gold-500/20">
            مُ
          </div>
          <p className="font-display text-3xl font-bold text-white">مُرتِّل</p>
          <p className="mt-1 text-sm text-jade-100/75">رفيقك في حفظ القرآن الكريم وتثبيته</p>
        </div>

        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold font-display text-white">
              {mode === 'signUp'
                ? 'إنشاء حساب جديد'
                : mode === 'resetPassword'
                  ? 'استعادة كلمة المرور'
                  : 'مرحبًا بعودتك'}
            </h1>
            {onBackToLanding && (
              <button
                type="button"
                onClick={onBackToLanding}
                className="inline-flex items-center gap-1 text-xs text-gold-300 hover:text-gold-200 transition-colors cursor-pointer"
              >
                <span>الرئيسية</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-jade-100/70">
            {mode === 'resetPassword'
              ? 'أدخل بريدك الإلكتروني لنرسل لك رابط إعادة التعيين.'
              : 'سجّل الدخول لمتابعة رحلتك في الحفظ والمراجعة.'}
          </p>

          {!isConfigured && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200"
            >
              <p className="font-bold">يلزم إعداد Supabase لتفعيل تسجيل الدخول.</p>
              <p className="mt-1">
                أضف القيم التالية إلى ملف <code dir="ltr" className="text-gold-300">.env.local</code> من إعدادات
                مشروع Supabase:
              </p>
              <ul dir="ltr" className="mt-2 list-inside list-disc text-xs text-amber-100/80">
                {missingSupabaseConfig.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm font-semibold text-jade-100">
              البريد الإلكتروني
              <span className="relative mt-1.5 block">
                <Mail
                  className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-jade-200/50"
                  aria-hidden="true"
                />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-white/15 bg-white/5 py-3 pe-10 ps-3 text-left text-sm font-normal text-white placeholder:text-jade-100/40 outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/20"
                  dir="ltr"
                />
              </span>
            </label>

            {mode !== 'resetPassword' && (
              <>
                <label className="block text-sm font-semibold text-jade-100">
                  كلمة المرور
                  <span className="relative mt-1.5 block">
                    <LockKeyhole
                      className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-jade-200/50"
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
                      className="w-full rounded-xl border border-white/15 bg-white/5 py-3 pe-10 ps-3 text-sm font-normal text-white placeholder:text-jade-100/40 outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/20"
                    />
                  </span>
                </label>

                {mode === 'signUp' && (
                  <label className="block text-sm font-semibold text-jade-100">
                    تأكيد كلمة المرور
                    <span className="relative mt-1.5 block">
                      <LockKeyhole
                        className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-jade-200/50"
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
                        className="w-full rounded-xl border border-white/15 bg-white/5 py-3 pe-10 ps-3 text-sm font-normal text-white placeholder:text-jade-100/40 outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/20"
                      />
                    </span>
                  </label>
                )}
              </>
            )}

            {(error || authError) && (
              <p role="alert" className="rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-2 text-sm text-red-200">
                {error || authError}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-sm text-emerald-200">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold-400 hover:bg-gold-300 px-4 py-3 font-bold text-jade-950 transition shadow-lg shadow-gold-500/20 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin text-jade-950" aria-hidden="true" />}
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
                className="font-semibold text-gold-300 hover:text-gold-200 cursor-pointer"
              >
                نسيت كلمة المرور؟
              </button>
            )}
            {mode === 'resetPassword' ? (
              <button
                type="button"
                onClick={() => changeMode('signIn')}
                className="font-semibold text-gold-300 hover:text-gold-200 cursor-pointer"
              >
                العودة إلى تسجيل الدخول
              </button>
            ) : (
              <p className="text-jade-100/70">
                {mode === 'signUp' ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب؟'}{' '}
                <button
                  type="button"
                  onClick={() => changeMode(mode === 'signUp' ? 'signIn' : 'signUp')}
                  className="font-bold text-gold-300 hover:text-gold-200 cursor-pointer"
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
