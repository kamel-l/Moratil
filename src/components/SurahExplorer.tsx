import React, { useState, useMemo } from 'react';
import { 
  Search, 
  BookOpen, 
  Mic, 
  Volume2, 
  Check, 
  Sparkles, 
  Filter,
  ArrowRight
} from 'lucide-react';
import { ALL_SURAHS, SurahMeta } from '../data/quranSurahsList';
import { getSurahWithAyahs } from '../data/quranData';
import { Surah, Ayah } from '../types/quran';

interface SurahExplorerProps {
  onSelectSurahForRecitation: (surahNumber: number) => void;
  onPlaySurahAudio: (surahNumber: number) => void;
  onOpenTafsir: (ayah: Ayah) => void;
  completedSurahs: number[];
}

export const SurahExplorer: React.FC<SurahExplorerProps> = ({
  onSelectSurahForRecitation,
  onPlaySurahAudio,
  onOpenTafsir,
  completedSurahs
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'juz30' | 'makki' | 'madani'>('all');
  const [activeReadingSurah, setActiveReadingSurah] = useState<Surah | null>(null);
  const [loadingSurah, setLoadingSurah] = useState(false);

  const filteredSurahs = useMemo(() => {
    return ALL_SURAHS.filter(s => {
      const matchSearch =
        s.name.includes(searchTerm) ||
        s.englishName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.number.toString() === searchTerm.trim();

      if (!matchSearch) return false;

      if (filterType === 'juz30') return s.number >= 78;
      if (filterType === 'makki') return s.revelationType === 'مكية';
      if (filterType === 'madani') return s.revelationType === 'مدنية';

      return true;
    });
  }, [searchTerm, filterType]);

  const handleOpenReadingMode = async (surahNum: number) => {
    setLoadingSurah(true);
    try {
      const fullSurah = await getSurahWithAyahs(surahNum);
      setActiveReadingSurah(fullSurah);
    } finally {
      setLoadingSurah(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* If in Reading / Full Tafsir View for a single Surah */}
      {activeReadingSurah ? (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden space-y-6">
          
          {/* Header of Reading View */}
          <div className="p-6 bg-stone-50 border-b border-stone-100 flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => setActiveReadingSurah(null)}
              className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-white border border-stone-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة لفهرس السور</span>
            </button>

            <div className="text-center">
              <h2 className="text-xl font-bold text-stone-900 font-serif">
                سورة {activeReadingSurah.name}
              </h2>
              <div className="flex items-center justify-center gap-2 text-xs text-stone-500 mt-0.5">
                <span>{activeReadingSurah.revelationType}</span>
                <span>·</span>
                <span>{activeReadingSurah.numberOfAyahs} آيات</span>
                <span>·</span>
                <span>الجزء {activeReadingSurah.juzStart}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onSelectSurahForRecitation(activeReadingSurah.number)}
                className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                <Mic className="w-4 h-4" />
                <span>تسميع بصوتك</span>
              </button>

              <button
                onClick={() => onPlaySurahAudio(activeReadingSurah.number)}
                className="flex items-center gap-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold px-3 py-2 rounded-xl transition-colors cursor-pointer"
              >
                <Volume2 className="w-4 h-4 text-emerald-700" />
                <span>استماع</span>
              </button>
            </div>
          </div>

          {/* Verses with Inline Tafsir Al-Muyassar */}
          <div className="p-6 sm:p-10 space-y-8 divide-y divide-stone-100">
            {activeReadingSurah.ayahs.map((ayah) => (
              <div key={ayah.numberInSurah} className="pt-6 first:pt-0 space-y-4">
                
                {/* Quran Scripture */}
                <div className="text-right">
                  <div className="font-quran text-2xl sm:text-3xl text-stone-900 leading-loose">
                    {ayah.text}
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-emerald-700 text-emerald-800 text-sm font-bold mx-2 select-none">
                      {ayah.numberInSurah}
                    </span>
                  </div>
                </div>

                {/* Tafsir Al-Muyassar Box */}
                {ayah.tafsir && (
                  <div className="bg-emerald-50/60 border border-emerald-100/80 rounded-2xl p-4 text-xs text-stone-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-900 text-xs flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
                        التفسير الميسر:
                      </span>
                      <button
                        onClick={() => onOpenTafsir(ayah)}
                        className="text-[11px] text-emerald-700 hover:underline"
                      >
                        معاني الكلمات
                      </button>
                    </div>
                    <p className="leading-relaxed text-stone-600">
                      {ayah.tafsir}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      ) : (
        <>
          {/* Top Search & Filter Bar */}
          <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              
              {/* Search Input */}
              <div className="relative w-full sm:max-w-md">
                <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-3.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="ابحث باسم السورة (الفاتحة، الملك، يس...) أو برقمها..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl pr-10 pl-4 py-2.5 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl w-full sm:w-auto justify-center">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    filterType === 'all'
                      ? 'bg-white text-emerald-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  جميع السور (114)
                </button>

                <button
                  onClick={() => setFilterType('juz30')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    filterType === 'juz30'
                      ? 'bg-white text-emerald-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  جزء عمّ
                </button>

                <button
                  onClick={() => setFilterType('makki')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    filterType === 'makki'
                      ? 'bg-white text-emerald-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  مكية
                </button>

                <button
                  onClick={() => setFilterType('madani')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    filterType === 'madani'
                      ? 'bg-white text-emerald-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  مدنية
                </button>
              </div>

            </div>
          </div>

          {/* Surahs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSurahs.map((s) => {
              const isMemorized = completedSurahs.includes(s.number);

              return (
                <div
                  key={s.number}
                  className="bg-white rounded-2xl border border-stone-200 hover:border-emerald-300 p-5 shadow-xs transition-all space-y-4 flex flex-col justify-between group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-stone-100 group-hover:bg-emerald-50 text-stone-700 group-hover:text-emerald-800 font-bold text-sm flex items-center justify-center transition-colors">
                        {s.number}
                      </div>
                      <div>
                        <h3 className="font-bold text-stone-900 text-base font-serif">
                          سورة {s.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                          <span>{s.englishName}</span>
                          <span>·</span>
                          <span>{s.numberOfAyahs} آيات</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[11px] font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                        {s.revelationType}
                      </span>
                      {isMemorized && (
                        <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" />
                          متقنة
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-stone-100 flex items-center gap-2">
                    <button
                      onClick={() => onSelectSurahForRecitation(s.number)}
                      className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold py-2 rounded-xl text-center transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>تسميع صوتي</span>
                    </button>

                    <button
                      onClick={() => handleOpenReadingMode(s.number)}
                      className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition-colors cursor-pointer"
                      title="قراءة مع التفسير الميسر"
                    >
                      <BookOpen className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onPlaySurahAudio(s.number)}
                      className="p-2 bg-stone-100 hover:bg-stone-200 text-emerald-800 rounded-xl transition-colors cursor-pointer"
                      title="استماع لتلاوة السورة"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
};
