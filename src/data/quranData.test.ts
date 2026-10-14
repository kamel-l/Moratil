import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSurahWithAyahs } from './quranData';

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
});
