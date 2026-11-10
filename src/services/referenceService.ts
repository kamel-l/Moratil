/**
 * طبقة المرجع المحلية للجداول المرجعية (surahs / ayahs).
 *
 * لا تُخزَّن هذه البيانات ولا تُكرَّر: تُبنى لحظيًا من الحزم المحلية القائمة
 * (quranSurahsList / riwayahData / mushafPages) لكنها تُعرض بشكل صفوف قاعدة
 * البيانات نفسها، حتى يستطيع أي مستهلك (شاشة، تحليل أخطاء، محرّك مزامنة) الربط
 * بين سجل الأخطاء ونصّ الآية دون معرفة مصدر البيانات.
 *
 * الجداول المرجعية لا تُكتب محليًا ولا تُزامَن؛ تُزرع مرة واحدة على الخادم عبر
 * supabase/seed.sql.
 */

import { ALL_SURAHS } from '../data/quranSurahsList';
import type { SurahMeta } from '../data/quranSurahsList';
import { getSurahWithAyahsByRiwayah } from '../data/riwayahData';
import { getAyahPages } from '../data/mushafPages';
import { removeTashkeel } from '../utils/arabicUtils';
import { AyahRow, SurahRow } from '../types/database';
import { RiwayahKey } from '../types/quran';

/** مصدر النص لكل رواية — للتوثيق في عمود ayahs.source. */
const AYAH_SOURCES: Record<RiwayahKey, string> = {
  hafs: 'alquran.cloud:quran-uthmani',
  warsh: 'local:warsh-text.json',
};

/** المفتاح الثابت للآية: '<riwayah>-<surah>-<ayah>' مطابق لما يُولَّد في seed.sql. */
export function ayahRowId(riwayah: RiwayahKey, surahNumber: number, ayahNumber: number): string {
  return `${riwayah}-${surahNumber}-${ayahNumber}`;
}

function toSurahRow(meta: SurahMeta): SurahRow {
  return {
    id: meta.number,
    name: meta.name,
    english_name: meta.englishName,
    revelation_type: meta.revelationType,
    ayah_count: meta.numberOfAyahs,
    page_start: meta.pageStart ?? null,
    juz_start: meta.juzStart ?? null,
  };
}

/** كل السور (114) — متزامنة لأنها مضمّنة في الحزمة. */
export function listSurahRows(): SurahRow[] {
  return ALL_SURAHS.map(toSurahRow);
}

export function getSurahRow(surahNumber: number): SurahRow | undefined {
  const meta = ALL_SURAHS.find((surah) => surah.number === surahNumber);
  return meta ? toSurahRow(meta) : undefined;
}

/** آيات سورة كاملة برواية معيّنة بصفوف قاعدة البيانات. */
export async function getAyahRows(riwayah: RiwayahKey, surahNumber: number): Promise<AyahRow[]> {
  const surah = await getSurahWithAyahsByRiwayah(surahNumber, riwayah);

  // أرقام الصفحات قد لا تتوفّر لبعض السور؛ لا يُفشل غيابها بناء الصفوف.
  let pages: number[] = [];
  try {
    pages = await getAyahPages(surahNumber, riwayah);
  } catch {
    pages = [];
  }

  return surah.ayahs.map((ayah, index) => ({
    id: ayahRowId(riwayah, surahNumber, ayah.numberInSurah),
    riwayah,
    surah_number: surahNumber,
    ayah_number: ayah.numberInSurah,
    text: ayah.text,
    simple_text: removeTashkeel(ayah.text),
    juz: ayah.juz ?? null,
    page: pages[index] ?? ayah.page ?? null,
    source: AYAH_SOURCES[riwayah],
  }));
}

export async function getAyahRow(
  riwayah: RiwayahKey,
  surahNumber: number,
  ayahNumber: number,
): Promise<AyahRow | undefined> {
  const rows = await getAyahRows(riwayah, surahNumber);
  return rows.find((row) => row.ayah_number === ayahNumber);
}
