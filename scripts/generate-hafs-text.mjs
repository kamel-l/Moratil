#!/usr/bin/env node
/**
 * يجلب نصّ رواية حفص (quran-uthmani) من alquran.cloud ويكتبه محليًا في
 * public/quran/hafs-text.json بنفس بنية warsh-text.json تمامًا:
 *   { "<رقم السورة>": ["نص الآية 1", "نص الآية 2", ...] }
 *
 * يحتاج اتصالًا بالشبكة عند التوليد فقط؛ الاستهلاك داخل التطبيق محلي بالكامل.
 * الاستخدام:
 *   node scripts/generate-hafs-text.mjs
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ENDPOINT = 'https://api.alquran.cloud/v1/quran/quran-uthmani';
const outDir = path.join(process.cwd(), 'public', 'quran');
const outFile = path.join(outDir, 'hafs-text.json');

async function main() {
  const response = await fetch(ENDPOINT);
  if (!response.ok) throw new Error(`HTTP ${response.status} من alquran.cloud`);

  const payload = await response.json();
  const surahs = payload?.data?.surahs;
  if (!Array.isArray(surahs) || surahs.length !== 114) {
    throw new Error('استجابة غير متوقّعة من alquran.cloud (عدد السور ليس 114)');
  }

  const map = {};
  let total = 0;
  for (const surah of surahs) {
    const texts = (surah.ayahs ?? []).map((ayah) => ayah.text);
    map[String(surah.number)] = texts;
    total += texts.length;
  }

  const content = JSON.stringify(map);
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, content, 'utf8');

  const sizeMb = (Buffer.byteLength(content, 'utf8') / 1024 / 1024).toFixed(2);
  console.log(`✓ ${path.relative(process.cwd(), outFile)} — ${surahs.length} سورة، ${total} آية، ${sizeMb} م.ب`);
}

main().catch((error) => {
  console.error('فشل توليد نص حفص:', error);
  process.exit(1);
});
