import React, { useState } from 'react';
import { LogIn, UserPlus, Loader2, AlertCircle, Mail, Lock } from 'lucide-react';

interface AuthFormProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onResetPassword?: (email: string) => Promise<void>;
  signInLabel?: string;
  signUpLabel?: string;
  authError?: string | null;
  notice?: string;
}

/**
 * نموذج المصادقة المشترك (تسجيل الدخول / إنشاء حساب) بثيم اليشم والذهب.
 * يُستخدم في بوابة الدخول وفي نافذة الحساب والمزامنة على حدّ سواء.
 */
export const AuthForm: React.FC<AuthFormProps> = ({
  onSignIn,
  onSignUp,
  onResetPassword,
  signInLabel = 'تسجيل الدخول',
  signUpLabel = 'إنشاء حساب',
  authError,
  notice,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'resetPassword'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (next: 'signin' | 'signup' | 'resetPassword') => {
    setMode(next);
    setError(null);
    setConfirm('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirm) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'signup') await onSignUp(email.trim(), password);
      else if (mode === 'resetPassword') await onResetPassword?.(email.trim());
      else await onSignIn(email.trim(), password);
      setPassword('');
      setConfirm('');
      if (mode === 'signup') setMode('signin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقّع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 focus-within:border-gold-400/50 transition-colors';
  const fieldClass =
    'flex-1 bg-transparent outline-none text-sm text-white placeholder:text-jade-100/30';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode !== 'resetPassword' && (
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {(
            [
              { key: 'signin', label: signInLabel, icon: LogIn },
              { key: 'signup', label: signUpLabel, icon: UserPlus },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => switchMode(key)}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
                mode === key
                  ? 'bg-gold-400 text-jade-950 shadow-lg shadow-gold-500/20'
                  : 'text-jade-100/70 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === 'resetPassword' && (
        <p className="text-xs leading-relaxed text-jade-100/70">
          أدخل بريدك الإلكتروني لنرسل لك رابط إعادة التعيين.
        </p>
      )}

      <label className="block">
        <span className="text-xs text-jade-100/70 mb-1.5 block">البريد الإلكتروني</span>
        <div className={inputClass}>
          <Mail className="w-4 h-4 text-jade-100/50 shrink-0" />
          <input
            type="email"
            required
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={fieldClass}
          />
        </div>
      </label>

      {mode !== 'resetPassword' && (
        <label className="block">
          <span className="mb-1.5 block text-xs text-jade-100/70">كلمة المرور</span>
          <div className={inputClass}>
            <Lock className="h-4 w-4 shrink-0 text-jade-100/50" />
            <input
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={fieldClass}
            />
          </div>
        </label>
      )}

      {mode === 'signup' && (
        <label className="block">
          <span className="text-xs text-jade-100/70 mb-1.5 block">تأكيد كلمة المرور</span>
          <div className={inputClass}>
            <Lock className="w-4 h-4 text-jade-100/50 shrink-0" />
            <input
              type="password"
              required
              minLength={6}
              dir="ltr"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className={fieldClass}
            />
          </div>
        </label>
      )}

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-red-500/10 border border-red-400/25 text-red-200 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {authError && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {authError}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gold-400 hover:bg-gold-300 disabled:opacity-60 text-jade-950 font-bold text-sm transition-colors cursor-pointer"
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : mode === 'signup' ? (
          <UserPlus className="w-4 h-4" />
        ) : (
          <LogIn className="w-4 h-4" />
        )}
        {mode === 'signup'
          ? signUpLabel
          : mode === 'resetPassword'
            ? 'إرسال رابط الاستعادة'
            : signInLabel}
      </button>

      {mode === 'signin' && onResetPassword && (
        <button
          type="button"
          onClick={() => switchMode('resetPassword')}
          className="w-full cursor-pointer text-sm font-semibold text-gold-300 hover:text-gold-200"
        >
          نسيت كلمة المرور؟
        </button>
      )}
      {mode === 'resetPassword' && (
        <button
          type="button"
          onClick={() => switchMode('signin')}
          className="w-full cursor-pointer text-sm font-semibold text-gold-300 hover:text-gold-200"
        >
          العودة إلى تسجيل الدخول
        </button>
      )}
    </form>
  );
};