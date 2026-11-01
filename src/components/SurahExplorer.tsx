import React, { useCallback, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  Loader2,
  Mic,
  Search,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { ALL_SURAHS } from '../data/quranSurahsList';
import { getSurahWithAyahs } from '../data/quranData';
import { Surah, Ayah } from '../types/quran';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  PageHero,
  SectionCard,
} from './ui';
import { cn } from '../utils/cn';

interface SurahExplorerProps {
  onSelectSurahForRecitation: (surahNumber: number) => void;
  onPlaySurahAudio: (surahNumber: number) => void;
  onOpenTafsir: (ayah: Ayah) => void;
  completedSurahs: number[];
}

type SurahFilter = 'all' | 'juz30' | 'makki' | 'madani';

const FILTERS: Array<{ id: SurahFilter; label: string }> = [
  { id: 'all', label: 'جميع السور' },
  { id: 'juz30', label: 'جزء عمّ' },
  { id: 'makki', label: 'مكية' },
  { id: 'madani', label: 'مدنية' },
];

export const SurahExplorer: React.FC<SurahExplorerProps> = ({
  onSelectSurahForRecitation,
  onPlaySurahAudio,
  onOpenTafsir,
  completedSurahs,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<SurahFilter>('all');
  const [activeReadingSurah, setActiveReadingSurah] = useState<Surah | null>(null);
  const [isLoadingSurah, setIsLoadingSurah] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const filteredSurahs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return ALL_SURAHS.filter((surah) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        surah.name.includes(normalizedSearch) ||
        surah.englishName.toLowerCase().includes(normalizedSearch) ||
        surah.number.toString() === normalizedSearch;

      if (!matchesSearch) return false;

      if (filterType === 'juz30') return surah.number >= 78;
      if (filterType === 'makki') return surah.revelationType === 'مكية';
      if (filterType === 'madani') return surah.revelationType === 'مدنية';

      return true;
    });
  }, [searchTerm, filterType]);

  const completedSurahSet = useMemo(() => new Set(completedSurahs), [completedSurahs]);

  const openReadingMode = useCallback(async (surahNumber: number) => {
    setIsLoadingSurah(true);
    setLoadError(null);
    try {
      const fullSurah = await getSurahWithAyahs(surahNumber);
      setActiveReadingSurah(fullSurah);
    } catch (error) {
      console.error('Unable to load surah:', error);
      setLoadError('تعذّر تحميل السورة. تحقّق من اتصالك بالإنترنت ثم حاول مجددًا.');
    } finally {
      setIsLoadingSurah(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {activeReadingSurah ? (
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 bg-stone-50 p-6">
            <Button
              variant="secondary"
              size="sm"
              icon={<ArrowRight className="h-4 w-4" />}
              onClick={() => setActiveReadingSurah(null)}
            >
              العودة لفهرس السور
            </Button>

            <div className="text-center">
              <h2 className="font-serif text-xl font-bold text-stone-900">
                سورة {activeReadingSurah.name}
              </h2>
              <div className="mt-0.5 flex items-center justify-center gap-2 text-xs text-stone-500">
                <span>{activeReadingSurah.revelationType}</span>
                <span aria-hidden="true">·</span>
                <span>{activeReadingSurah.numberOfAyahs} آيات</span>
                <span aria-hidden="true">·</span>
                <span>الجزء {activeReadingSurah.juzStart}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                icon={<Mic className="h-4 w-4" />}
                onClick={() => onSelectSurahForRecitation(activeReadingSurah.number)}
              >
                تسميع بصوتك
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Volume2 className="h-4 w-4 text-emerald-700" />}
                onClick={() => onPlaySurahAudio(activeReadingSurah.number)}
              >
                استماع
              </Button>
            </div>
          </div>

          <div className="space-y-8 divide-y divide-stone-100 p-6 sm:p-10">
            {activeReadingSurah.ayahs.map((ayah) => (
              <div key={ayah.numberInSurah} className="space-y-4 pt-6 first:pt-0">
                <div className="text-right">
                  <div className="font-quran text-2xl leading-loose text-stone-900 sm:text-3xl">
                    {ayah.text}
                    <span className="mx-2 inline-flex h-8 w-8 select-none items-center justify-center rounded-full border border-emerald-700 text-sm font-bold text-emerald-800">
                      {ayah.numberInSurah}
                    </span>
                  </div>
                </div>

                {ayah.tafsir && (
                  <div className="space-y-2 rounded-2xl border border-emerald-100/80 bg-emerald-50/60 p-4 text-xs text-stone-700">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-900">
                        <BookOpen className="h-3.5 w-3.5 text-emerald-700" />
                        التفسير الميسر
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[11px] text-emerald-700"
                        onClick={() => onOpenTafsir(ayah)}
                      >
                        معاني الكلمات
                      </Button>
                    </div>
                    <p className="leading-relaxed text-stone-600">{ayah.tafsir}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <PageHero
            eyebrow="فهرس القرآن الكريم"
            icon={<Compass className="h-4 w-4" />}
            title="استكشف سور القرآن الكريم"
            description="١١٤ سورة بين يديك: استمع، اقرأ مع التفسير الميسر، أو ابدأ جلسة تسميع صوتية لسورة محددة."
          />

          <SectionCard bodyClassName="space-y-4">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="relative w-full sm:max-w-md">
                <Search className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-stone-400" />
                <input
                  type="search"
                  placeholder="ابحث باسم السورة (الفاتحة، الملك، يس...) أو برقمها..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-4 pr-10 text-xs text-stone-900 outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/25"
                  aria-label="البحث عن سورة"
                />
              </div>

              <div
                className="flex w-full items-center justify-center gap-1 rounded-xl bg-stone-100 p-1 sm:w-auto"
                role="tablist"
                aria-label="تصفية السور"
              >
                {FILTERS.map((filter) => {
                  const isActive = filterType === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setFilterType(filter.id)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600',
                        isActive
                          ? 'bg-white text-emerald-900 shadow-xs'
                          : 'text-stone-600 hover:text-stone-900',
                      )}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {loadError && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
                {loadError}
              </p>
            )}

            <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-500">
              <span>{filteredSurahs.length} سورة</span>
              {isLoadingSurah && (
                <span className="flex items-center gap-1.5 text-emerald-700" role="status">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  جارٍ تحميل السورة...
                </span>
              )}
            </div>
          </SectionCard>

          {filteredSurahs.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="لا توجد سور مطابقة"
              description="جرّب تعديل كلمة البحث أو اختيار تصنيف آخر."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterType('all');
                  }}
                >
                  إعادة ضبط البحث
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSurahs.map((surah) => {
                const isMemorized = completedSurahSet.has(surah.number);

                return (
                  <article
                    key={surah.number}
                    className="group flex flex-col justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs transition-colors hover:border-emerald-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-sm font-bold text-stone-700 transition-colors group-hover:bg-emerald-50 group-hover:text-emerald-800">
                          {surah.number}
                        </div>
                        <div>
                          <h3 className="font-serif text-base font-bold text-stone-900">
                            سورة {surah.name}
                          </h3>
                          <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                            <span>{surah.englishName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{surah.numberOfAyahs} آيات</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <Badge tone="stone">{surah.revelationType}</Badge>
                        {isMemorized && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-700">
                            <Check className="h-3 w-3" />
                            متقنة
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 border-t border-stone-100 pt-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        icon={<Mic className="h-3.5 w-3.5" />}
                        onClick={() => onSelectSurahForRecitation(surah.number)}
                      >
                        تسميع صوتي
                      </Button>
                      <IconButton
                        label="قراءة مع التفسير الميسر"
                        onClick={() => void openReadingMode(surah.number)}
                        disabled={isLoadingSurah}
                      >
                        <BookOpen className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="استماع لتلاوة السورة"
                        tone="emerald"
                        onClick={() => onPlaySurahAudio(surah.number)}
                      >
                        <Volume2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-stone-400">
            <Sparkles className="h-3.5 w-3.5" />
            نصوص القرآن والتفسير الميسر تُحمَّل من مصادر موثوقة عند توفر الاتصال.
          </p>
        </>
      )}
    </div>
  );
};
