/**
 * يجلب نص ورش الصحيح من Tanzil.net ويولّد src/data/warshQuran.ts
 * التشغيل: node scripts/fetchWarshQuran.mjs
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ✅ Tanzil — مصدر موثوق يستخدمه أغلب المشاريع القرآنية
const TANZIL_WARSH_URL =
  'https://tanzil.net/pub/download/index.php?marks=true&sajdah=true&alef=true&subtype=warsh&outType=txt&agree=true';

async function main() {
  console.log('⏳ تنزيل نص ورش من Tanzil...');
  const res = await fetch(TANZIL_WARSH_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Quran-App-Build)' },
  });
  if (!res.ok) throw new Error(`Tanzil ${res.status}: ${await res.text()}`);
  const raw = await res.text();

  // صيغة Tanzil: "surah|ayah|text" لكل سطر
  const quran = {};
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.startsWith('#') || line.startsWith('//')) continue;
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const surahNum = parseInt(parts[0], 10);
    const ayahNum = parseInt(parts[1], 10);
    const text = parts.slice(2).join('|').trim();
    if (!quran[surahNum]) quran[surahNum] = [];
    quran[surahNum][ayahNum - 1] = text;
  }

  // تحقق من اكتمال 114 سورة
  const surahCount = Object.keys(quran).length;
  if (surahCount !== 114) {
    throw new Error(`متوقع 114 سورة، وجدنا ${surahCount}`);
  }
  console.log('✅ تم تنزيل', surahCount, 'سورة');

  // ولّد ملف TS
  const header = `// ملف مُولَّد تلقائيًا من Tanzil.net — لا تُعدِّله يدويًا.
// رواية ورش عن نافع، بترقيم الآيات العثماني.
// المصدر: https://tanzil.net — مجمع الملك فهد لطباعة المصحف الشريف.
export const WARSH_QURAN: Record<number, readonly string[]> = {
`;

  let body = '';
  for (let s = 1; s <= 114; s++) {
    body += `  ${s}: [\n`;
    for (const ayah of quran[s]) {
      body += `    ${JSON.stringify(ayah)},\n`;
    }
    body += `  ],\n`;
  }
  body += '};\n';

  const outPath = join(__dirname, '..', 'src', 'data', 'warshQuran.ts');
  writeFileSync(outPath, header + body, 'utf8');
  console.log('✅ تم توليد:', outPath);
}

main().catch((err) => {
  console.error('❌ فشل السكربت:', err);
  process.exit(1);
});