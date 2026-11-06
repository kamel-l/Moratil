import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Headphones,
  LayoutList,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import { Ayah, Reciter, Riwaya, Surah } from '../types/quran';
import { getAyahPageNumber, getSurahWithAyahs } from '../data/quranData';
import { SurahMeta } from '../data/quranSurahsList';
import { getAyahAudioUrl, getRecitersByRiwaya, POPULAR_RECITERS } from '../utils/audioReciters';
import { removeOpeningBasmalah } from '../utils/arabicUtils';
import { Button, PageHero } from './ui';

// ═══════════════════════════════════════════════════════════════
// الأنواع والمساعدات
// ═══════════════════════════════════════════════════════════════
type UnitSize = number | 'page';
type DisplayMode = 'cards' | 'mushaf';

interface MemorizationModeProps {
  allSurahs: SurahMeta[];
  selectedReciter: Reciter;
  onSelectReciter: (reciter: Reciter) => void;
  riwaya: Riwaya; // ✅ الرواية الحالية لتحميل النص الصحيح
}

interface PlaybackSession {
  ayahNumbers: number[];
  repetitions: number;
  ayahIndex: number;
  repetition: number;
  scope: 'unit' | 'passage';
}

function pageOf(ayah: Ayah): number {
  const p =
    (ayah as { page?: number; pageNumber?: number }).page ??
    (ayah as { pageNumber?: number }).pageNumber;
  return typeof p === 'number' && p > 0 ? p : 1;
}

function arabicDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}

function groupByPage(ayahs: Ayah[]): Map<number, Ayah[]> {
  const map = new Map<number, Ayah[]>();
  for (const ayah of ayahs) {
    const page = pageOf(ayah);
    if (!map.has(page)) map.set(page, []);
    map.get(page)!.push(ayah);
  }
  return map;
}

function splitIntoUnits(ayahs: Ayah[], unitSize: number): Ayah[][] {
  const units: Ayah[][] = [];
  for (let index = 0; index < ayahs.length; index += unitSize) {
    units.push(ayahs.slice(index, index + unitSize));
  }
  return units;
}

// ═══════════════════════════════════════════════════════════════
// صفحة مصحف كاملة
// ═══════════════════════════════════════════════════════════════
interface MushafPageProps {
  ayahs: Ayah[];
  pageNumber: number;
  surahNumber: number;
  surahName: string;
  isFullRecitation: boolean;
  revealedAyahs: Set<number>;
  onToggleAyah: (ayahNumber: number) => void;
}

const MushafPage: React.FC<MushafPageProps> = ({
  ayahs,
  pageNumber,
  surahNumber,
  surahName,
  isFullRecitation,
  revealedAyahs,
  onToggleAyah,
}) => {
  const startsSurah = ayahs.some((a) => a.numberInSurah === 1);
  const showBasmalah = startsSurah && surahNumber !== 1 && surahNumber !== 9;

  const isMasked = (ayah: Ayah): boolean =>
    isFullRecitation && !revealedAyahs.has(ayah.numberInSurah);

  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="mb-2 flex items-center justify-center gap-2 text-[11px] font-medium text-stone-500">
        <span>صفحة {arabicDigits(pageNumber)}</span>
        <span className="text-stone-300">·</span>
        <span>سورة {surahName}</span>
      </div>

      <div className="rounded-sm bg-[#8b6f3a] p-[3px] shadow-lg">
        <div className="rounded-sm bg-[#f5e6c8] p-[3px]">
          <div className="rounded-sm border border-[#a08750] bg-[#fdfaf0] px-4 py-5 sm:px-7 sm:py-6">
            {startsSurah && (
              <div className="mb-3 flex items-center justify-center">
                <div className="inline-flex items-center gap-2 rounded-sm bg-[#8b6f3a] px-4 py-1 text-[#fdfaf0] shadow-sm">
                  <span className="text-sm">۞</span>
                  <span className="font-serif text-sm font-bold sm:text-base">
                    سورة {surahName}
                  </span>
                  <span className="text-sm">۞</span>
                </div>
              </div>
            )}

            {showBasmalah && (
              <div className="mb-3 text-center font-quran text-lg text-[#5a4a25] sm:text-xl">
                بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
              </div>
            )}

            <div
              dir="rtl"
              className="font-quran text-stone-900"
              style={{
                fontSize: '1.3rem',
                lineHeight: 2.35,
                textAlign: 'justify',
                textAlignLast: 'center',
              }}
            >
              {ayahs.map((ayah) => {
                const masked = isMasked(ayah);
                return (
                  <React.Fragment key={ayah.numberInSurah}>
                    <span
                      className={
                        masked
                          ? 'select-none opacity-70 blur-sm transition-all duration-200'
                          : 'transition-all duration-200'
                      }
                    >
                      {ayah.text}
                    </span>{' '}
                    <button
                      type="button"
                      onClick={() => onToggleAyah(ayah.numberInSurah)}
                      title={masked ? 'اكشف الآية' : 'أخفِ الآية'}
                      aria-label={`الآية ${ayah.numberInSurah} — ${masked ? 'اكشف' : 'أخفِ'}`}
                      className="mx-0.5 inline-flex items-center justify-center rounded-full align-middle transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold text-[#6b5025] ${
                          masked ? 'border-[#a08750] bg-[#fbe5b8]' : 'border-[#a08750] bg-[#fdfaf0]'
                        }`}
                        style={{ boxShadow: 'inset 0 0 0 1px #a08750' }}
                      >
                        {arabicDigits(ayah.numberInSurah)}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-center gap-1.5 font-serif text-sm text-[#8b6f3a]">
              <span className="text-base">﴿</span>
              <span className="font-bold">{arabicDigits(pageNumber)}</span>
              <span className="text-base">﴾</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// مقطع مصحف متصل
// ═══════════════════════════════════════════════════════════════
interface MushafPassageProps {
  ayahs: Ayah[];
  startAyah: number;
  isFullRecitation: boolean;
  hiddenAyahCount: number;
  revealedAyahs: Set<number>;
  onToggleAyah: (ayahNumber: number) => void;
  compact?: boolean;
}

const MushafPassage: React.FC<MushafPassageProps> = ({
  ayahs,
  startAyah,
  isFullRecitation,
  hiddenAyahCount,
  revealedAyahs,
  onToggleAyah,
  compact = false,
}) => {
  const shouldMask = (ayah: Ayah): boolean => {
    if (isFullRecitation) return !revealedAyahs.has(ayah.numberInSurah);
    const passageIndex = ayah.numberInSurah - startAyah;
    return passageIndex < hiddenAyahCount && !revealedAyahs.has(ayah.numberInSurah);
  };

  const hasMasked = ayahs.some((a) => shouldMask(a));

  return (
    <div
      className={`relative rounded-xl border-[3px] border-double border-amber-700/60 bg-[#fdf8e7] shadow-inner ${
        compact ? 'px-3 py-3' : 'px-4 py-5 sm:px-6 sm:py-6'
      }`}
    >
      <span
        className="pointer-events-none absolute top-1 right-1.5 select-none text-xs text-amber-700/40"
        aria-hidden="true"
      >
        ۞
      </span>
      <span
        className="pointer-events-none absolute top-1 left-1.5 select-none text-xs text-amber-700/40"
        aria-hidden="true"
      >
        ۞
      </span>
      <span
        className="pointer-events-none absolute bottom-1 right-1.5 select-none text-xs text-amber-700/40"
        aria-hidden="true"
      >
        ۞
      </span>
      <span
        className="pointer-events-none absolute bottom-1 left-1.5 select-none text-xs text-amber-700/40"
        aria-hidden="true"
      >
        ۞
      </span>

      <div
        dir="rtl"
        className={`font-quran text-stone-900 ${
          compact ? 'text-xl leading-[2.2] sm:text-2xl' : 'text-2xl leading-[2.5] sm:text-[1.75rem]'
        }`}
      >
        {ayahs.map((ayah) => {
          const masked = shouldMask(ayah);
          return (
            <React.Fragment key={ayah.numberInSurah}>
              <span className={masked ? 'select-none opacity-80 blur-sm' : ''}>{ayah.text}</span>
              <button
                type="button"
                onClick={() => onToggleAyah(ayah.numberInSurah)}
                title={masked ? 'اكشف الآية' : 'أخفِ الآية'}
                aria-label={`الآية ${ayah.numberInSurah} — ${masked ? 'اكشف' : 'أخفِ'}`}
                className={`mx-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1 align-middle text-[10px] font-bold transition-colors ${
                  masked
                    ? 'border-amber-700 bg-amber-100 text-amber-900 hover:bg-amber-200'
                    : 'border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                {arabicDigits(ayah.numberInSurah)}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {hasMasked && (
        <p className="mt-2 text-center text-[10px] text-amber-800/70">
          اضغط على رقم الآية لكشفها أو إخفائها
        </p>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// المكوّن الرئيسي
// ═══════════════════════════════════════════════════════════════
export const MemorizationMode: React.FC<MemorizationModeProps> = ({
  allSurahs,
  selectedReciter,
  onSelectReciter,
  riwaya,
}) => {
  const [surahNumber, setSurahNumber] = useState(1);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(7);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [unitSize, setUnitSize] = useState<UnitSize>('page');
  const [repeatCount, setRepeatCount] = useState(3);
  const [hiddenAyahCount, setHiddenAyahCount] = useState(0);
  const [isFullRecitation, setIsFullRecitation] = useState(false);
  const [revealedAyahs, setRevealedAyahs] = useState<Set<number>>(() => new Set());
  const [displayMode, setDisplayMode] = useState<DisplayMode>('mushaf');
  const [playbackSession, setPlaybackSession] = useState<PlaybackSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageMetadataError, setPageMetadataError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // ✅ قرّاء متوافقون مع الرواية الحالية
  const reciterPool = useMemo<Reciter[]>(() => {
    const pool = getRecitersByRiwaya(riwaya);
    return pool.length > 0 ? pool : POPULAR_RECITERS;
  }, [riwaya]);

  // ─────── تحميل السورة (مع الرواية) ───────
  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError(null);
    setPageMetadataError(null);

    // إيقاف أي تشغيل سابق فورًا عند تغيير السورة أو الرواية
    setPlaybackSession(null);
    setPlaybackError(null);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    getSurahWithAyahs(surahNumber, riwaya) // ✅ تمرير الرواية
      .then(async (loadedSurah) => {
        if (!isCurrent) return;
        const prepared: Surah =
          loadedSurah.number === 1
            ? loadedSurah
            : {
                ...loadedSurah,
                ayahs: loadedSurah.ayahs.map((ayah, index) =>
                  index === 0 ? { ...ayah, text: removeOpeningBasmalah(ayah.text) } : ayah,
                ),
              };
        let surahWithPages = prepared;
        if (prepared.ayahs.some((ayah) => typeof ayah.page !== 'number')) {
          try {
            const firstAyahWithoutPage = prepared.ayahs.find(
              (ayah) => typeof ayah.page !== 'number',
            );
            if (firstAyahWithoutPage) {
              await getAyahPageNumber(surahNumber, firstAyahWithoutPage.numberInSurah);
              const ayahs = await Promise.all(
                prepared.ayahs.map(async (ayah) => ({
                  ...ayah,
                  page:
                    typeof ayah.page === 'number'
                      ? ayah.page
                      : await getAyahPageNumber(surahNumber, ayah.numberInSurah),
                })),
              );
              surahWithPages = { ...prepared, ayahs };
            }
          } catch (error) {
            console.error('Unable to load Quran page numbers for memorization:', error);
            if (isCurrent) {
              setPageMetadataError(
                'تعذر تحميل أرقام صفحات المصحف. تحقق من اتصالك بالإنترنت أو اختر عددًا من الآيات لكل وحدة.',
              );
            }
          }
        }

        if (!isCurrent) return;
        setSurah(surahWithPages);

        const pages = [...new Set(surahWithPages.ayahs.map(pageOf))].sort((a, b) => a - b);
        setStartAyah(1);
        setEndAyah(surahWithPages.ayahs.length);
        setStartPage(pages[0] ?? 1);
        setEndPage(pages[pages.length - 1] ?? 1);

        setHiddenAyahCount(0);
        setIsFullRecitation(false);
        setRevealedAyahs(new Set());
      })
      .catch((error: unknown) => {
        console.error('Unable to load surah for memorization:', error);
        if (isCurrent) {
          setSurah(null);
          setLoadError('تعذر تحميل السورة. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.');
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [surahNumber, riwaya]);

  // ─────── تشغيل الصوت ───────
  useEffect(() => {
    if (!playbackSession || !surah) return;
    const audio = audioRef.current;
    if (!audio) return;

    const ayahNumber = playbackSession.ayahNumbers[playbackSession.ayahIndex];
    audio.src = getAyahAudioUrl(selectedReciter.id, surah.number, ayahNumber);
    audio.onended = () => {
      if (playbackSession.ayahIndex + 1 < playbackSession.ayahNumbers.length) {
        setPlaybackSession({ ...playbackSession, ayahIndex: playbackSession.ayahIndex + 1 });
      } else if (playbackSession.repetition + 1 < playbackSession.repetitions) {
        setPlaybackSession({
          ...playbackSession,
          ayahIndex: 0,
          repetition: playbackSession.repetition + 1,
        });
      } else {
        setPlaybackSession(null);
      }
    };
    audio.onerror = () => {
      setPlaybackError('تعذر تشغيل التلاوة. جرّب قارئًا آخر أو تحقق من اتصالك بالإنترنت.');
      setPlaybackSession(null);
    };

    void audio.play().catch((error: unknown) => {
      console.warn('Unable to play memorization audio:', error);
      setPlaybackError('تعذر بدء التلاوة. تحقق من اتصالك بالإنترنت وحاول مجددًا.');
      setPlaybackSession(null);
    });

    return () => {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
    };
  }, [playbackSession, selectedReciter.id, surah]);

  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
      }
    },
    [],
  );

  // ─────── المشتقات ───────
  const surahPages = useMemo<number[]>(() => {
    if (!surah) return [];
    return [...new Set(surah.ayahs.map(pageOf))].sort((a, b) => a - b);
  }, [surah]);

  const selectedAyahs = useMemo<Ayah[]>(() => {
    if (!surah) return [];
    if (unitSize === 'page') {
      return surah.ayahs.filter((a) => {
        const p = pageOf(a);
        return p >= startPage && p <= endPage;
      });
    }
    return surah.ayahs.filter((a) => a.numberInSurah >= startAyah && a.numberInSurah <= endAyah);
  }, [surah, unitSize, startPage, endPage, startAyah, endAyah]);

  const units = useMemo(
    () => (typeof unitSize === 'number' ? splitIntoUnits(selectedAyahs, unitSize) : []),
    [selectedAyahs, unitSize],
  );

  const pageGroups = useMemo(() => {
    if (unitSize !== 'page') return [] as Array<[number, Ayah[]]>;
    return Array.from(groupByPage(selectedAyahs).entries()).sort(([a], [b]) => a - b);
  }, [selectedAyahs, unitSize]);

  const firstAyahInRange = selectedAyahs[0]?.numberInSurah ?? startAyah;
  const maxAyah = surah?.ayahs.length ?? 1;
  const isPageMode = unitSize === 'page';

  // ─────── إجراءات ───────
  const stopPlayback = useCallback(() => {
    setPlaybackSession(null);
    setPlaybackError(null);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  const playAyahs = (ayahs: Ayah[], scope: PlaybackSession['scope']) => {
    if (ayahs.length === 0) return;
    setPlaybackError(null);
    setPlaybackSession({
      ayahNumbers: ayahs.map((a) => a.numberInSurah),
      repetitions: repeatCount,
      ayahIndex: 0,
      repetition: 0,
      scope,
    });
  };

  const updateSurah = (number: number) => {
    stopPlayback();
    setSurahNumber(number);
  };

  const updateAyahRange = (start: number, end: number) => {
    stopPlayback();
    setStartAyah(start);
    setEndAyah(end);
    setHiddenAyahCount(0);
    setIsFullRecitation(false);
    setRevealedAyahs(new Set());
  };

  const updatePageRange = (start: number, end: number) => {
    stopPlayback();
    setStartPage(start);
    setEndPage(end);
    setHiddenAyahCount(0);
    setIsFullRecitation(false);
    setRevealedAyahs(new Set());
  };

  const handleUnitSizeChange = (value: string) => {
    stopPlayback();
    setHiddenAyahCount(0);
    setIsFullRecitation(false);
    setRevealedAyahs(new Set());

    if (value === 'page') {
      setUnitSize('page');
      setDisplayMode('mushaf');
    } else {
      setUnitSize(Number(value));
    }
  };

  const toggleRevealedAyah = (ayahNumber: number) => {
    setRevealedAyahs((previous) => {
      const next = new Set(previous);
      if (next.has(ayahNumber)) next.delete(ayahNumber);
      else next.add(ayahNumber);
      return next;
    });
  };

  const activeScope = playbackSession?.scope ?? null;
  const activeUnitStart = activeScope === 'unit' ? playbackSession?.ayahNumbers[0] : undefined;

  // ═══════════════════════════════════════════════════════════
  // الواجهة
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
      <audio ref={audioRef} preload="metadata" className="hidden" />

      <PageHero
        eyebrow="خطوة خطوة، آية آية"
        icon={<BookOpen className="h-4 w-4" />}
        title="وضع الحفظ"
        description="اختر مقطعك، استمع إلى وحداته القصيرة ورددها، ثم أخفِ الآيات تدريجيًا واختبر حفظك في تسميع كامل."
      />

      <section className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-2 text-sm font-semibold text-stone-700">
          السورة
          <select
            value={surahNumber}
            onChange={(event) => updateSurah(Number(event.target.value))}
            className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
          >
            {allSurahs.map((item) => (
              <option key={item.number} value={item.number}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        {isPageMode ? (
          <>
            <label className="space-y-2 text-sm font-semibold text-stone-700">
              من الصفحة
              <select
                value={startPage}
                onChange={(event) => {
                  const v = Number(event.target.value);
                  updatePageRange(v, Math.max(v, endPage));
                }}
                disabled={isLoading || !surah || surahPages.length === 0}
                className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
              >
                {surahPages.map((p) => (
                  <option key={p} value={p}>
                    {p.toLocaleString('ar-EG')}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold text-stone-700">
              إلى الصفحة
              <select
                value={endPage}
                onChange={(event) => {
                  const v = Number(event.target.value);
                  updatePageRange(Math.min(startPage, v), v);
                }}
                disabled={isLoading || !surah || surahPages.length === 0}
                className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
              >
                {surahPages.map((p) => (
                  <option key={p} value={p}>
                    {p.toLocaleString('ar-EG')}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="space-y-2 text-sm font-semibold text-stone-700">
              من الآية
              <input
                type="number"
                min={1}
                max={maxAyah}
                value={startAyah}
                onChange={(event) => {
                  const v = Math.min(maxAyah, Math.max(1, Number(event.target.value)));
                  updateAyahRange(v, Math.max(endAyah, v));
                }}
                disabled={isLoading || !surah}
                className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-stone-700">
              إلى الآية
              <input
                type="number"
                min={startAyah}
                max={maxAyah}
                value={endAyah}
                onChange={(event) => {
                  const v = Math.min(maxAyah, Math.max(startAyah, Number(event.target.value)));
                  updateAyahRange(Math.min(startAyah, v), v);
                }}
                disabled={isLoading || !surah}
                className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm"
              />
            </label>
          </>
        )}

        <label className="space-y-2 text-sm font-semibold text-stone-700">
          القارئ
          <select
            value={selectedReciter.id}
            onChange={(event) => {
              const reciter = reciterPool.find((item) => item.id === event.target.value);
              if (reciter) {
                stopPlayback();
                onSelectReciter(reciter);
              }
            }}
            className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
          >
            {reciterPool.map((reciter) => (
              <option key={reciter.id} value={reciter.id}>
                {reciter.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {isLoading && (
        <p
          className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-4 text-center text-sm text-stone-600"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
          جارٍ تحميل آيات السورة...
        </p>
      )}
      {loadError && (
        <p
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {loadError}
        </p>
      )}

      {surah && !isLoading && (
        <>
          <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-stone-900">سورة {surah.name}</h2>
              <p className="mt-1 text-sm text-stone-500">
                {isPageMode ? (
                  <>
                    الصفحات: {arabicDigits(startPage)}–{arabicDigits(endPage)}
                    {' · '}
                    {selectedAyahs.length.toLocaleString('ar-EG')} آية
                    {' · '}
                    {pageGroups.length.toLocaleString('ar-EG')} صفحة
                  </>
                ) : (
                  <>
                    المقطع: الآيات {startAyah.toLocaleString('ar-EG')}–
                    {endAyah.toLocaleString('ar-EG')}
                    {' · '}
                    {selectedAyahs.length.toLocaleString('ar-EG')} آية
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-700">
                حجم الوحدة
                <select
                  value={unitSize === 'page' ? 'page' : String(unitSize)}
                  onChange={(event) => handleUnitSizeChange(event.target.value)}
                  className="bg-transparent py-2"
                  aria-label="عدد الآيات في كل وحدة أو صفحة كاملة"
                >
                  {[1, 2, 3, 4, 5].map((size) => (
                    <option key={size} value={String(size)}>
                      {size.toLocaleString('ar-EG')} آية
                    </option>
                  ))}
                  <option value="page">صفحة كاملة</option>
                </select>
              </label>
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-700">
                تكرار الاستماع
                <select
                  value={repeatCount}
                  onChange={(event) => setRepeatCount(Number(event.target.value))}
                  className="bg-transparent py-2"
                  aria-label="عدد مرات تكرار الاستماع"
                >
                  {[1, 3, 5].map((count) => (
                    <option key={count} value={count}>
                      {count.toLocaleString('ar-EG')} مرات
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-stone-900">
                  {isPageMode ? 'صفحات المصحف' : 'وحدات الحفظ'}
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  {isPageMode
                    ? 'عرض الصفحات كما في المصحف المطبوع — اضغط رقم الآية للكشف أو الإخفاء'
                    : displayMode === 'cards'
                      ? 'استمع إلى الوحدة وردد الآيات معها'
                      : 'عرض النص كصفحة مصحف — اضغط رقم الآية للكشف أو الإخفاء'}
                </p>
              </div>

              {!isPageMode && (
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="flex items-center rounded-lg border border-stone-200 bg-stone-50 p-0.5"
                    role="group"
                    aria-label="طريقة عرض الآيات"
                  >
                    <button
                      type="button"
                      onClick={() => setDisplayMode('cards')}
                      aria-pressed={displayMode === 'cards'}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-colors ${
                        displayMode === 'cards'
                          ? 'bg-white text-emerald-800 shadow-sm'
                          : 'text-stone-500 hover:text-stone-800'
                      }`}
                      title="عرض بطاقات منفصلة"
                    >
                      <LayoutList className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">بطاقات</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplayMode('mushaf')}
                      aria-pressed={displayMode === 'mushaf'}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-colors ${
                        displayMode === 'mushaf'
                          ? 'bg-white text-emerald-800 shadow-sm'
                          : 'text-stone-500 hover:text-stone-800'
                      }`}
                      title="عرض كصفحة مصحف متصلة"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">مصحف</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setHiddenAyahCount((count) => Math.min(selectedAyahs.length, count + 1))
                    }
                    disabled={hiddenAyahCount >= selectedAyahs.length}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <EyeOff className="h-4 w-4" />
                    إخفاء آية أخرى
                  </button>
                </div>
              )}

              {isPageMode && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>وضع صفحة كاملة</span>
                </div>
              )}
            </div>

            {isPageMode ? (
              <div className="space-y-6">
                {pageMetadataError ? (
                  <p
                    className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
                    role="alert"
                  >
                    {pageMetadataError}
                  </p>
                ) : (
                  pageGroups.map(([pageNumber, pageAyahs]) => {
                    const isPagePlaying =
                      activeScope === 'unit' && activeUnitStart === pageAyahs[0].numberInSurah;
                    return (
                      <article
                        key={pageNumber}
                        className="rounded-2xl border border-stone-200 bg-white p-3 shadow-xs sm:p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-[11px] font-bold text-amber-800">
                              {arabicDigits(pageNumber)}
                            </span>
                            <h3 className="text-sm font-bold text-emerald-900">
                              صفحة {arabicDigits(pageNumber)}
                              <span className="mr-2 font-normal text-stone-500">
                                الآيات {pageAyahs[0].numberInSurah.toLocaleString('ar-EG')}–
                                {pageAyahs[pageAyahs.length - 1].numberInSurah.toLocaleString(
                                  'ar-EG',
                                )}
                              </span>
                            </h3>
                          </div>
                          <Button
                            size="sm"
                            variant={isPagePlaying ? 'danger' : 'primary'}
                            icon={
                              isPagePlaying ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Headphones className="h-4 w-4" />
                              )
                            }
                            onClick={() => {
                              if (isPagePlaying) stopPlayback();
                              else playAyahs(pageAyahs, 'unit');
                            }}
                            aria-label={
                              isPagePlaying ? 'إيقاف التلاوة' : `استماع إلى صفحة ${pageNumber}`
                            }
                          >
                            {isPagePlaying ? 'إيقاف' : 'استمع للصفحة'}
                          </Button>
                        </div>

                        <MushafPage
                          ayahs={pageAyahs}
                          pageNumber={pageNumber}
                          surahNumber={surah.number}
                          surahName={surah.name}
                          isFullRecitation={isFullRecitation}
                          revealedAyahs={revealedAyahs}
                          onToggleAyah={toggleRevealedAyah}
                        />
                      </article>
                    );
                  })
                )}
              </div>
            ) : isFullRecitation && displayMode === 'mushaf' ? (
              <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-emerald-900">تسميع المقطع كاملًا</h3>
                  <span className="text-xs text-stone-500">
                    الآيات {startAyah.toLocaleString('ar-EG')}–{endAyah.toLocaleString('ar-EG')}
                  </span>
                </div>
                <MushafPassage
                  ayahs={selectedAyahs}
                  startAyah={firstAyahInRange}
                  isFullRecitation={isFullRecitation}
                  hiddenAyahCount={hiddenAyahCount}
                  revealedAyahs={revealedAyahs}
                  onToggleAyah={toggleRevealedAyah}
                />
              </article>
            ) : (
              units.map((unit, unitIndex) => {
                const isUnitPlaying =
                  activeScope === 'unit' && activeUnitStart === unit[0].numberInSurah;

                return (
                  <article
                    key={unit[0].numberInSurah}
                    className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs sm:p-5"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-emerald-900">
                        الوحدة {(unitIndex + 1).toLocaleString('ar-EG')}
                        <span className="mr-2 font-normal text-stone-500">
                          الآيات {unit[0].numberInSurah.toLocaleString('ar-EG')}–
                          {unit[unit.length - 1].numberInSurah.toLocaleString('ar-EG')}
                        </span>
                      </h3>
                      <Button
                        size="sm"
                        variant={isUnitPlaying ? 'danger' : 'primary'}
                        icon={
                          isUnitPlaying ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Headphones className="h-4 w-4" />
                          )
                        }
                        onClick={() => {
                          if (isUnitPlaying) stopPlayback();
                          else playAyahs(unit, 'unit');
                        }}
                        aria-label={
                          isUnitPlaying ? 'إيقاف التلاوة' : `استماع إلى الوحدة ${unitIndex + 1}`
                        }
                      >
                        {isUnitPlaying ? 'إيقاف' : 'استمع وردد'}
                      </Button>
                    </div>

                    {displayMode === 'cards' ? (
                      <div className="space-y-2">
                        {unit.map((ayah) => {
                          const passageIndex = ayah.numberInSurah - startAyah;
                          const isHidden =
                            isFullRecitation ||
                            passageIndex < hiddenAyahCount ||
                            revealedAyahs.has(ayah.numberInSurah);
                          const shouldMask = isFullRecitation
                            ? !revealedAyahs.has(ayah.numberInSurah)
                            : passageIndex < hiddenAyahCount &&
                              !revealedAyahs.has(ayah.numberInSurah);

                          return (
                            <div
                              key={ayah.numberInSurah}
                              className="flex items-start gap-3 rounded-xl bg-stone-50 p-3 sm:p-4"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-xs font-bold text-emerald-800">
                                {ayah.numberInSurah.toLocaleString('ar-EG')}
                              </span>
                              <p
                                className={`font-quran flex-1 text-right text-xl leading-[2.2] text-stone-900 sm:text-2xl ${
                                  shouldMask ? 'select-none blur-sm' : ''
                                }`}
                              >
                                {ayah.text}
                              </p>
                              {isHidden && (
                                <button
                                  type="button"
                                  onClick={() => toggleRevealedAyah(ayah.numberInSurah)}
                                  className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-[11px] font-semibold text-stone-600 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                                  aria-label={shouldMask ? 'إظهار الآية' : 'إخفاء الآية'}
                                >
                                  {shouldMask ? (
                                    <Eye className="h-3.5 w-3.5" />
                                  ) : (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  )}
                                  {shouldMask ? 'أظهر' : 'أخفِ'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <MushafPassage
                        ayahs={unit}
                        startAyah={startAyah}
                        isFullRecitation={isFullRecitation}
                        hiddenAyahCount={hiddenAyahCount}
                        revealedAyahs={revealedAyahs}
                        onToggleAyah={toggleRevealedAyah}
                        compact
                      />
                    )}
                  </article>
                );
              })
            )}
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-emerald-900">
                  <Volume2 className="h-5 w-5" />
                  <h2 className="font-bold">تسميع المقطع كاملًا</h2>
                </div>
                <p className="mt-1 text-sm leading-6 text-emerald-900/80">
                  أخفِ المقطع وحاول تسميعه من ذاكرتك، ثم اكشف الآيات لمراجعة حفظك.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  icon={<Check className="h-4 w-4" />}
                  onClick={() => {
                    stopPlayback();
                    setIsFullRecitation(true);
                    setRevealedAyahs(new Set());
                    if (isPageMode) setDisplayMode('mushaf');
                  }}
                >
                  ابدأ التسميع الكامل
                </Button>
                <Button
                  variant="secondary"
                  icon={
                    activeScope === 'passage' ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )
                  }
                  onClick={() => {
                    if (activeScope === 'passage') stopPlayback();
                    else playAyahs(selectedAyahs, 'passage');
                  }}
                >
                  {activeScope === 'passage' ? 'إيقاف' : 'استمع للمقطع'}
                </Button>
              </div>
            </div>
            {(isFullRecitation || hiddenAyahCount > 0) && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-emerald-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsFullRecitation(false);
                    setHiddenAyahCount(0);
                    setRevealedAyahs(new Set());
                  }}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                >
                  <RotateCcw className="h-4 w-4" />
                  العودة إلى الحفظ
                </button>
                {isFullRecitation && (
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedAyahs(new Set(selectedAyahs.map((ayah) => ayah.numberInSurah)))
                    }
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                  >
                    <Eye className="h-4 w-4" />
                    اكشف الإجابات
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {playbackError && (
        <p
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {playbackError}
        </p>
      )}
    </div>
  );
};
