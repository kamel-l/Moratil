import { Surah, Ayah, RiwayahKey } from '../types/quran';
import { ALL_SURAHS } from './quranSurahsList';
import { getSurahWithAyahs } from './quranData';

/**
 * نصّ رواية ورش يُخزَّن محليًا داخل التطبيق (public/quran/warsh-text.json).
 * الاعتماد على ملف محلي من نفس الأصل يمنع فشل التحميل بسبب قيود CORS
 * أو حجب الخدمات الخارجية في بيئة التشغيل، ويعمل بلا إنترنت.
 * بنية الملف: { "اسم السورة": ["نص الآية 1", "نص الآية 2", ...] }
 */
const WARSH_TEXT_URL = `${import.meta.env.BASE_URL}quran/warsh-text.json`;

type WarshTextMap = Record<string, string[]>;

let warshTextPromise: Promise<WarshTextMap> | null = null;

function loadWarshText(): Promise<WarshTextMap> {
  if (!warshTextPromise) {
    warshTextPromise = fetch(WARSH_TEXT_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`تعذّر تحميل نصّ رواية ورش (${response.status}).`);
        }
        return response.json() as Promise<WarshTextMap>;
      })
      .catch((error) => {
        warshTextPromise = null;
        throw error;
      });
  }
  return warshTextPromise;
}

const warshCache: Record<number, Surah> = {};
const warshInFlight: Record<number, Promise<Surah>> = {};

async function buildWarshSurah(surahNumber: number): Promise<Surah> {
  const meta = ALL_SURAHS.find((s) => s.number === surahNumber);
  const textMap = await loadWarshText();
  const rows = textMap[String(surahNumber)];

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`لا يتوفّر نصّ رواية ورش للسورة ${surahNumber}.`);
  }

  const ayahs: Ayah[] = rows.map((text, index) => ({
    numberInSurah: index + 1,
    text,
    juz: meta?.juzStart ?? 1,
  }));

  return {
    number: surahNumber,
    name: meta?.name ?? `سورة ${surahNumber}`,
    englishName: meta?.englishName ?? '',
    revelationType: meta?.revelationType ?? 'مكية',
    numberOfAyahs: ayahs.length,
    juzStart: meta?.juzStart ?? 1,
    pageStart: meta?.pageStart ?? 1,
    ayahs,
  };
}

/**
 * يجلب سورة كاملة وفق الرواية المختارة.
 * - حفص: البيانات المضمّنة مسبقًا أو واجهة alquran.cloud (السلوك القائم).
 * - ورش: نصّ مضمّن محليًا مع تخزين مؤقّت في الذاكرة.
 */
export function getSurahWithAyahsByRiwayah(
  surahNumber: number,
  riwayah: RiwayahKey,
): Promise<Surah> {
  if (riwayah === 'hafs') return getSurahWithAyahs(surahNumber);

  if (warshCache[surahNumber]) return Promise.resolve(warshCache[surahNumber]);
  if (!warshInFlight[surahNumber]) {
    warshInFlight[surahNumber] = buildWarshSurah(surahNumber)
      .then((surah) => {
        warshCache[surahNumber] = surah;
        return surah;
      })
      .finally(() => {
        delete warshInFlight[surahNumber];
      });
  }
  return warshInFlight[surahNumber];
}
