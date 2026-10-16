/**
 * Comprehensive Arabic text processing and Quranic speech-to-text matching utilities
 */

// Regex for Quranic Tashkeel and diacritical marks
const TASHKEEL_REGEX = /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
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

export function removeOpeningBasmalah(text: string): string {
  const basmalahWords = ['بسم', 'الله', 'الرحمن', 'الرحيم'];
  const words = [...text.matchAll(/\S+/gu)];

  if (
    words.length < basmalahWords.length ||
    !basmalahWords.every((word, index) => normalizeArabicText(words[index][0]) === word)
  ) {
    return text;
  }

  const lastBasmalahWord = words[basmalahWords.length - 1];
  return text.slice((lastBasmalahWord.index ?? 0) + lastBasmalahWord[0].length).trimStart();
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

  const maxLen = Math.max(w1.length, w2.length);
  const distance = levenshteinDistance(w1, w2);
  return Math.max(0, (maxLen - distance) / maxLen);
}

export interface SimilarAyahCandidate {
  surahNumber: number;
  surahName: string;
  numberInSurah: number;
  text: string;
  sharedWords: string[];
  similarity: number;
}

function normalizedVerseWords(text: string): string[] {
  return normalizeArabicText(text)
    .split(/\s+/)
    .map((word) => {
      if (word.length > 4 && word.startsWith('و')) return word.slice(1);
      if (word.length > 5 && word.startsWith('ال')) return word.slice(2);
      return word;
    })
    .filter((word) => word.length >= 3);
}

export function findSimilarAyahs(
  sourceText: string,
  ayahs: Omit<SimilarAyahCandidate, 'sharedWords' | 'similarity'>[],
  sourceSurahNumber: number,
  sourceAyahNumber: number,
  limit = 5,
): SimilarAyahCandidate[] {
  const sourceWords = normalizedVerseWords(sourceText);
  const sourceWordSet = new Set(sourceWords);
  if (sourceWordSet.size < 2) return [];

  return ayahs
    .filter(
      (ayah) =>
        ayah.surahNumber !== sourceSurahNumber || ayah.numberInSurah !== sourceAyahNumber,
    )
    .map((ayah) => {
      const candidateWords = normalizedVerseWords(ayah.text);
      const candidateWordSet = new Set(candidateWords);
      const sharedWords = [...sourceWordSet].filter((word) => candidateWordSet.has(word));
      const denominator = sourceWordSet.size + candidateWordSet.size - sharedWords.length;
      const overlap =
        candidateWordSet.size > 0
          ? sharedWords.length / Math.min(sourceWordSet.size, candidateWordSet.size)
          : 0;
      const jaccard = denominator > 0 ? sharedWords.length / denominator : 0;

      return {
        ...ayah,
        sharedWords,
        similarity: overlap * 0.7 + jaccard * 0.3,
      };
    })
    .filter((ayah) => ayah.sharedWords.length >= 2 && ayah.similarity >= 0.3)
    .sort((a, b) => b.similarity - a.similarity || b.sharedWords.length - a.sharedWords.length)
    .slice(0, Math.max(1, limit));
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
