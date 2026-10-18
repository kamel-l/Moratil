import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import { Ayah, Reciter, Surah } from '../types/quran';
import { getSurahWithAyahs } from '../data/quranData';
import { SurahMeta } from '../data/quranSurahsList';
import { getAyahAudioUrl, POPULAR_RECITERS } from '../utils/audioReciters';
import { removeOpeningBasmalah } from '../utils/arabicUtils';

interface MemorizationModeProps {
  allSurahs: SurahMeta[];
  selectedReciter: Reciter;
  onSelectReciter: (reciter: Reciter) => void;
}

interface PlaybackSession {
  ayahNumbers: number[];
  repetitions: number;
  ayahIndex: number;
  repetition: number;
}

function splitIntoUnits(ayahs: Ayah[], unitSize: number): Ayah[][] {
  const units: Ayah[][] = [];
  for (let index = 0; index < ayahs.length; index += unitSize) {
    units.push(ayahs.slice(index, index + unitSize));
  }
  return units;
}

export const MemorizationMode: React.FC<MemorizationModeProps> = ({
  allSurahs,
  selectedReciter,
  onSelectReciter,
}) => {
  const [surahNumber, setSurahNumber] = useState(1);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(7);
  const [unitSize, setUnitSize] = useState(2);
  const [repeatCount, setRepeatCount] = useState(3);
  const [hiddenAyahCount, setHiddenAyahCount] = useState(0);
  const [isFullRecitation, setIsFullRecitation] = useState(false);
  const [revealedAyahs, setRevealedAyahs] = useState<Set<number>>(() => new Set());
  const [playbackSession, setPlaybackSession] = useState<PlaybackSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError(null);

    getSurahWithAyahs(surahNumber)
      .then((loadedSurah) => {
        if (!isCurrent) return;
        setSurah(
          loadedSurah.number === 1
            ? loadedSurah
            : {
                ...loadedSurah,
                ayahs: loadedSurah.ayahs.map((ayah, index) =>
                  index === 0 ? { ...ayah, text: removeOpeningBasmalah(ayah.text) } : ayah,
                ),
              },
        );
        setStartAyah(1);
        setEndAyah(loadedSurah.ayahs.length);
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
  }, [surahNumber]);

  useEffect(() => {
    if (!playbackSession || !surah) return;

    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
      }
    },
    [],
  );

  const selectedAyahs = useMemo(
    () =>
      surah?.ayahs.filter(
        (ayah) => ayah.numberInSurah >= startAyah && ayah.numberInSurah <= endAyah,
      ) ?? [],
    [endAyah, startAyah, surah],
  );
  const units = useMemo(() => splitIntoUnits(selectedAyahs, unitSize), [selectedAyahs, unitSize]);

  const stopPlayback = () => {
    setPlaybackSession(null);
    setPlaybackError(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const playAyahs = (ayahs: Ayah[]) => {
    if (ayahs.length === 0) return;
    setPlaybackError(null);
    setPlaybackSession({
      ayahNumbers: ayahs.map((ayah) => ayah.numberInSurah),
      repetitions: repeatCount,
      ayahIndex: 0,
      repetition: 0,
    });
  };

  const updateSurah = (number: number) => {
    stopPlayback();
    setSurahNumber(number);
  };

  const updateRange = (start: number, end: number) => {
    stopPlayback();
    setStartAyah(start);
    setEndAyah(end);
    setHiddenAyahCount(0);
    setIsFullRecitation(false);
    setRevealedAyahs(new Set());
  };

  const toggleRevealedAyah = (ayahNumber: number) => {
    setRevealedAyahs((previous) => {
      const next = new Set(previous);
      if (next.has(ayahNumber)) next.delete(ayahNumber);
      else next.add(ayahNumber);
      return next;
    });
  };

  const maxAyah = surah?.ayahs.length ?? 1;

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
      <section className="rounded-3xl bg-emerald-950 px-6 py-7 text-white shadow-sm sm:px-9">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-900 p-3 text-amber-200">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-200">خطوة خطوة، آية آية</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">وضع الحفظ</h1>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-emerald-100">
          اختر مقطعك، استمع إلى وحداته القصيرة ورددها، ثم أخفِ الآيات تدريجيًا واختبر حفظك في تسميع
          كامل.
        </p>
      </section>

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
        <label className="space-y-2 text-sm font-semibold text-stone-700">
          من الآية
          <input
            type="number"
            min={1}
            max={maxAyah}
            value={startAyah}
            onChange={(event) =>
              updateRange(
                Math.min(maxAyah, Math.max(1, Number(event.target.value))),
                Math.max(endAyah, Math.min(maxAyah, Math.max(1, Number(event.target.value)))),
              )
            }
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
            onChange={(event) =>
              updateRange(
                Math.min(startAyah, Math.max(1, Number(event.target.value))),
                Math.min(maxAyah, Math.max(startAyah, Number(event.target.value))),
              )
            }
            disabled={isLoading || !surah}
            className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm"
          />
        </label>
        <label className="space-y-2 text-sm font-semibold text-stone-700">
          القارئ
          <select
            value={selectedReciter.id}
            onChange={(event) => {
              const reciter = POPULAR_RECITERS.find((item) => item.id === event.target.value);
              if (reciter) {
                stopPlayback();
                onSelectReciter(reciter);
              }
            }}
            className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
          >
            {POPULAR_RECITERS.map((reciter) => (
              <option key={reciter.id} value={reciter.id}>
                {reciter.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {isLoading && (
        <p className="rounded-xl border border-stone-200 bg-white p-4 text-center text-sm text-stone-600">
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
                المقطع: الآيات {startAyah.toLocaleString('ar-EG')}–{endAyah.toLocaleString('ar-EG')}
                {' · '}
                {selectedAyahs.length.toLocaleString('ar-EG')} آية
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-700">
                حجم الوحدة
                <select
                  value={unitSize}
                  onChange={(event) => setUnitSize(Number(event.target.value))}
                  className="bg-transparent py-2"
                  aria-label="عدد الآيات في كل وحدة"
                >
                  {[1, 2, 3, 4, 5].map((size) => (
                    <option key={size} value={size}>
                      {size.toLocaleString('ar-EG')} آية
                    </option>
                  ))}
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
                <h2 className="font-bold text-stone-900">وحدات الحفظ</h2>
                <p className="mt-1 text-xs text-stone-500">استمع إلى الوحدة وردد الآيات معها</p>
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

            {units.map((unit, unitIndex) => (
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
                  <button
                    type="button"
                    onClick={() => (playbackSession ? stopPlayback() : playAyahs(unit))}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-emerald-800 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                    aria-label={
                      playbackSession ? 'إيقاف التلاوة' : `استماع إلى الوحدة ${unitIndex + 1}`
                    }
                  >
                    {playbackSession ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Headphones className="h-4 w-4" />
                    )}
                    {playbackSession ? 'إيقاف' : 'استمع وردد'}
                  </button>
                </div>
                <div className="space-y-2">
                  {unit.map((ayah) => {
                    const passageIndex = ayah.numberInSurah - startAyah;
                    const isHidden =
                      isFullRecitation ||
                      passageIndex < hiddenAyahCount ||
                      revealedAyahs.has(ayah.numberInSurah);
                    const shouldMask = isFullRecitation
                      ? !revealedAyahs.has(ayah.numberInSurah)
                      : passageIndex < hiddenAyahCount && !revealedAyahs.has(ayah.numberInSurah);

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
                            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-[11px] font-semibold text-stone-600 hover:bg-stone-100"
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
              </article>
            ))}
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
                <button
                  type="button"
                  onClick={() => {
                    stopPlayback();
                    setIsFullRecitation(true);
                    setRevealedAyahs(new Set());
                  }}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Check className="h-4 w-4" />
                  ابدأ التسميع الكامل
                </button>
                <button
                  type="button"
                  onClick={() => (playbackSession ? stopPlayback() : playAyahs(selectedAyahs))}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
                >
                  {playbackSession ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {playbackSession ? 'إيقاف' : 'استمع للمقطع'}
                </button>
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
