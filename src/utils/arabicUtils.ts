/**
 * Comprehensive Arabic text processing and Quranic speech-to-text matching utilities
 */

// Regex for Quranic Tashkeel and diacritical marks
const TASHKEEL_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]/g;
const NON_ARABIC_OR_SYMBOLS =
  /[\u0600-\u060F\u061B\u061F\u06D4\uFD3E\uFD3F«»()0-9٠-٩.,?!:;'"\-—_\n\r]/g;

/**
 * Removes all diacritics, pause marks, stop signs and non-essential Quranic annotations
 */
export function removeTashkeel(text: string): string {
  if (!text) return '';
  return text
    .replace(TASHKEEL_REGEX, '')
    .replace(/\u0640/g, '') // Remove tatweel (kashida)
    .replace(/\u0671/g, 'ا') // Waslah alef
    .trim();
}

/**
 * Normalizes Arabic letters for flexible phonetic speech matching
 * (e.g., handles Alef variants, Taa Marbuta, Yaa/Alef Maqsura)
 */
export function normalizeArabicText(text: string): string {
  if (!text) return '';
  let str = removeTashkeel(text);

  // Replace symbols, verse numbers and brackets
  str = str.replace(NON_ARABIC_OR_SYMBOLS, ' ');

  // Normalize Alef variants: أ إ آ ٱ -> ا
  str = str.replace(/[أإآٱ]/g, 'ا');

  // Normalize Taa Marbuta & Haa: ة -> ه
  str = str.replace(/ة/g, 'ه');

  // Normalize Yaa variants: ى -> ي
  str = str.replace(/ى/g, 'ي');

  // Normalize Waw with Hamza: ؤ -> و
  str = str.replace(/ؤ/g, 'و');

  // Normalize Yaa with Hamza: ئ -> ي
  str = str.replace(/ئ/g, 'ي');

  // Normalize multiple spaces
  str = str.replace(/\s+/g, ' ').trim();

  return str;
}

/**
 * Groups of Arabic letters that speech recognizers frequently confuse
 * (close places of articulation). Every letter in a group is collapsed to the
 * group's first letter so that, for example, "الصراط" and "السراط" still match.
 */
const PHONETIC_GROUPS: readonly string[][] = [
  ['ه', 'ح'],
  ['ت', 'ط'],
  ['س', 'ص', 'ث'],
  ['ز', 'ذ', 'ظ'],
  ['د', 'ض'],
];

const PHONETIC_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of PHONETIC_GROUPS) {
    for (const letter of group) map[letter] = group[0];
  }
  return map;
})();

/**
 * Collapses confusable Arabic consonants so that near-homophones produced by
 * the speech recognizer compare equal to the expected Quranic word.
 */
export function phoneticNormalize(text: string): string {
  if (!text) return '';
  return normalizeArabicText(text)
    .replace(/[^\u0621-\u064A\s]/g, '')
    .replace(/./g, (char) => PHONETIC_MAP[char] ?? char)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits Quranic text into an array of words, preserving the original diacritized word
 * alongside its clean normalized counterpart for accurate matching.
 */
export interface QuranWordMeta {
  index: number;
  original: string;
  normalized: string;
}

export function extractWords(verseText: string): QuranWordMeta[] {
  if (!verseText) return [];
  // Clean decorative brackets or verse numbers if any in the original text
  const cleanOriginal = verseText.replace(/[\u06dd\ufd3e\ufd3f0-9٠-٩()]/g, ' ').trim();
  const rawWords = cleanOriginal.split(/\s+/).filter((w) => w.length > 0);

  return rawWords.map((word, index) => {
    return {
      index,
      original: word,
      normalized: normalizeArabicText(word),
    };
  });
}

/**
 * Levenshtein distance algorithm for calculating string similarity
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Similarity ratio (0..1) derived from the Levenshtein distance.
 */
function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return Math.max(0, (maxLen - levenshteinDistance(a, b)) / maxLen);
}

/**
 * Computes similarity percentage between 0 and 1
 */
export function wordSimilarity(word1: string, word2: string): number {
  const w1 = normalizeArabicText(word1);
  const w2 = normalizeArabicText(word2);

  if (w1 === w2) return 1.0;
  if (!w1 || !w2) return 0;

  // Handle common Arabic prefixes like "و" (and) or "ف" (so) or "ب" (with)
  if (w1.length > 3 && w2.length > 3) {
    if (w1.startsWith('و') && w1.slice(1) === w2) return 0.95;
    if (w2.startsWith('و') && w2.slice(1) === w1) return 0.95;
    if (w1.startsWith('ف') && w1.slice(1) === w2) return 0.95;
    if (w2.startsWith('ف') && w2.slice(1) === w1) return 0.95;
    if (w1.startsWith('ال') && w1.slice(2) === w2) return 0.92;
    if (w2.startsWith('ال') && w2.slice(2) === w1) return 0.92;
  }

  const exactSimilarity = similarityRatio(w1, w2);
  // Fallback that tolerates the consonant confusions speech recognizers make.
  const phoneticSimilarity =
    similarityRatio(phoneticNormalize(w1), phoneticNormalize(w2)) * 0.97;

  return Math.max(exactSimilarity, phoneticSimilarity);
}

/**
 * Decides whether a spoken word matches an expected Quranic word.
 * The tolerance scales with word length: short words must match almost exactly
 * (to avoid accepting wrong words), while longer words tolerate small errors.
 */
export function isWordMatch(spoken: string, expected: string): boolean {
  const spokenNorm = normalizeArabicText(spoken);
  const expectedNorm = normalizeArabicText(expected);
  if (!spokenNorm || !expectedNorm) return false;
  if (spokenNorm === expectedNorm) return true;

  const shortest = Math.min(spokenNorm.length, expectedNorm.length);
  const similarity = wordSimilarity(spokenNorm, expectedNorm);

  if (shortest <= 2) return false;
  if (shortest === 3) return similarity >= 0.8;
  if (shortest === 4) return similarity >= 0.75;
  return similarity >= 0.7;
}

/**
 * Formats seconds into MM:SS
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats numbers into Arabic Eastern digits if desired (١، ٢، ٣...)
 */
export function toArabicDigits(num: number | string): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num.toString().replace(/\d/g, (d) => arabicDigits[parseInt(d, 10)]);
}
