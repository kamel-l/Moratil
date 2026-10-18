import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllQuranAyahs, getSurahWithAyahs } from './quranData';
import { ALL_SURAHS } from './quranSurahsList';

describe('getSurahWithAyahs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the complete surah when bundled data is incomplete', async () => {
    const ayahs = Array.from({ length: 30 }, (_, index) => ({
      numberInSurah: index + 1,
      text: `آية ${index + 1}`,
      juz: 29,
      page: 562,
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            name: 'Al-Mulk',
            englishName: 'Al-Mulk',
            revelationType: 'Meccan',
            numberOfAyahs: 30,
            ayahs,
          },
          { ayahs: ayahs.map((ayah) => ({ text: ayah.text })) },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const surah = await getSurahWithAyahs(67);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(surah.ayahs).toHaveLength(30);
    expect(surah.ayahs[0].numberInSurah).toBe(1);
    expect(surah.ayahs[29].numberInSurah).toBe(30);
  });

  it('loads and validates Quran text for mutashabihat practice', async () => {
    const surahs = ALL_SURAHS.map((surah) => ({
      number: surah.number,
      name: surah.name,
      ayahs: Array.from({ length: surah.numberOfAyahs }, (_, index) => ({
        numberInSurah: index + 1,
        text: `نص الآية ${index + 1}`,
      })),
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { surahs } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ayahs = await getAllQuranAyahs();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(ayahs).toHaveLength(6236);
    expect(ayahs[0]).toMatchObject({
      surahNumber: 1,
      surahName: ALL_SURAHS[0].name,
      numberInSurah: 1,
    });
  });
});
