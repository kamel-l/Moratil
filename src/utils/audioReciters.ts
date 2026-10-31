import { Reciter, Riwaya } from '../types/quran';

// ═══════════════════════════════════════════
// قرّاء حفص
// ═══════════════════════════════════════════
export const HAFS_RECITERS: Reciter[] = [
  {
    id: 'husary_teacher',
    name: 'الشيخ محمود خليل الحصري',
    description: 'المصحف المعلم (ترديد وإتقان مخارج الحروف)',
    folder: 'Husary_Muallim_128kbps',
    bitrate: '128kbps',
    hasTeacherStyle: true,
    riwaya: 'hafs',
  },
  {
    id: 'alafasy',
    name: 'الشيخ مشاري راشد العفاسي',
    description: 'تلاوة ندية عذبة ومتقنة',
    folder: 'Alafasy_128kbps',
    bitrate: '128kbps',
    riwaya: 'hafs',
  },
  {
    id: 'minshawy_teacher',
    name: 'الشيخ محمد صديق المنشاوي',
    description: 'المصحف المعلم بخشوع وتأثر',
    folder: 'Minshawy_Teacher_128kbps',
    bitrate: '128kbps',
    hasTeacherStyle: true,
    riwaya: 'hafs',
  },
  {
    id: 'abdulbasit_murattal',
    name: 'الشيخ عبد الباسط عبد الصمد',
    description: 'المصحف المرتل برواية حفص',
    folder: 'Abdul_Basit_Murattal_192kbps',
    bitrate: '192kbps',
    riwaya: 'hafs',
  },
  {
    id: 'ghamadi',
    name: 'الشيخ سعد الغامدي',
    description: 'تلاوة سريعة معتدلة ممتازة للمراجعة',
    folder: 'Ghamadi_40kbps',
    bitrate: '40kbps',
    riwaya: 'hafs',
  },
  {
    id: 'muaiqly',
    name: 'الشيخ ماهر المعيقلي',
    description: 'إمام الحرم المكي الشريف',
    folder: 'Maher_AlMuaiqly_64kbps',
    bitrate: '64kbps',
    riwaya: 'hafs',
  },
];

// ═══════════════════════════════════════════
// قرّاء ورش — المسار الكامل يتضمن مجلد "warsh/"
// ═══════════════════════════════════════════
export const WARSH_RECITERS: Reciter[] = [
  {
    id: 'warsh_yassin',
    name: 'الشيخ ياسين الجزائري',
    description: 'المصحف المرتل برواية ورش عن نافع',
    folder: 'warsh/warsh_yassin_al_jazaery_64kbps',
    bitrate: '64kbps',
    riwaya: 'warsh',
  },
  {
    id: 'warsh_dosory',
    name: 'الشيخ إبراهيم الدوسري',
    description: 'المصحف المرتل برواية ورش عن نافع',
    folder: 'warsh/warsh_ibrahim_aldosary_128kbps',
    bitrate: '128kbps',
    riwaya: 'warsh',
  },
  {
    id: 'warsh_abdulbasit',
    name: 'الشيخ عبد الباسط عبد الصمد',
    description: 'المصحف المرتل برواية ورش (تنقصه بعض الآيات)',
    folder: 'warsh/warsh_Abdul_Basit_128kbps',
    bitrate: '128kbps',
    riwaya: 'warsh',
  },
];

export const POPULAR_RECITERS: Reciter[] = [...HAFS_RECITERS, ...WARSH_RECITERS];

export function getRecitersByRiwaya(riwaya: Riwaya): Reciter[] {
  return POPULAR_RECITERS.filter((r) => (r.riwaya ?? 'hafs') === riwaya);
}

/**
 * ✅ رابط الصوت — يبني الرابط من مجلد القارئ نفسه مباشرة.
 *
 * ملاحظة مهمة:
 *   لا يوجد استبدال صامت للقارئ. إن مُرِّرت `riwaya` واختلفت عن رواية
 *   القارئ، تُسجَّل رسالة تحذير فقط، ويُستخدم مجلد القارئ المطلوب كما هو.
 *   هذا يمنع الخطأ الخفي الذي كان يستبدل قرّاء ورش بالحصري.
 */
export function getAyahAudioUrl(
  reciterId: string,
  surahNumber: number,
  ayahNumber: number,
  riwaya?: Riwaya,
): string {
  const reciter =
    POPULAR_RECITERS.find((r) => r.id === reciterId) ?? POPULAR_RECITERS[0];

  // تحذير فقط — لا استبدال
  if (riwaya && (reciter.riwaya ?? 'hafs') !== riwaya) {
    // eslint-disable-next-line no-console
    console.warn(
      `[getAyahAudioUrl] mismatch: reciter="${reciter.id}" (${reciter.riwaya ?? 'hafs'}) but riwaya="${riwaya}". Using reciter's own folder: ${reciter.folder}`,
    );
  }

  const surahPad = surahNumber.toString().padStart(3, '0');
  const ayahPad = ayahNumber.toString().padStart(3, '0');

  // folder يحتوي بالفعل على "warsh/..." لقارئ ورش
  return `https://everyayah.com/data/${reciter.folder}/${surahPad}${ayahPad}.mp3`;
}

export function getQuranComAudioUrl(
  reciterId: string,
  surahNumber: number,
  ayahNumber: number,
): string {
  const surahPad = surahNumber.toString().padStart(3, '0');
  const ayahPad = ayahNumber.toString().padStart(3, '0');
  return `https://verses.quran.com/${reciterId}/${surahPad}${ayahPad}.mp3`;
}