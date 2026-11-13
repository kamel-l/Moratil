import type { Riwaya } from '../types/quran';
import { ALL_SURAHS, type SurahMeta } from './quranSurahsList';
import {
  WARSH_BASMALAH,
  WARSH_PROVENANCE,
  WARSH_SURAH_INFO,
  WARSH_TOTAL_AYAHS,
} from './warshManifest';

/**
 * Riwayah metadata used by the UI.
 *
 * Hafs keeps the 6,236-ayah Kufi numbering already used by the app. Warsh uses
 * its own 6,214-ayah Madani-last numbering: the two identities are deliberately
 * kept apart, so `2:255` is not the same verse in both, and progress must never
 * be merged across riwayat.
 */
export interface RiwayahSurahMeta extends SurahMeta {
  /**
   * Basmalah printed above the surah, or `null` when the edition folds it into
   * the text or omits it. Warsh numbers the basmalah outside the 6,214 ayahs.
   */
  readonly standaloneBasmalah: string | null;
}

export interface RiwayahMeta {
  readonly code: Riwaya;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly qiraahAr: string;
  readonly countingSystemAr: string;
  readonly totalAyahs: number;
  readonly surahs: readonly RiwayahSurahMeta[];
  /** CSS class that switches to the font the text is encoded for. */
  readonly fontClass: string;
  readonly fontFamily: string;
  /** Only Warsh ships a published, checksummed provenance record. */
  readonly provenance?: typeof WARSH_PROVENANCE;
}

const HAFS_SURAHS: readonly RiwayahSurahMeta[] = ALL_SURAHS.map((surah) => ({
  ...surah,
  standaloneBasmalah: null,
}));

const WARSH_SURAHS: readonly RiwayahSurahMeta[] = ALL_SURAHS.map((surah, index) => {
  const info = WARSH_SURAH_INFO[index];
  if (!info || info.number !== surah.number) {
    throw new Error(`Warsh manifest is missing surah ${surah.number}.`);
  }
  return {
    ...surah,
    numberOfAyahs: info.ayahCount,
    juzStart: info.juzStart,
    pageStart: info.pageStart,
    revelationType: info.revelation,
    standaloneBasmalah: info.hasBasmalah ? WARSH_BASMALAH : null,
  };
});

const HAFS_TOTAL_AYAHS = HAFS_SURAHS.reduce((total, surah) => total + surah.numberOfAyahs, 0);

export const RIWAYAT: Record<Riwaya, RiwayahMeta> = {
  hafs: {
    code: 'hafs',
    nameAr: 'حفص عن عاصم',
    nameEn: 'Hafs',
    qiraahAr: 'عاصم',
    countingSystemAr: 'العد الكوفي',
    totalAyahs: HAFS_TOTAL_AYAHS,
    surahs: HAFS_SURAHS,
    fontClass: 'font-quran',
    fontFamily: "'Amiri', 'Scheherazade New', serif",
  },
  warsh: {
    code: 'warsh',
    nameAr: 'ورش عن نافع',
    nameEn: 'Warsh',
    qiraahAr: 'نافع المدني',
    countingSystemAr: 'المدني الأخير',
    totalAyahs: WARSH_TOTAL_AYAHS,
    surahs: WARSH_SURAHS,
    fontClass: 'font-warsh',
    fontFamily: "'KFGQPC Warsh Uthmanic Script'",
    provenance: WARSH_PROVENANCE,
  },
};

export function getRiwayah(code: Riwaya): RiwayahMeta {
  return RIWAYAT[code];
}

export function getSurahsForRiwaya(code: Riwaya): readonly RiwayahSurahMeta[] {
  return RIWAYAT[code].surahs;
}

export function getRiwayahTotalAyahs(code: Riwaya): number {
  return RIWAYAT[code].totalAyahs;
}

export function getSurahMetaForRiwaya(code: Riwaya, surahNumber: number): RiwayahSurahMeta {
  const surah = RIWAYAT[code].surahs.find((entry) => entry.number === surahNumber);
  if (!surah) throw new Error(`Surah ${surahNumber} does not exist.`);
  return surah;
}
