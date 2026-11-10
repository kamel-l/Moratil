import { RiwayahKey, RiwayahInfo } from '../types/quran';

/**
 * إعدادات الروايات المدعومة في التطبيق.
 * نصّ ورش مخزَّن محليًا (public/quran/warsh-text.json)، ونصّ حفص من البيانات المضمّنة/خدمة alquran.cloud.
 * خطوط المصحف مخزَّنة محليًا أيضًا (public/quran/fonts) لتفادي الاعتماد على خدمات خارجية قد تنقطع.
 */
export const RIWAYAT: Record<RiwayahKey, RiwayahInfo> = {
  hafs: {
    key: 'hafs',
    label: 'حفص',
    fullName: 'حفص عن عاصم',
    fontFamily: 'KFGQPC HAFS Uthmanic Script',
    fontUrl: `${import.meta.env.BASE_URL}quran/fonts/UthmanicHafs.ttf`,
    ayahCount: 6236,
    hasAudio: true,
  },
  warsh: {
    key: 'warsh',
    label: 'ورش',
    fullName: 'ورش عن نافع',
    fontFamily: 'KFGQPC Warsh Uthmanic Script',
    fontUrl: `${import.meta.env.BASE_URL}quran/fonts/UthmanicWarsh.ttf`,
    ayahCount: 6214,
    hasAudio: false,
  },
};

export const RIWAYAH_ORDER: RiwayahKey[] = ['hafs', 'warsh'];

const loadedFonts = new Set<RiwayahKey>();

/** يحقن قاعدة @font-face الخاصة بالرواية مرّة واحدة في المستند. */
export function ensureRiwayahFont(riwayah: RiwayahKey): void {
  if (typeof document === 'undefined' || loadedFonts.has(riwayah)) return;
  const info = RIWAYAT[riwayah];
  const style = document.createElement('style');
  style.dataset.riwayahFont = riwayah;
  style.textContent = `@font-face { font-family: "${info.fontFamily}"; src: url("${info.fontUrl}") format("truetype"); font-display: swap; }`;
  document.head.appendChild(style);
  loadedFonts.add(riwayah);
}

/** اسم عائلة الخطّ الجاهز للاستخدام في CSS لرواية معيّنة. */
export function riwayahFontFamily(riwayah: RiwayahKey): string {
  return `"${RIWAYAT[riwayah].fontFamily}", 'Amiri', serif`;
}
