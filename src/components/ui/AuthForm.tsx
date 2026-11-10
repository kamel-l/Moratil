import React, { useState } from 'react';
import { LogIn, UserPlus, Loader2, AlertCircle, Mail, Lock } from 'lucide-react';

interface AuthFormProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  signInLabel?: string;
  signUpLabel?: string;
}

/**
 * نموذج المصادقة المشترك (تسجيل الدخول / إنشاء حساب) بثيم اليشم والذهب.
 * يُستخدم في بوابة الدخول وفي نافذة الحساب والمزامنة على حدّ سواء.
 */
export const AuthForm: React.FC<AuthFormProps> = ({
  onSignIn,
  onSignUp,
  signInLabel = 'تسجيل الدخول',
  signUpLabel = 'إنشاء حساب',
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (next: 'signin' | 'signup') => {
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
      else await onSignIn(email.trim(), password);
      setPassword('');
      setConfirm('');
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
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
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
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              mode === key
                ? 'bg-gold-400 text-jade-950 shadow-lg shadow-gold-500/20'
                : 'text-jade-100/70 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

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

      <label className="block">
        <span className="text-xs text-jade-100/70 mb-1.5 block">كلمة المرور</span>
        <div className={inputClass}>
          <Lock className="w-4 h-4 text-jade-100/50 shrink-0" />
          <input
            type="password"
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
        {mode === 'signup' ? signUpLabel : signInLabel}
      </button>
    </form>
  );
};
