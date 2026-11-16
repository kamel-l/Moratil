import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Sparkles, Mic, CalendarClock, BookOpen, ShieldCheck } from 'lucide-react';
import { missingSupabaseConfig, supabase } from '../services/supabase';
import { AuthForm } from './ui/AuthForm';

interface LoginScreenProps {
  authError?: string | null;
  onBackToLanding?: () => void;
}

const HIGHLIGHTS = [
  { icon: Mic, text: 'تصحيح صوتي لحظي أثناء التسميع' },
  { icon: CalendarClock, text: 'خطط تكرار متباعد لتثبيت الحفظ' },
  { icon: BookOpen, text: 'المصحف كامل مع التفسير الميسّر' },
  { icon: ShieldCheck, text: 'حفظ تقدّمك ومزامنته بين أجهزتك' },
];

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
  if (message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('too many requests')) {
    return 'محاولات كثيرة. يرجى الانتظار قليلًا ثم المحاولة مجددًا.';
  }
  if (message.toLowerCase().includes('fetch')) {
    return 'تعذر الاتصال بالخدمة. تحقق من رابط Supabase واتصالك بالإنترنت.';
  }
  return message || 'تعذر إكمال الطلب. تحقق من إعدادات Supabase وحاول مجددًا.';
}

export function LoginScreen({ authError, onBackToLanding }: LoginScreenProps) {
  const [notice, setNotice] = useState('');
  const isConfigured = missingSupabaseConfig.length === 0 && supabase !== null;

  const signIn = async (email: string, password: string) => {
    setNotice('');
    if (!supabase) throw new Error('أكمل إعداد Supabase أولًا لتفعيل تسجيل الدخول.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(getAuthErrorMessage(error));
  };

  const signUp = async (email: string, password: string) => {
    setNotice('');
    if (!supabase) throw new Error('أكمل إعداد Supabase أولًا لتفعيل تسجيل الدخول.');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(getAuthErrorMessage(error));
    setNotice('أُنشئ الحساب بنجاح. تحقق من بريدك الإلكتروني لتأكيد التسجيل ثم سجّل الدخول.');
  };

  const resetPassword = async (email: string) => {
    setNotice('');
    if (!supabase) throw new Error('أكمل إعداد Supabase أولًا لتفعيل تسجيل الدخول.');
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw new Error(getAuthErrorMessage(error));
    setNotice('أرسلنا رابط استعادة كلمة المرور إلى بريدك الإلكتروني.');
  };

  return (
    <main
      dir="rtl"
      className="relative isolate min-h-screen overflow-hidden bg-jade-950 p-4 text-white flex items-center justify-center"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-[-6rem] h-[28rem] w-[28rem] rounded-full bg-gold-400/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-8rem] left-[-6rem] h-[30rem] w-[30rem] rounded-full bg-jade-400/15 blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative grid w-full max-w-4xl items-center gap-8 lg:grid-cols-2"
      >
        <div className="space-y-6 text-center lg:text-right">
          <div className="flex items-center justify-center gap-3 lg:justify-start">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400 font-display text-2xl font-bold text-jade-950 shadow-lg shadow-gold-500/20">
              مُ
            </div>
            <div>
              <div className="font-display text-xl font-bold tracking-tight">مُرتِّل</div>
              <p className="-mt-0.5 text-[11px] text-jade-200/70">القرآن الذكي</p>
            </div>
          </div>

          <h1 className="font-display text-3xl font-bold leading-snug sm:text-4xl">
            أنشئ حسابك
            <span className="mt-1.5 block text-gold-gradient">وابدأ رحلة حفظك</span>
          </h1>

          <p className="mx-auto max-w-md text-sm leading-relaxed text-jade-100/75 sm:text-base lg:mx-0">
            حسابك يحفظ تقدّمك وآياتك المتقنة وخطط مراجعتك، ويزامنها معك على كل أجهزتك.
          </p>

          <ul className="mx-auto max-w-md space-y-2.5 text-right lg:mx-0">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-sm text-jade-100/85">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold-400/25 bg-gold-400/15 text-gold-300">
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="glass-panel space-y-5 rounded-3xl p-6 shadow-2xl shadow-black/40 sm:p-8">
          <div className="flex items-center gap-2 text-xs font-semibold text-gold-200">
            <Sparkles className="h-3.5 w-3.5" />
            الدخول إلى مُرتِّل
          </div>

          {!isConfigured && (
            <div
              role="alert"
              className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200"
            >
              <p className="font-bold">يلزم إعداد Supabase لتفعيل تسجيل الدخول.</p>
              <p className="mt-1">أضف القيم التالية إلى ملف .env.local:</p>
              <ul dir="ltr" className="mt-2 list-inside list-disc text-xs text-amber-100/80">
                {missingSupabaseConfig.map((key) => <li key={key}>{key}</li>)}
              </ul>
            </div>
          )}

          <AuthForm
            onSignIn={signIn}
            onSignUp={signUp}
            onResetPassword={resetPassword}
            authError={authError}
            notice={notice}
          />

          <p className="text-center text-[11px] leading-relaxed text-jade-100/50">
            بياناتك تُحفظ محليًا أولًا، ثم تُزامَن مع حسابك تلقائيًا.
          </p>

          {onBackToLanding && (
            <button
              type="button"
              onClick={onBackToLanding}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 text-xs text-jade-100/60 transition-colors hover:text-gold-300"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              العودة إلى الصفحة الرئيسية
            </button>
          )}
        </div>
      </motion.div>
    </main>
  );
}