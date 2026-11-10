/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Navbar } from './components/Navbar';
import { Landing } from './components/Landing';
import { VoiceReciter } from './components/VoiceReciter';
import { RevisionPlans } from './components/RevisionPlans';
import { SurahExplorer } from './components/SurahExplorer';
import { Memorization } from './components/Memorization';
import { CompetitionLeaderboard } from './components/CompetitionLeaderboard';
import { StatsDashboard } from './components/StatsDashboard';
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
  FriendUser,
  QuranChallenge,
  RiwayahKey,
} from './types/quran';
import { ALL_SURAHS } from './data/quranSurahsList';
import { PRELOADED_SURAHS } from './data/quranData';
import { getSurahWithAyahsByRiwayah } from './data/riwayahData';
import { ensureRiwayahFont, RIWAYAT } from './data/riwayahConfig';
import { POPULAR_RECITERS } from './utils/audioReciters';
import {
  getUserStats,
  getVerseMasteryMap,
  getVersesNeedingReinforcement,
  getRevisionPlans,
  getFriends,
  getChallenges,
} from './services/storageService';

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [currentTab, setCurrentTab] = useState<string>('recite');
  const [riwayah, setRiwayah] = useState<RiwayahKey>('hafs');
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
  const [friends, setFriends] = useState<FriendUser[]>(getFriends());
  const [challenges, setChallenges] = useState<QuranChallenge[]>(getChallenges());

  const [activeTafsirAyah, setActiveTafsirAyah] = useState<Ayah | null>(null);
  const [isRewardsModalOpen, setIsRewardsModalOpen] = useState(false);
  const [isAudioPlayerOpen, setIsAudioPlayerOpen] = useState(false);
  const [audioAyahNumber, setAudioAyahNumber] = useState(1);

  // Load surah when selectedSurahNumber or riwayah changes
  useEffect(() => {
    let isMounted = true;
    getSurahWithAyahsByRiwayah(selectedSurahNumber, riwayah)
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
  }, [selectedSurahNumber, riwayah]);

  // Register the mushaf font for the selected riwayah once.
  useEffect(() => {
    ensureRiwayahFont(riwayah);
  }, [riwayah]);

  // Switching riwayah changes ayah boundaries; restart at the first ayah and
  // stop the (Hafs-only) audio player when the riwayah has no audio.
  useEffect(() => {
    setInitialAyahForReciter(1);
    setAudioAyahNumber(1);
    if (!RIWAYAT[riwayah].hasAudio) {
      setIsAudioPlayerOpen(false);
    }
  }, [riwayah]);

  const refreshAllState = useCallback(() => {
    setStats(getUserStats());
    setVerseMasteryMap(getVerseMasteryMap());
    setForgottenVerses(getVersesNeedingReinforcement());
    setPlans(getRevisionPlans());
    setFriends(getFriends());
    setChallenges(getChallenges());
  }, []);

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

  // Play audio for a specific surah
  const handlePlaySurahAudio = (surahNum: number) => {
    if (!RIWAYAT[riwayah].hasAudio) return;
    setSelectedSurahNumber(surahNum);
    setAudioAyahNumber(1);
    setIsAudioPlayerOpen(true);
  };

  if (showLanding) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <Landing onEnter={() => setShowLanding(false)} />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      key="workspace"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen bg-jade-950 text-white pb-28 font-sans selection:bg-gold-400/25"
    >
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        stats={stats}
        forgottenVersesCount={forgottenVerses.length}
        onOpenForgottenVerses={() => setCurrentTab('revision')}
        onOpenRewards={() => setIsRewardsModalOpen(true)}
        onToggleAudioPlayer={() => setIsAudioPlayerOpen(!isAudioPlayerOpen)}
        isAudioPlaying={isAudioPlayerOpen}
        riwayah={riwayah}
        onSelectRiwayah={setRiwayah}
        audioAvailable={RIWAYAT[riwayah].hasAudio}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Tab 1: Voice Recitation & Real-time Error Correction */}
            {currentTab === 'recite' && (
              <VoiceReciter
                surah={currentSurah}
                initialAyahNumber={initialAyahForReciter}
                selectedReciter={selectedReciter}
                riwayah={riwayah}
                onOpenTafsir={(ayah) => setActiveTafsirAyah(ayah)}
                onStatsUpdate={refreshAllState}
                onSelectSurahChange={(num, ayahNum = 1) => {
                  setSelectedSurahNumber(num);
                  setInitialAyahForReciter(ayahNum);
                }}
                allSurahsList={ALL_SURAHS}
              />
            )}

            {/* Tab 2: Memorization (reading in the chosen riwayah) */}
            {currentTab === 'memorize' && (
              <Memorization
                riwayah={riwayah}
                onStartReciting={handleStartPracticingVerse}
                onOpenTafsir={(ayah) => setActiveTafsirAyah(ayah)}
              />
            )}

            {/* Tab 2: Periodic Revision Plans & Forgotten Verses (SRS) */}
            {currentTab === 'revision' && (
              <RevisionPlans
                plans={plans}
                forgottenVerses={forgottenVerses}
                onStartPracticingVerse={handleStartPracticingVerse}
                onRefreshPlans={refreshAllState}
              />
            )}

            {/* Tab 3: Quran Explorer & Tafsir Al-Muyassar */}
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
                riwayah={riwayah}
              />
            )}

            {/* Tab 4: Friends Competition & Leaderboard */}
            {currentTab === 'competition' && (
              <CompetitionLeaderboard
                friends={friends}
                challenges={challenges}
                onStartChallenge={handleStartChallenge}
                onRefresh={refreshAllState}
              />
            )}

            {/* Tab 5: Daily Performance Statistics */}
            {currentTab === 'stats' && (
              <StatsDashboard stats={stats} verseMasteryMap={verseMasteryMap} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Sticky Bottom Audio Player Bar */}
      <AudioPlayerBar
        currentSurah={currentSurah}
        currentAyahNumber={audioAyahNumber}
        selectedReciter={selectedReciter}
        onSelectReciter={setSelectedReciter}
        onClose={() => setIsAudioPlayerOpen(false)}
        onAyahChange={(newAyah) => setAudioAyahNumber(newAyah)}
        isOpen={isAudioPlayerOpen}
      />

      {/* Tafsir Al-Muyassar Modal */}
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

      {/* Rewards & Badges Modal */}
      {isRewardsModalOpen && (
        <RewardsModal stats={stats} onClose={() => setIsRewardsModalOpen(false)} />
      )}
    </motion.div>
  );
}
