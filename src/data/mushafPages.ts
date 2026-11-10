import { RiwayahKey } from '../types/quran';

/**
 * أرقام صفحات المصحف لكل آية، وفق الرواية المختارة.
 * تُولَّد من بيانات quran-meta (نفس مصدر أرقام الآيات) وتُخزَّن محليًا
 * في public/quran/mushaf-pages.json لتعمل بلا إنترنت.
 * بنية الملف: { "hafs": { "1": [1,1,...], ... }, "warsh": { "1": [1,1,...], ... } }
 */
const MUSHAF_PAGES_URL = `${import.meta.env.BASE_URL}quran/mushaf-pages.json`;

type RiwayahPagesMap = Record<string, number[]>;
type MushafPagesMap = Record<RiwayahKey, RiwayahPagesMap>;

let pagesPromise: Promise<MushafPagesMap> | null = null;

function loadMushafPages(): Promise<MushafPagesMap> {
  if (!pagesPromise) {
    pagesPromise = fetch(MUSHAF_PAGES_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`تعذّر تحميل بيانات صفحات المصحف (${response.status}).`);
        }
        return response.json() as Promise<MushafPagesMap>;
      })
      .catch((error) => {
        pagesPromise = null;
        throw error;
      });
  }
  return pagesPromise;
}

/**
 * يعيد رقم صفحة المصحف لكل آية في السورة، بترتيب الآيات (الفهرس 0 = الآية الأولى).
 */
export async function getAyahPages(surahNumber: number, riwayah: RiwayahKey): Promise<number[]> {
  const allPages = await loadMushafPages();
  const surahPages = allPages[riwayah]?.[String(surahNumber)];
  if (!Array.isArray(surahPages) || surahPages.length === 0) {
    throw new Error(`لا تتوفّر بيانات صفحات السورة ${surahNumber} لهذه الرواية.`);
  }
  return surahPages;
}
