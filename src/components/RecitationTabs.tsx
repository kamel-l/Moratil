import React, { useState } from 'react';
import { Mic, Trophy } from 'lucide-react';
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
}

export const RecitationTabs: React.FC<RecitationTabsProps> = (props) => {
  const [tab, setTab] = useState<'recite' | 'test'>('recite');

  return (
    <div className="h-[100dvh] max-w-4xl mx-auto flex flex-col bg-stone-100 overflow-hidden">
      {/* شريط التبويبات */}
      <div className="shrink-0 bg-white border-b border-stone-200">
        <div className="flex">
          <button
            onClick={() => setTab('recite')}
            className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
              tab === 'recite'
                ? 'text-emerald-800 bg-emerald-50 border-b-2 border-emerald-600'
                : 'text-stone-600 hover:bg-stone-50'
            }`}
          >
            <Mic className="w-4 h-4" /> تسميع
          </button>
          <button
            onClick={() => setTab('test')}
            className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
              tab === 'test'
                ? 'text-emerald-800 bg-emerald-50 border-b-2 border-emerald-600'
                : 'text-stone-600 hover:bg-stone-50'
            }`}
          >
            <Trophy className="w-4 h-4" /> اختبار
          </button>
        </div>
      </div>

      {/* المحتوى */}
      <div className="flex-1 min-h-0">
        {tab === 'recite' && <VoiceReciter {...props} embedded />}
        {tab === 'test' && (
          <MemorizationTest
            surah={props.surah}
            selectedReciter={props.selectedReciter}
            onStatsUpdate={props.onStatsUpdate}
            embedded
          />
        )}
      </div>
    </div>
  );
};