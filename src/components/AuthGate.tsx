import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Sparkles, Mic, CalendarClock, BookOpen, ShieldCheck } from 'lucide-react';
import { AuthForm } from './ui/AuthForm';

interface AuthGateProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onBackToLanding: () => void;
}

const HIGHLIGHTS = [
  { icon: Mic, text: 'تصحيح صوتي لحظي أثناء التسميع' },
  { icon: CalendarClock, text: 'خطط تكرار متباعد لتثبيت الحفظ' },
  { icon: BookOpen, text: 'المصحف كامل مع التفسير الميسّر' },
  { icon: ShieldCheck, text: 'حفظ تقدّمك ومزامنته بين أجهزتك' },
];

/**
 * بوابة الدخول الإلزامية: لا يمكن الوصول إلى مساحة العمل قبل إنشاء حساب
 * أو تسجيل الدخول. تُعرَض فقط عندما تكون المصادقة السحابية مُهيّأة.
 */
export const AuthGate: React.FC<AuthGateProps> = ({ onSignIn, onSignUp, onBackToLanding }) => {
  return (
    <div className="relative isolate min-h-screen bg-jade-950 text-white overflow-hidden flex items-center justify-center p-4">
      {/* Halos décoratifs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-[-6rem] w-[28rem] h-[28rem] rounded-full bg-gold-400/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-8rem] left-[-6rem] w-[30rem] h-[30rem] rounded-full bg-jade-400/15 blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-4xl grid lg:grid-cols-2 gap-8 items-center"
      >
        {/* Brand & benefits */}
        <div className="space-y-6 text-center lg:text-right">
          <div className="flex items-center justify-center lg:justify-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gold-400 text-jade-950 flex items-center justify-center font-bold text-2xl shadow-lg shadow-gold-500/20 font-display">
              مُ
            </div>
            <div>
              <div className="font-bold text-xl font-display tracking-tight">مُرتِّل</div>
              <p className="text-[11px] text-jade-200/70 -mt-0.5">القرآن الذكي</p>
            </div>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl leading-snug font-bold">
            أنشئ حسابك
            <span className="block text-gold-gradient mt-1.5">وابدأ رحلة حفظك</span>
          </h1>

          <p className="text-sm sm:text-base text-jade-100/75 leading-relaxed max-w-md mx-auto lg:mx-0">
            حسابك يحفظ تقدّمك وآياتك المتقنة وخطط مراجعتك، ويزامنها معك على كل أجهزتك.
          </p>

          <ul className="space-y-2.5 max-w-md mx-auto lg:mx-0 text-right">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.text} className="flex items-center gap-2.5 text-sm text-jade-100/85">
                  <span className="w-8 h-8 rounded-lg bg-gold-400/15 border border-gold-400/25 text-gold-300 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  {item.text}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Auth card */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 text-gold-200 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            الدخول إلى مُرتِّل
          </div>

          <AuthForm onSignIn={onSignIn} onSignUp={onSignUp} />

          <p className="text-[11px] text-jade-100/50 text-center leading-relaxed">
            بياناتك تُحفظ محليًا أولًا، ثم تُزامَن مع حسابك تلقائيًا.
          </p>

          <button
            onClick={onBackToLanding}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-jade-100/60 hover:text-gold-300 transition-colors cursor-pointer"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            العودة إلى الصفحة الرئيسية
          </button>
        </div>
      </motion.div>
    </div>
  );
};
