import React from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarClock,
  Cloud,
  CloudOff,
  Flame,
  GraduationCap,
  House,
  Loader2,
  LogOut,
  Mic,
  Sparkles,
  Trophy,
  Volume2,
} from 'lucide-react';
import type { AppTab, Riwaya, UserStats } from '../types/quran';
import type { ProgressSyncStatus } from '../services/storageService';
import { cn } from '../utils/cn';

const NAV_ITEMS: { id: AppTab; label: string; icon: typeof House }[] = [
  { id: 'home', label: 'الرئيسية', icon: House },
  { id: 'memorize', label: 'وضع الحفظ', icon: GraduationCap },
  { id: 'recite', label: 'التسميع والتصحيح', icon: Mic },
  { id: 'revision', label: 'خطط المراجعة والتثبيت', icon: CalendarClock },
  { id: 'explorer', label: 'المصحف والتفسير', icon: BookOpen },
  { id: 'competition', label: 'التحديات اليومية', icon: Trophy },
  { id: 'stats', label: 'إحصائيات الأداء', icon: BarChart3 },
];

interface NavbarProps {
  userEmail: string;
  onSignOut: () => void;
  currentTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  stats: UserStats;
  forgottenVersesCount: number;
  onOpenForgottenVerses: () => void;
  onOpenRewards: () => void;
  onToggleAudioPlayer: () => void;
  isAudioPlaying: boolean;
  syncStatus: ProgressSyncStatus;
  syncErrorMessage: string | null;
  onRetrySync: () => void;
  riwaya: Riwaya;
  onRiwayaChange: (riwaya: Riwaya) => void;
}

const SYNC_LABELS: Record<ProgressSyncStatus, string> = {
  syncing: 'جارٍ المزامنة',
  synced: 'محفوظ في السحابة',
  error: 'تعذرت المزامنة',
};

export const Navbar: React.FC<NavbarProps> = ({
  userEmail,
  onSignOut,
  currentTab,
  onSelectTab,
  stats,
  forgottenVersesCount,
  onOpenForgottenVerses,
  onOpenRewards,
  onToggleAudioPlayer,
  isAudioPlaying,
  syncStatus,
  syncErrorMessage,
  onRetrySync,
  riwaya,
  onRiwayaChange,
}) => {
  const SyncIcon =
    syncStatus === 'syncing' ? Loader2 : syncStatus === 'error' ? CloudOff : Cloud;

  return (
    <header className="sticky top-0 z-40 border-b border-emerald-950/10 bg-white/90 shadow-[0_8px_24px_rgba(2,44,34,0.06)] backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-2 sm:h-20 sm:gap-4">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 sm:gap-3"
            onClick={() => onSelectTab('home')}
            aria-label="العودة إلى الرئيسية"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-200/25 bg-gradient-to-br from-emerald-700 to-emerald-950 font-serif text-xl font-bold text-amber-200 shadow-md shadow-emerald-950/15 sm:h-11 sm:w-11 sm:text-2xl">
              مُ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-lg font-bold tracking-tight text-stone-900 sm:text-xl">
                  مُرتِّل
                </span>
                <span className="hidden rounded-full border border-emerald-800/10 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 sm:inline-flex">
                  القرآن الذكي
                </span>
              </div>
              <p className="hidden text-[11px] text-stone-500 sm:block">
                تحفيظ ومراجعة القرآن الكريم بالتصحيح الصوتي اللحظي
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1 sm:gap-3">
            <button
              type="button"
              onClick={syncStatus === 'error' ? onRetrySync : undefined}
              disabled={syncStatus !== 'error'}
              title={
                syncStatus === 'error'
                  ? `${syncErrorMessage ?? SYNC_LABELS.error} — انقر لإعادة المحاولة`
                  : SYNC_LABELS[syncStatus]
              }
              className={cn(
                'hidden items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 md:flex',
                syncStatus === 'error'
                  ? 'cursor-pointer border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                  : 'border-stone-200/80 bg-stone-50/80 text-stone-500',
              )}
            >
              <SyncIcon
                className={cn('h-3.5 w-3.5', syncStatus === 'syncing' && 'animate-spin')}
              />
              <span>{SYNC_LABELS[syncStatus]}</span>
            </button>

            {forgottenVersesCount > 0 && (
              <button
                type="button"
                onClick={onOpenForgottenVerses}
                className="group flex items-center gap-1 rounded-xl border border-amber-300/80 bg-amber-50 px-1.5 py-1.5 text-xs font-medium text-amber-900 transition-all hover:border-amber-400 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 sm:gap-1.5 sm:px-2.5"
                title="تنبيه: آيات تحتاج لمراجعة وتثبيت"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600 transition-transform group-hover:scale-110" />
                <span className="hidden md:inline">آيات تحتاج تثبيت:</span>
                <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {forgottenVersesCount.toLocaleString('ar-EG')}
                </span>
              </button>
            )}

            <div
              className="flex items-center gap-1 rounded-xl border border-stone-200/70 bg-stone-50 px-2 py-1.5 text-xs font-semibold text-stone-800 sm:gap-1.5 sm:px-3"
              title="أيام الالتزام المتتالية بالحفظ والمراجعة"
            >
              <Flame className="h-4 w-4 fill-amber-500 text-amber-500" />
              <span>{stats.streakDays.toLocaleString('ar-EG')}</span>
              <span className="hidden font-normal text-stone-500 sm:inline">أيام</span>
            </div>

            <button
              type="button"
              onClick={onOpenRewards}
              className="flex cursor-pointer items-center gap-1 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-2 py-1.5 text-xs font-semibold text-emerald-900 transition-colors hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:gap-1.5 sm:px-3"
              title="رصيد الحسنات ونقاط الإتقان - انقر لعرض الأوسمة"
            >
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span>{stats.points.toLocaleString('ar-EG')}</span>
              <span className="hidden font-normal text-emerald-700 sm:inline">حسنة</span>
            </button>

            <div
              className="flex items-center rounded-xl border border-stone-200/80 bg-stone-50 p-0.5"
              title="اختيار الرواية: حفص عن عاصم أو ورش عن نافع"
              role="group"
              aria-label="اختيار الرواية"
            >
              <button
                type="button"
                onClick={() => onRiwayaChange('hafs')}
                aria-pressed={riwaya === 'hafs'}
                className={cn(
                  'rounded-lg px-2 py-1 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-700',
                  riwaya === 'hafs'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-stone-500 hover:text-stone-800',
                )}
              >
                حفص
              </button>
              <button
                type="button"
                onClick={() => onRiwayaChange('warsh')}
                aria-pressed={riwaya === 'warsh'}
                className={cn(
                  'rounded-lg px-2 py-1 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-700',
                  riwaya === 'warsh'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-stone-500 hover:text-stone-800',
                )}
              >
                ورش
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleAudioPlayer}
              className={cn(
                'flex items-center gap-1 rounded-xl border p-1.5 text-xs font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:p-2',
                isAudioPlaying
                  ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm'
                  : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-emerald-200 hover:bg-emerald-50',
              )}
              title="مشغل تلاوات القراء"
              aria-pressed={isAudioPlaying}
            >
              <Volume2 className="h-4 w-4" />
              <span className="hidden lg:inline">{isAudioPlaying ? 'قارئ نشط' : 'التلاوة'}</span>
            </button>

            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-xs font-medium text-stone-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              title={`تسجيل الخروج من ${userEmail}`}
              aria-label="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>

        <nav
          aria-label="التنقل الرئيسي"
          className="no-scrollbar flex snap-x snap-mandatory items-center gap-1 overflow-x-auto border-t border-stone-200/70 py-2"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex snap-start items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-4 sm:text-sm',
                  isActive
                    ? 'bg-gradient-to-l from-emerald-900 to-emerald-800 text-white shadow-sm shadow-emerald-950/15 after:absolute after:bottom-1 after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-amber-300'
                    : 'text-stone-600 hover:bg-emerald-50 hover:text-emerald-900',
                )}
              >
                <Icon className={cn('h-4 w-4', isActive ? 'text-amber-300' : 'text-stone-500')} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
