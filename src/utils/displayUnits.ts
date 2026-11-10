/**
 * وحدة العرض في واجهات القراءة: آية واحدة، أو ٣، أو ٥، أو صفحة مصحف كاملة.
 */
export type DisplayUnit = 1 | 3 | 5 | 'page';

/** مقطع متتابع من الآيات (فهارس تبدأ من الصفر) قد يمثّل صفحة مصحف كاملة. */
export interface AyahUnit {
  startIndex: number;
  endIndex: number;
  page?: number;
}

/** الحدّ الأقصى للآيات عند طلب «صفحة كاملة» قبل توفّر بيانات الصفحات. */
const PAGE_FALLBACK_SIZE = 5;

/**
 * يبني مقاطع الآيات حسب وحدة العرض.
 * عند اختيار «صفحة كاملة» تُجمَّع الآيات المتتابعة التي تشترك في رقم الصفحة نفسها.
 */
export function buildAyahUnits(
  ayahCount: number,
  unit: DisplayUnit,
  pages?: number[],
): AyahUnit[] {
  if (ayahCount <= 0) return [];

  if (unit === 'page' && pages && pages.length >= ayahCount) {
    const units: AyahUnit[] = [];
    for (let index = 0; index < ayahCount; index += 1) {
      const page = pages[index];
      const current = units[units.length - 1];
      if (current && current.page === page) {
        current.endIndex = index;
      } else {
        units.push({ startIndex: index, endIndex: index, page });
      }
    }
    return units;
  }

  const size = unit === 'page' ? PAGE_FALLBACK_SIZE : unit;
  const units: AyahUnit[] = [];
  for (let index = 0; index < ayahCount; index += size) {
    units.push({ startIndex: index, endIndex: Math.min(ayahCount - 1, index + size - 1) });
  }
  return units;
}

/** وصف نصّي للمقطع: «الصفحة ٤٢» أو «الآيات ٤–٦» أو «الآية ٥». */
export function unitLabel(unit: AyahUnit | undefined): string {
  if (!unit) return '';
  if (unit.page !== undefined) return `الصفحة ${unit.page}`;
  const first = unit.startIndex + 1;
  const last = unit.endIndex + 1;
  return first === last ? `الآية ${first}` : `الآيات ${first}–${last}`;
}

/** فهرس المقطع الذي تنتمي إليه آية معيّنة. */
export function findUnitIndexForAyah(units: AyahUnit[], ayahIndex: number): number {
  const index = units.findIndex((u) => ayahIndex >= u.startIndex && ayahIndex <= u.endIndex);
  return index === -1 ? 0 : index;
}
