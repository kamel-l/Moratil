import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen,
  Mic,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertTriangle,
  BookMarked,
  Layers,
} from 'lucide-react';
import { ALL_SURAHS } from '../data/quranSurahsList';
import { getSurahWithAyahsByRiwayah } from '../data/riwayahData';
import { getAyahPages } from '../data/mushafPages';
import { RIWAYAT, riwayahFontFamily, ensureRiwayahFont } from '../data/riwayahConfig';
import {
  buildAyahUnits,
  findUnitIndexForAyah,
  unitLabel,
  DisplayUnit,
} from '../utils/displayUnits';
import { DisplayUnitControl } from './ui/DisplayUnitControl';
import { Ayah, Surah, RiwayahKey } from '../types/quran';

/** أرقام عربية-هندية لعرض أرقام الآيات والصفحات كما في المصحف. */
const toArabicNumber = (value: number) => value.toLocaleString('ar-EG');

interface MemorizationProps {
  riwayah: RiwayahKey;
  onStartReciting: (surahNumber: number, ayahNumber: number) => void;
  onOpenTafsir: (ayah: Ayah) => void;
}

export const Memorization: React.FC<MemorizationProps> = ({
  riwayah,
  onStartReciting,
  onOpenTafsir,
}) => {
  const [surahNumber, setSurahNumber] = useState(1);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<DisplayUnit>('page');
  const [unitIndex, setUnitIndex] = useState(0);
  const [pages, setPages] = useState<number[] | null>(null);

  const info = RIWAYAT[riwayah];
  const isHafs = riwayah === 'hafs';

  useEffect(() => {
    ensureRiwayahFont(riwayah);
  }, [riwayah]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    getSurahWithAyahsByRiwayah(surahNumber, riwayah)
      .then((data) => {
        if (isMounted) setSurah(data);
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setSurah(null);
          setError(err instanceof Error ? err.message : 'تعذّر تحميل السورة.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [surahNumber, riwayah]);

  // Mushaf page numbers are only needed for the "full page" display unit.
  useEffect(() => {
    let isMounted = true;
    setPages(null);
    getAyahPages(surahNumber, riwayah)
      .then((data) => {
        if (isMounted) setPages(data);
      })
      .catch(() => {
        if (isMounted) setPages(null);
      });
    return () => {
      isMounted = false;
    };
  }, [surahNumber, riwayah]);

  useEffect(() => {
    setUnitIndex(0);
  }, [surahNumber, riwayah]);

  const ayahCount = surah?.ayahs.length ?? 0;

  const units = useMemo(
    () => buildAyahUnits(ayahCount, unit, pages ?? undefined),
    [ayahCount, unit, pages],
  );

  const activeUnit = units[unitIndex];
  const visibleAyahs = useMemo(
    () => (surah && activeUnit ? surah.ayahs.slice(activeUnit.startIndex, activeUnit.endIndex + 1) : []),
    [surah, activeUnit],
  );

  const handleUnitChange = (nextUnit: DisplayUnit) => {
    const anchor = units[unitIndex]?.startIndex ?? 0;
    setUnit(nextUnit);
    setUnitIndex(findUnitIndexForAyah(buildAyahUnits(ayahCount, nextUnit, pages ?? undefined), anchor));
  };

  const quranFontStyle = useMemo(
    () => (isHafs ? undefined : { fontFamily: riwayahFontFamily(riwayah) }),
    [isHafs, riwayah],
  );

  // وضع «صفحة المصحف» يستخدم خطّ الرواية مباشرة ليعطي مظهر المصحف الحقيقي.
  const mushafFontStyle = useMemo(
    () => ({ fontFamily: riwayahFontFamily(riwayah) }),
    [riwayah],
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Hero Header */}
      <div className="bg-brand-gradient text-white rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-gold-200 bg-white/5 border border-gold-400/30 px-3 py-1 rounded-full">
            <BookMarked className="w-3.5 h-3.5" />
            الحفظ والقراءة
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-3">
            احفظ واقرأ بالرواية التي تريد
          </h1>
          <p className="text-sm sm:text-base text-jade-100/75 leading-relaxed mt-2">
            اختر السورة واقرأ نصّها كاملاً كما في المصحف، ثم انتقل إلى التسميع الصوتي لنفس الرواية.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-jade-950 bg-gold-400 px-3 py-1.5 rounded-full">
              <Layers className="w-3.5 h-3.5" />
              {info.fullName}
            </span>
            <span className="text-[11px] text-jade-100/60">
              {info.ayahCount.toLocaleString('ar-EG')} آية في هذه الرواية
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setSurahNumber((n) => Math.max(1, n - 1))}
              disabled={surahNumber <= 1}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-jade-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="السورة السابقة"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <select
              value={surahNumber}
              onChange={(e) => setSurahNumber(Number(e.target.value))}
              style={{ colorScheme: 'dark' }}
              className="min-w-0 flex-1 sm:flex-initial bg-white/5 border border-white/15 text-white rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gold-400 cursor-pointer"
            >
              {ALL_SURAHS.map((s) => (
                <option key={s.number} value={s.number} className="bg-jade-900 text-white">
                  {s.number}. سورة {s.name}
                  {isHafs ? ` (${s.numberOfAyahs} آيات)` : ''}
                </option>
              ))}
            </select>

            <button
              onClick={() => setSurahNumber((n) => Math.min(114, n + 1))}
              disabled={surahNumber >= 114}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-jade-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="السورة التالية"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          {surah && (
            <button
              onClick={() => onStartReciting(surah.number, 1)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gold-400 hover:bg-gold-300 text-jade-950 font-bold px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-gold-500/20 cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              <span>تسميع السورة</span>
            </button>
          )}
        </div>

        {surah && units.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <DisplayUnitControl value={unit} onChange={handleUnitChange} />

            <div className="flex items-center gap-2">
              <button
                onClick={() => setUnitIndex((i) => Math.max(0, i - 1))}
                disabled={unitIndex <= 0}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-jade-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="المقطع السابق"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="min-w-32 text-center text-xs font-semibold text-jade-100/80">
                {unitLabel(activeUnit)}
                <span className="text-jade-100/45">
                  {' '}
                  · {unitIndex + 1}/{units.length}
                </span>
              </span>

              <button
                onClick={() => setUnitIndex((i) => Math.min(units.length - 1, i + 1))}
                disabled={unitIndex >= units.length - 1}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-jade-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="المقطع التالي"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Surah content */}
      {isLoading && (
        <div className="glass-panel rounded-2xl p-10 flex flex-col items-center gap-3 text-jade-100/70">
          <Loader2 className="w-6 h-6 animate-spin text-gold-300" />
          <span className="text-sm">جارٍ تحميل نصّ السورة برواية {info.label}…</span>
        </div>
      )}

      {!isLoading && error && (
        <div className="glass-panel rounded-2xl p-6 flex items-start gap-3 border border-rose-400/30">
          <AlertTriangle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-200/90">
            <p className="font-bold">تعذّر تحميل السورة</p>
            <p className="text-rose-200/70 mt-1">{error}</p>
          </div>
        </div>
      )}

      {!isLoading && !error && surah && (
        <motion.div
          key={`${riwayah}-${surah.number}-${unit === 'page' ? `p${unitIndex}` : 'blocks'}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className={unit === 'page' ? 'mushaf-page' : 'glass-panel rounded-3xl overflow-hidden'}
        >
          {unit === 'page' ? (
            <div className="mushaf-page-inner">
              <div className="mushaf-surah-band text-base sm:text-lg">سُورَةُ {surah.name}</div>

              {surah.number !== 1 && surah.number !== 9 && (
                <p className="mushaf-bismillah" dir="rtl" lang="ar" style={mushafFontStyle}>
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </p>
              )}

              <p className="mushaf-text" dir="rtl" lang="ar" style={mushafFontStyle}>
                {visibleAyahs.map((ayah) => (
                  <React.Fragment key={ayah.numberInSurah}>
                    <span>{ayah.text}</span>
                    {isHafs && ayah.tafsir ? (
                      <button
                        type="button"
                        onClick={() => onOpenTafsir(ayah)}
                        className="mushaf-ayah-num"
                        title={`تفسير الآية ${ayah.numberInSurah}`}
                      >
                        {toArabicNumber(ayah.numberInSurah)}
                      </button>
                    ) : (
                      <span className="mushaf-ayah-num" aria-hidden="true">
                        {toArabicNumber(ayah.numberInSurah)}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </p>

              <div className="mushaf-page-footer">
                <span>﴿</span>
                <span>
                  {activeUnit?.page !== undefined
                    ? toArabicNumber(activeUnit.page)
                    : toArabicNumber(unitIndex + 1)}
                </span>
                <span>﴾</span>
              </div>
            </div>
          ) : (
            <>
              <div className="p-6 bg-white/5 border-b border-white/10 text-center">
                <h2 className="text-xl font-bold text-white font-display">سورة {surah.name}</h2>
                <div className="flex items-center justify-center gap-2 text-xs text-jade-100/60 mt-1">
                  <span>{surah.revelationType}</span>
                  <span>·</span>
                  <span>{surah.numberOfAyahs} آية</span>
                  {isHafs && (
                    <>
                      <span>·</span>
                      <span>الجزء {surah.juzStart}</span>
                    </>
                  )}
                  <span>·</span>
                  <span className="text-gold-300 font-semibold">{info.label}</span>
                </div>
              </div>

              <div className="p-6 sm:p-10 space-y-6 divide-y divide-white/10">
                {visibleAyahs.map((ayah) => (
                  <div key={ayah.numberInSurah} className="pt-6 first:pt-0 space-y-4">
                    <div className="text-right" dir="rtl" lang="ar">
                      <p
                        className={`text-2xl sm:text-3xl text-white leading-loose ${isHafs ? 'font-quran' : ''}`}
                        style={quranFontStyle}
                      >
                        {ayah.text}
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gold-400/50 text-gold-200 text-sm font-bold mx-2 select-none align-middle">
                          {ayah.numberInSurah}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      {isHafs && ayah.tafsir && (
                        <button
                          onClick={() => onOpenTafsir(ayah)}
                          className="flex items-center gap-1.5 glass-panel text-white hover:bg-white/10 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-gold-300" />
                          <span>التفسير</span>
                        </button>
                      )}
                      <button
                        onClick={() => onStartReciting(surah.number, ayah.numberInSurah)}
                        className="flex items-center gap-1.5 bg-gold-400 hover:bg-gold-300 text-jade-950 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-lg shadow-gold-500/20"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>سمّع هذه الآية</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
};
