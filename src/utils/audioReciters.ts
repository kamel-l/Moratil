import { Reciter } from '../types/quran';

export const POPULAR_RECITERS: Reciter[] = [
  {
    id: 'husary_teacher',
    name: 'الشيخ محمود خليل الحصري',
    description: 'المصحف المعلم (ترديد وإتقان مخارج الحروف)',
    folder: 'Husary_Muallim_128kbps',
    bitrate: '128kbps',
    hasTeacherStyle: true,
  },
  {
    id: 'alafasy',
    name: 'الشيخ مشاري راشد العفاسي',
    description: 'تلاوة ندية عذبة ومتقنة',
    folder: 'Alafasy_128kbps',
    bitrate: '128kbps',
  },
  {
    id: 'minshawy_teacher',
    name: 'الشيخ محمد صديق المنشاوي',
    description: 'المصحف المعلم بخشوع وتأثر',
    folder: 'Minshawy_Teacher_128kbps',
    bitrate: '128kbps',
    hasTeacherStyle: true,
  },
  {
    id: 'abdulbasit_murattal',
    name: 'الشيخ عبد الباسط عبد الصمد',
    description: 'المصحف المرتل برواية حفص',
    folder: 'Abdul_Basit_Murattal_192kbps',
    bitrate: '192kbps',
  },
  {
    id: 'ghamadi',
    name: 'الشيخ سعد الغامدي',
    description: 'تلاوة سريعة معتدلة ممتازة للمراجعة',
    folder: 'Ghamadi_40kbps',
    bitrate: '40kbps',
  },
  {
    id: 'muaiqly',
    name: 'الشيخ ماهر المعيقلي',
    description: 'إمام الحرم المكي الشريف',
    folder: 'Maher_AlMuaiqly_64kbps',
    bitrate: '64kbps',
  },
];

/**
 * Returns direct CDN audio URL for a specific Ayah by a specific reciter
 */
export function getAyahAudioUrl(reciterId: string, surahNumber: number, ayahNumber: number): string {
  const reciter = POPULAR_RECITERS.find(r => r.id === reciterId) || POPULAR_RECITERS[0];
  const surahPad = surahNumber.toString().padStart(3, '0');
  const ayahPad = ayahNumber.toString().padStart(3, '0');
  return `https://everyayah.com/data/${reciter.folder}/${surahPad}${ayahPad}.mp3`;
}

/**
 * Fallback audio URL using Quran.com CDN if needed
 */
export function getQuranComAudioUrl(reciterId: string, surahNumber: number, ayahNumber: number): string {
  const surahPad = surahNumber.toString().padStart(3, '0');
  const ayahPad = ayahNumber.toString().padStart(3, '0');
  return `https://verses.quran.com/${reciterId}/${surahPad}${ayahPad}.mp3`;
}
