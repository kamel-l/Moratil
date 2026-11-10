import React, { useState } from 'react';
import {
  Cloud,
  CloudOff,
  CloudUpload,
  LogOut,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  User as UserIcon,
} from 'lucide-react';
import { AuthForm } from './ui/AuthForm';
import type { AuthUser } from '../services/authService';
import type { SyncResult } from '../services/syncService';

interface AccountSyncProps {
  user: AuthUser | null;
  authAvailable: boolean;
  lastSyncAt: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onSyncNow: () => Promise<SyncResult>;
  onClose: () => void;
}

const formatTime = (iso: string | null): string => {
  if (!iso) return 'لم تتم بعد';
  try {
    return new Date(iso).toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
};

const SYNC_LABELS: Record<SyncResult['status'], string> = {
  synced: 'تمّت المزامنة بنجاح',
  not_configured: 'المزامنة غير مهيّأة',
  unauthenticated: 'يلزم تسجيل الدخول',
  identity_mismatch: 'هوية المستخدم غير متطابقة',
  failed: 'فشلت المزامنة',
};

export const AccountSync: React.FC<AccountSyncProps> = ({
  user,
  authAvailable,
  lastSyncAt,
  onSignIn,
  onSignUp,
  onSignOut,
  onSyncNow,
  onClose,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    setError(null);
    setIsSyncing(true);
    try {
      setResult(await onSyncNow());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّرت المزامنة');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await onSignOut();
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تسجيل الخروج');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-jade-900 border border-white/10 text-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gold-400/15 text-gold-300">
              {authAvailable ? <Cloud className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-white text-base">الحساب والمزامنة</h3>
              <p className="text-xs text-jade-100/60">حفظ تقدّمك ومزامنته بين أجهزتك</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-jade-100/60 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!authAvailable ? (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/10">
            <CloudOff className="w-5 h-5 text-jade-100/50 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">المزامنة السحابية غير متاحة</p>
              <p className="text-xs text-jade-100/60 leading-relaxed">
                لا توجد إعدادات Supabase في هذه البيئة، لذا يعمل التطبيق محليًا فقط. أضف
                <span className="text-gold-300"> VITE_SUPABASE_URL </span>
                و
                <span className="text-gold-300"> VITE_SUPABASE_ANON_KEY </span>
                لتفعيل المزامنة.
              </p>
            </div>
          </div>
        ) : user ? (
          /* Signed in */
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-gold-400/10 border border-gold-400/25">
              <div className="w-11 h-11 rounded-xl bg-gold-400 text-jade-950 flex items-center justify-center shrink-0">
                <UserIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-jade-100/60">مسجَّل الدخول</p>
                <p className="text-sm font-semibold text-white truncate" dir="ltr">
                  {user.email ?? user.id}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-xs text-jade-100/70">آخر مزامنة</span>
              <span className="text-xs font-semibold text-gold-200">{formatTime(lastSyncAt)}</span>
            </div>

            {result && (
              <div
                className={`flex items-start gap-2.5 p-3.5 rounded-2xl border text-xs ${
                  result.status === 'synced'
                    ? 'bg-emerald-500/10 border-emerald-400/25 text-emerald-200'
                    : 'bg-amber-500/10 border-amber-400/25 text-amber-200'
                }`}
              >
                {result.status === 'synced' ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                )}
                <div className="space-y-0.5">
                  <p className="font-semibold">{SYNC_LABELS[result.status]}</p>
                  {result.status === 'synced' && (
                    <p className="text-jade-100/70">
                      رُفع {result.pushed} صفًا وسُحب {result.pulled} صفًا
                    </p>
                  )}
                  {result.error && <p className="text-jade-100/60 break-all">{result.error}</p>}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-red-500/10 border border-red-400/25 text-red-200 text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="break-all">{error}</span>
              </div>
            )}

            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gold-400 hover:bg-gold-300 disabled:opacity-60 text-jade-950 font-bold text-sm transition-colors cursor-pointer"
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CloudUpload className="w-4 h-4" />
              )}
              {isSyncing ? 'جارٍ المزامنة...' : 'المزامنة الآن'}
            </button>

            <button
              onClick={handleSignOut}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-60 text-jade-100 text-sm font-medium transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج
            </button>
          </div>
        ) : (
          /* Signed out */
          <AuthForm onSignIn={onSignIn} onSignUp={onSignUp} signUpLabel="حساب جديد" />
        )}
      </div>
    </div>
  );
};
