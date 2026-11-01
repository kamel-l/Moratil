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
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 shadow-xs backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-2 sm:h-20 sm:gap-4">
          <button
            type="button"
            className="flex items-center gap-2 text-right sm:gap-3"
            onClick={() => onSelectTab('home')}
            aria-label="العودة إلى الرئيسية"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 font-serif text-xl font-bold text-amber-300 shadow-inner sm:h-11 sm:w-11 sm:text-2xl">
              مُ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-lg font-bold tracking-tight text-stone-900 sm:text-xl">
                  مُرتِّل
                </span>
                <span className="hidden rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 sm:inline-flex">
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
                'hidden items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors md:flex',
                syncStatus === 'error'
                  ? 'cursor-pointer border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                  : 'border-stone-200 bg-stone-50 text-stone-500',
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
                className="group flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-1.5 py-1.5 text-xs font-medium text-amber-900 transition-all hover:bg-amber-100 sm:gap-1.5 sm:px-2.5"
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
              className="flex items-center gap-1 rounded-lg bg-stone-100/90 px-2 py-1.5 text-xs font-semibold text-stone-800 sm:gap-1.5 sm:px-3"
              title="أيام الالتزام المتتالية بالحفظ والمراجعة"
            >
              <Flame className="h-4 w-4 fill-amber-500 text-amber-500" />
              <span>{stats.streakDays.toLocaleString('ar-EG')}</span>
              <span className="hidden font-normal text-stone-500 sm:inline">أيام</span>
            </div>

            <button
              type="button"
              onClick={onOpenRewards}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-900 transition-colors hover:bg-emerald-100/80 sm:gap-1.5 sm:px-3"
              title="رصيد الحسنات ونقاط الإتقان - انقر لعرض الأوسمة"
            >
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span>{stats.points.toLocaleString('ar-EG')}</span>
              <span className="hidden font-normal text-emerald-700 sm:inline">حسنة</span>
            </button>

            <div
              className="flex items-center rounded-lg border border-stone-200 bg-stone-50 p-0.5"
              title="اختيار الرواية: حفص عن عاصم أو ورش عن نافع"
              role="group"
              aria-label="اختيار الرواية"
            >
              <button
                type="button"
                onClick={() => onRiwayaChange('hafs')}
                aria-pressed={riwaya === 'hafs'}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-bold transition-colors',
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
                  'rounded-md px-2 py-1 text-xs font-bold transition-colors',
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
                'flex items-center gap-1 rounded-lg border p-1.5 text-xs font-medium transition-all sm:p-2',
                isAudioPlaying
                  ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm'
                  : 'border-stone-200 bg-stone-100 text-stone-700 hover:bg-stone-200',
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
              className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs font-medium text-stone-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              title={`تسجيل الخروج من ${userEmail}`}
              aria-label="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>

        <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto border-t border-stone-100 py-2">
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
                  'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm',
                  isActive
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
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
