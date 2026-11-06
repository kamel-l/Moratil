import type { Ayah, Surah } from '../types/quran';

export function createNextAyahOptions(surah: Surah, currentAyah: Ayah, nextAyah: Ayah): Ayah[] {
  const distractors = surah.ayahs.filter(
    (candidate) =>
      candidate.numberInSurah !== currentAyah.numberInSurah &&
      candidate.numberInSurah !== nextAyah.numberInSurah,
  );
  for (let i = distractors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distractors[i], distractors[j]] = [distractors[j], distractors[i]];
  }
  const options = [nextAyah, ...distractors.slice(0, 3)];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}
