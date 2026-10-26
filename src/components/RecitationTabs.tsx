import React, { useState } from 'react';
import { Mic, Trophy, ChevronRight } from 'lucide-react';
import { Surah, Ayah, Reciter } from '../types/quran';
import { VoiceReciter } from './VoiceReciter';
import { MemorizationTest } from './MemorizationTest';

interface RecitationTabsProps {
  surah: Surah;
  initialAyahNumber?: number;
  selectedReciter: Reciter;
  onOpenTafsir: (ayah: Ayah) => void;
  onStatsUpdate: () => void;
  onSelectSurahChange: (surahNum: number, ayahNum?: number) => void;
  allSurahsList: { number: number; name: string; numberOfAyahs: number }[];
  onClose: () => void; // ✅ مطلوب — يُستدعى عند الضغط على زر الرجوع
}

export const RecitationTabs: React.FC<RecitationTabsProps> = ({
  surah,
  initialAyahNumber,
  selectedReciter,
  onOpenTafsir,
  onStatsUpdate,
  onSelectSurahChange,
  allSurahsList,
  onClose,
}) => {
  const [tab, setTab] = useState<'recite' | 'test'>('recite');

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-stone-100"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      dir="rtl"
    >
      {/* ═══════════ رأس التركيز: رجوع + تبويبات ═══════════ */}
      <header className="shrink-0 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-stretch h-12">
          {/* زر الرجوع (يمين في RTL) */}
          <button
            type="button"
            onClick={onClose}
            className="w-12 flex items-center justify-center text-stone-700 hover:bg-stone-100 active:bg-stone-200 transition-colors"
            aria-label="رجوع"
            title="رجوع"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* تبويبات مركزية */}
          <div className="flex-1 flex items-stretch">
            <button
              onClick={() => setTab('recite')}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors relative ${
                tab === 'recite'
                  ? 'text-emerald-800'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>تسميع</span>
              {tab === 'recite' && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald-700 rounded-full" />
              )}
            </button>

            <div className="w-px bg-stone-200 my-2" />

            <button
              onClick={() => setTab('test')}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors relative ${
                tab === 'test'
                  ? 'text-emerald-800'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>اختبار</span>
              {tab === 'test' && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald-700 rounded-full" />
              )}
            </button>
          </div>

          {/* فراغ لموازنة العرض (بنفس عرض الرجوع) */}
          <div className="w-12" aria-hidden="true" />
        </div>
      </header>

      {/* ═══════════ منطقة المحتوى ═══════════ */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {tab === 'recite' && (
          <VoiceReciter
            surah={surah}
            initialAyahNumber={initialAyahNumber}
            selectedReciter={selectedReciter}
            onOpenTafsir={onOpenTafsir}
            onStatsUpdate={onStatsUpdate}
            onSelectSurahChange={onSelectSurahChange}
            allSurahsList={allSurahsList}
            embedded
          />
        )}
        {tab === 'test' && (
          <MemorizationTest
            surah={surah}
            selectedReciter={selectedReciter}
            onStatsUpdate={onStatsUpdate}
            embedded
          />
        )}
      </main>
    </div>
  );
};