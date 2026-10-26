/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Navbar } from './components/Navbar';
import { LoginScreen } from './components/LoginScreen';
import { VoiceReciter } from './components/VoiceReciter';
import { RevisionPlans } from './components/RevisionPlans';
import { SurahExplorer } from './components/SurahExplorer';
import { CompetitionLeaderboard } from './components/CompetitionLeaderboard';
import { StatsDashboard } from './components/StatsDashboard';
import { HomeDashboard } from './components/HomeDashboard';
import { MemorizationMode } from './components/MemorizationMode';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { TafsirModal } from './components/TafsirModal';
import { RewardsModal } from './components/RewardsModal';

import {
  Surah,
  Ayah,
  Reciter,
  UserStats,
  VerseMastery,
  RevisionPlan,
  QuranChallenge,
} from './types/quran';
import { ALL_SURAHS } from './data/quranSurahsList';
import { getSurahWithAyahs, PRELOADED_SURAHS } from './data/quranData';
import { POPULAR_RECITERS } from './utils/audioReciters';
import { supabase } from './services/supabase';
import {
  getUserStats,
  getVerseMasteryMap,
  getVersesNeedingReinforcement,
  getRevisionPlans,
  getChallenges,
  saveChallenges,
  retryProgressSync,
  setStorageUserId,
  stopProgressSync,
  syncProgressFromCloud,
  type ProgressSyncStatus,
} from './services/storageService';
import { scheduleDueReviewReminder } from './services/revisionReminderService';

function getProgressSyncErrorMessage(error: unknown): string {
  const details =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; message?: unknown; status?: unknown })
      : {};
  const code = typeof details.code === 'string' ? details.code : '';
  const message = typeof details.message === 'string' ? details.message.toLowerCase() : '';
  const status = details.status;

  if (message.includes('supabase is not configured')) {
    return 'إعدادات الاتصال بقاعدة البيانات غير مكتملة. راجع VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY ثم أعد بناء التطبيق.';
  }
  if (
    code === 'PGRST205' ||
    code === '42P01' ||
    ((message.includes('relation') || message.includes('table')) &&
      (message.includes('not found') || message.includes('does not exist')))
  ) {
    return 'جداول المزامنة غير موجودة في Supabase. نفّذ ملف supabase/migrations/20261015200000_progress_sync.sql في SQL Editor.';
  }
  if (
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    message.includes('row-level security') ||
    message.includes('permission denied')
  ) {
    return 'رفضت قاعدة البيانات الوصول إلى بيانات التقدم. تحقّق من سياسات RLS ومن تسجيل الدخول بالحساب نفسه على الجهازين.';
  }
  if (
    error instanceof TypeError ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout')
  ) {
    return 'تعذر الوصول إلى Supabase. تحقّق من اتصال الإنترنت وإعدادات عنوان المشروع ثم أعد المحاولة.';
  }
  return 'تعذر مزامنة التقدم مع Supabase. تحقّق من إعداد المشروع وقاعدة البيانات ثم أعد المحاولة.';
}

export default function App() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setIsAuthReady(true);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const authenticatedUserId = session?.user.id ?? null;
      setStorageUserId(authenticatedUserId);
      setUserId(authenticatedUserId);
      setUserEmail(session?.user.email ?? null);
      setAuthError(null);
      setIsAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Unable to sign out:', error);
      window.alert('تعذر تسجيل الخروج. تحقق من اتصالك بالإنترنت وحاول مجددًا.');
    }
  };

  if (!isAuthReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100" dir="rtl">
        <div className="flex items-center gap-3 text-emerald-900" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
          جارٍ التحقق من تسجيل الدخول...
        </div>
      </main>
    );
  }

  if (!userEmail) {
    return <LoginScreen authError={authError} />;
  }

  if (!userId) {
    return <LoginScreen authError="تعذر تحديد حساب المستخدم. سجّل الخروج ثم أعد تسجيل الدخول." />;
  }

  return (
    <AuthenticatedApp
      key={userId}
      userId={userId}
      userEmail={userEmail}
      onSignOut={handleSignOut}
    />
  );
}

interface AuthenticatedAppProps {
  userId: string;
  userEmail: string;
  onSignOut: () => void;
}

function AuthenticatedApp({ userId, userEmail, onSignOut }: AuthenticatedAppProps) {
  const [syncStatus, setSyncStatus] = useState<ProgressSyncStatus>('syncing');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [selectedSurahNumber, setSelectedSurahNumber] = useState<number>(1);
  const [currentSurah, setCurrentSurah] = useState<Surah>(PRELOADED_SURAHS[1]);
  const [initialAyahForReciter, setInitialAyahForReciter] = useState<number>(1);

  const [selectedReciter, setSelectedReciter] = useState<Reciter>(POPULAR_RECITERS[0]);
  const [stats, setStats] = useState<UserStats>(getUserStats());
  const [verseMasteryMap, setVerseMasteryMap] =
    useState<Record<string, VerseMastery>>(getVerseMasteryMap());
  const [forgottenVerses, setForgottenVerses] = useState<VerseMastery[]>(
    getVersesNeedingReinforcement(),
  );
  const [plans, setPlans] = useState<RevisionPlan[]>(getRevisionPlans());
  const [challenges, setChallenges] = useState<QuranChallenge[]>(getChallenges());

  const [activeTafsirAyah, setActiveTafsirAyah] = useState<Ayah | null>(null);
  const [isRewardsModalOpen, setIsRewardsModalOpen] = useState(false);
  const [isAudioPlayerOpen, setIsAudioPlayerOpen] = useState(false);
  const [audioAyahNumber, setAudioAyahNumber] = useState(1);

  // Load surah when selectedSurahNumber changes
  useEffect(() => {
    let isMounted = true;
    getSurahWithAyahs(selectedSurahNumber)
      .then((surahData) => {
        if (isMounted) {
          setCurrentSurah(surahData);
        }
      })
      .catch((error) => {
        console.warn('Unable to load surah:', error);
        if (isMounted) {
          setCurrentSurah(PRELOADED_SURAHS[selectedSurahNumber] || PRELOADED_SURAHS[1]);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [selectedSurahNumber]);

  const refreshAllState = useCallback(() => {
    setStats(getUserStats());
    setVerseMasteryMap(getVerseMasteryMap());
    setForgottenVerses(getVersesNeedingReinforcement());
    setPlans(getRevisionPlans());
    setChallenges(getChallenges());
  }, []);

  useEffect(() => {
    let isCurrentUser = true;
    void syncProgressFromCloud(userId, (status, error) => {
      if (isCurrentUser) {
        setSyncStatus(status);
        setSyncErrorMessage(status === 'error' ? getProgressSyncErrorMessage(error) : null);
      }
    })
      .then(refreshAllState)
      .catch((error: unknown) => {
        console.error('Unable to initialize progress synchronization:', error);
      });
    return () => {
      isCurrentUser = false;
      stopProgressSync();
    };
  }, [refreshAllState, userId]);

  useEffect(() => {
    void scheduleDueReviewReminder()
      .then((result) => {
        if (result === 'permission-denied') {
          console.warn('Revision reminders are enabled but notification permission is denied.');
        }
      })
      .catch((error: unknown) => {
        console.error('Unable to refresh due-review notification:', error);
      });
  }, [verseMasteryMap]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let isMounted = true;
    let removeListener: (() => Promise<void>) | null = null;
    void LocalNotifications.addListener('localNotificationActionPerformed', () => {
      setCurrentTab('revision');
    })
      .then((listener) => {
        if (isMounted) removeListener = () => listener.remove();
        else void listener.remove();
      })
      .catch((error: unknown) => {
        console.error('Unable to register revision notification listener:', error);
      });
    return () => {
      isMounted = false;
      if (removeListener) {
        void removeListener().catch((error: unknown) => {
          console.warn('Unable to remove revision notification listener:', error);
        });
      }
    };
  }, []);

  const handleRetrySync = () => {
    void retryProgressSync().catch((error: unknown) => {
      console.error('Unable to retry progress synchronization:', error);
    });
  };

  // Jump directly to practicing a specific forgotten verse
  const handleStartPracticingVerse = (surahNum: number, ayahNum: number) => {
    setSelectedSurahNumber(surahNum);
    setInitialAyahForReciter(ayahNum);
    setAudioAyahNumber(ayahNum);
    setCurrentTab('recite');
  };

  // Jump from daily challenge to voice recitation
  const handleStartChallenge = (challenge: QuranChallenge) => {
    setSelectedSurahNumber(challenge.surahNumber);
    setInitialAyahForReciter(challenge.ayahStart);
    setAudioAyahNumber(challenge.ayahStart);
    setCurrentTab('recite');
  };

  const handleCreateChallenge = (challenge: QuranChallenge) => {
    const updatedChallenges = [...getChallenges(), challenge];
    saveChallenges(updatedChallenges);
    setChallenges(updatedChallenges);
  };

  // Play audio for a specific surah
  const handlePlaySurahAudio = (surahNum: number) => {
    setSelectedSurahNumber(surahNum);
    setAudioAyahNumber(1);
    setIsAudioPlayerOpen(true);
  };

  const handleSelectTab = (tab: string) => {
    if (tab === 'memorize') setIsAudioPlayerOpen(false);
    setCurrentTab(tab);
  };

  const reciteActive = currentTab === 'recite';

  return (
    <div
      dir="rtl"
      className={`bg-stone-100/60 text-stone-900 font-sans selection:bg-emerald-500/20 ${
        reciteActive
          ? 'h-[100dvh] pb-28 flex flex-col overflow-hidden'
          : 'min-h-screen pb-28'
      }`}
    >
      {/* ═══════════ شريط التنقل العلوي — يبقى ظاهرًا دائمًا ═══════════ */}
      <div className="shrink-0">
        <Navbar
          userEmail={userEmail}
          onSignOut={onSignOut}
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
          stats={stats}
          forgottenVersesCount={forgottenVerses.length}
          onOpenForgottenVerses={() => setCurrentTab('revision')}
          onOpenRewards={() => setIsRewardsModalOpen(true)}
          onToggleAudioPlayer={() => setIsAudioPlayerOpen(!isAudioPlayerOpen)}
          isAudioPlaying={isAudioPlayerOpen}
        />
      </div>

      {/* ═══════════ المحتوى ═══════════ */}
      {reciteActive ? (
        <div className="flex-1 min-h-0 overflow-hidden max-w-7xl w-full mx-auto">
          <VoiceReciter
            surah={currentSurah}
            initialAyahNumber={initialAyahForReciter}
            selectedReciter={selectedReciter}
            onOpenTafsir={(ayah) => setActiveTafsirAyah(ayah)}
            onStatsUpdate={refreshAllState}
            onSelectSurahChange={(num, ayahNum = 1) => {
              setSelectedSurahNumber(num);
              setInitialAyahForReciter(ayahNum);
            }}
            allSurahsList={ALL_SURAHS}
            embedded
            onClose={() => setCurrentTab('home')}
          />
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 w-full">
          {currentTab === 'home' && (
            <HomeDashboard
              stats={stats}
              verseMasteryMap={verseMasteryMap}
              forgottenVersesCount={forgottenVerses.length}
              onStartSession={() => setCurrentTab('recite')}
              onOpenMemorization={() => setCurrentTab('memorize')}
              onResumeVerse={handleStartPracticingVerse}
              onOpenReview={() => setCurrentTab('revision')}
              onOpenStats={() => setCurrentTab('stats')}
            />
          )}

          {currentTab === 'memorize' && (
            <MemorizationMode
              allSurahs={ALL_SURAHS}
              selectedReciter={selectedReciter}
              onSelectReciter={setSelectedReciter}
            />
          )}

          {currentTab === 'revision' && (
            <RevisionPlans
              plans={plans}
              forgottenVerses={forgottenVerses}
              onStartPracticingVerse={handleStartPracticingVerse}
              onRefreshPlans={refreshAllState}
            />
          )}

          {currentTab === 'explorer' && (
            <SurahExplorer
              onSelectSurahForRecitation={(num) => {
                setSelectedSurahNumber(num);
                setInitialAyahForReciter(1);
                setCurrentTab('recite');
              }}
              onPlaySurahAudio={handlePlaySurahAudio}
              onOpenTafsir={(ayah) => setActiveTafsirAyah(ayah)}
              completedSurahs={stats.completedSurahs}
            />
          )}

          {currentTab === 'competition' && (
            <CompetitionLeaderboard
              challenges={challenges}
              onStartChallenge={handleStartChallenge}
              onCreateChallenge={handleCreateChallenge}
            />
          )}

          {currentTab === 'stats' && (
            <StatsDashboard stats={stats} verseMasteryMap={verseMasteryMap} />
          )}
        </main>
      )}

      {/* ═══════════ مشغل الصوت (fixed) ═══════════ */}
      <AudioPlayerBar
        currentSurah={currentSurah}
        currentAyahNumber={audioAyahNumber}
        selectedReciter={selectedReciter}
        onSelectReciter={setSelectedReciter}
        onClose={() => setIsAudioPlayerOpen(false)}
        onAyahChange={(newAyah) => setAudioAyahNumber(newAyah)}
        isOpen={isAudioPlayerOpen}
      />

      {/* ═══════════ نافذة التفسير ═══════════ */}
      {activeTafsirAyah && (
        <TafsirModal
          ayah={activeTafsirAyah}
          surahName={currentSurah.name}
          onClose={() => setActiveTafsirAyah(null)}
          onPlayAudio={() => {
            setAudioAyahNumber(activeTafsirAyah.numberInSurah);
            setIsAudioPlayerOpen(true);
          }}
        />
      )}

      {/* ═══════════ نافذة المكافآت ═══════════ */}
      {isRewardsModalOpen && (
        <RewardsModal stats={stats} onClose={() => setIsRewardsModalOpen(false)} />
      )}
    </div>
  );
}