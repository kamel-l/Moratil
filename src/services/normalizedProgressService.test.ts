import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserStats, VerseMastery } from '../types/quran';
import {
  buildProgressRows,
  buildScheduleRows,
  createAyahIndex,
  getAyahIndex,
  hasNormalizedProgress,
  resetAyahIndexCache,
  rowToStats,
  rowsToMastery,
  statsToRow,
} from './normalizedProgressService';

const NOW = new Date('2026-01-10T12:00:00.000Z');

function index(
  rows: { id: number; surah: number; ayah: number }[] = [
    { id: 1, surah: 1, ayah: 1 },
    { id: 2, surah: 1, ayah: 2 },
    { id: 8, surah: 2, ayah: 1 },
  ],
) {
  return createAyahIndex(
    rows.map((row) => ({ id: row.id, surah_number: row.surah, ayah_number: row.ayah })),
  );
}

function verse(overrides: Partial<VerseMastery> = {}): VerseMastery {
  return {
    surahNumber: 1,
    ayahNumber: 1,
    level: 'good',
    consecutiveSuccessCount: 2,
    mistakeCount: 1,
    repetitionCount: 2,
    easeFactor: 2.7,
    intervalDays: 6,
    lastReviewedAt: '2026-01-05T08:00:00.000Z',
    nextReviewAt: '2026-01-11T08:00:00.000Z',
    recentMistakes: [],
    ...overrides,
  };
}

function stats(overrides: Partial<UserStats> = {}): UserStats {
  return {
    points: 1250,
    level: 'طالب إتقان متقدم',
    streakDays: 4,
    lastActiveDate: '2026-01-09T21:30:00.000Z',
    totalVersesRecited: 320,
    totalRecitedSeconds: 5400,
    accuracyRate: 96.5,
    mistakesFixedCount: 12,
    completedSurahs: [1, 114],
    unlockedBadgeIds: ['first_recitation'],
    ...overrides,
  };
}

beforeEach(() => {
  resetAyahIndexCache();
  localStorage.clear();
});

describe('ayah identity index', () => {
  it('maps surah:ayah keys to ayah ids and back', () => {
    const ayahs = index();

    expect(ayahs.size).toBe(3);
    expect(ayahs.idOf('2:1')).toBe(8);
    expect(ayahs.keyOf(8)).toBe('2:1');
    expect(ayahs.idOf('114:6')).toBeUndefined();
    expect(ayahs.keyOf(9999)).toBeUndefined();
  });

  it('loads every page of the reference data and caches the result', async () => {
    const rows = Array.from({ length: 2500 }, (_, position) => ({
      id: position + 1,
      surah_number: Math.floor(position / 100) + 1,
      ayah_number: (position % 100) + 1,
    }));
    let calls = 0;

    const client = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: (from: number, to: number) => {
              calls += 1;
              return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
            },
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const first = await getAyahIndex(client);
    expect(first.size).toBe(2500);
    expect(calls).toBe(3);

    // The second call is served from the cache, without any network access.
    const second = await getAyahIndex(client);
    expect(second).toBe(first);
    expect(calls).toBe(3);
  });

  it('surfaces an error instead of silently dropping progress', async () => {
    const client = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(getAyahIndex(client)).rejects.toThrow('boom');
  });
});

describe('memorization progress mapping', () => {
  it('converts the pedagogical state and skips unknown verses', () => {
    const mastery = {
      '1_1': verse(),
      '114_6': verse({ surahNumber: 114, ayahNumber: 6 }),
    };

    expect(buildProgressRows(mastery, index())).toEqual([
      {
        ayah_id: 1,
        status: 'good',
        consecutive_success_count: 2,
        mistake_count: 1,
        last_reviewed_at: '2026-01-05T08:00:00.000Z',
      },
    ]);
  });

  it('normalizes invalid counters and unknown levels', () => {
    const [row] = buildProgressRows(
      {
        '1_2': verse({
          ayahNumber: 2,
          level: 'unknown' as VerseMastery['level'],
          consecutiveSuccessCount: -3,
          mistakeCount: Number.NaN,
        }),
      },
      index(),
    );

    expect(row).toMatchObject({
      ayah_id: 2,
      status: 'new',
      consecutive_success_count: 0,
      mistake_count: 0,
    });
  });
});

describe('review schedule mapping', () => {
  it('keeps SM-2 values and flags due verses', () => {
    const [due, scheduled] = buildScheduleRows(
      {
        '1_1': verse({ nextReviewAt: '2026-01-09T08:00:00.000Z' }),
        '1_2': verse({ ayahNumber: 2, nextReviewAt: '2026-02-01T08:00:00.000Z' }),
      },
      index(),
      NOW.getTime(),
    );

    expect(due).toMatchObject({
      ayah_id: 1,
      due_at: '2026-01-09T08:00:00.000Z',
      last_result: 'success',
      interval_days: 6,
      ease_factor: 2.7,
      repetition_count: 2,
      status: 'due',
    });
    expect(scheduled).toMatchObject({ ayah_id: 2, status: 'scheduled' });
  });

  it('clamps intervals and ease factors inside the schema constraints', () => {
    const [row] = buildScheduleRows(
      {
        '1_1': verse({ intervalDays: 0, easeFactor: 1, repetitionCount: -2, level: 'new' }),
      },
      index(),
      NOW.getTime(),
    );

    expect(row).toMatchObject({
      interval_days: 1,
      ease_factor: 1.3,
      repetition_count: 0,
      last_result: null,
    });
  });

  it('marks a failed review as failure', () => {
    const [row] = buildScheduleRows(
      { '1_1': verse({ level: 'review_needed' }) },
      index(),
      NOW.getTime(),
    );
    expect(row.last_result).toBe('failure');
  });
});

describe('round trip with the normalized tables', () => {
  it('restores the legacy mastery shape', () => {
    const ayahs = index();
    const source = { '1_1': verse(), '1_2': verse({ ayahNumber: 2, level: 'new' }) };

    const restored = rowsToMastery(
      buildProgressRows(source, ayahs) as never,
      buildScheduleRows(source, ayahs, NOW.getTime()) as never,
      ayahs,
    );

    expect(restored['1_1']).toMatchObject({
      surahNumber: 1,
      ayahNumber: 1,
      level: 'good',
      consecutiveSuccessCount: 2,
      mistakeCount: 1,
      repetitionCount: 2,
      intervalDays: 6,
      lastReviewedAt: '2026-01-05T08:00:00.000Z',
      nextReviewAt: '2026-01-11T08:00:00.000Z',
    });
    expect(restored['1_1'].easeFactor).toBeCloseTo(2.7);
    expect(restored['1_2'].recentMistakes).toEqual([]);
  });

  it('reads numeric values returned as strings by PostgREST', () => {
    const ayahs = index();
    const restored = rowsToMastery(
      [
        {
          ayah_id: 1,
          status: 'mastered',
          consecutive_success_count: 3,
          mistake_count: 0,
          last_reviewed_at: '2026-01-05T08:00:00.000Z',
        },
      ],
      [
        {
          ayah_id: 1,
          due_at: '2026-02-01T08:00:00.000Z',
          last_result: 'success',
          last_reviewed_at: '2026-01-05T08:00:00.000Z',
          interval_days: 16,
          ease_factor: '2.80',
          repetition_count: 4,
        },
      ],
      ayahs,
    );

    expect(restored['1_1'].easeFactor).toBeCloseTo(2.8);
    expect(restored['1_1'].repetitionCount).toBe(4);
  });

  it('keeps a schedule that has no pedagogical row yet', () => {
    const restored = rowsToMastery(
      [],
      [
        {
          ayah_id: 1,
          due_at: '2026-02-01T08:00:00.000Z',
          last_result: 'failure',
          last_reviewed_at: null,
          interval_days: 1,
          ease_factor: 2.5,
          repetition_count: 0,
        },
      ],
      index(),
    );

    expect(restored['1_1']).toMatchObject({
      level: 'review_needed',
      surahNumber: 1,
      ayahNumber: 1,
    });
  });
});

describe('stats mapping', () => {
  it('converts the aggregate row both ways', () => {
    const row = statsToRow(stats());

    expect(row).toMatchObject({
      points: 1250,
      streak_days: 4,
      last_active_date: '2026-01-09',
      total_verses_recited: 320,
      accuracy_rate: 96.5,
      mistakes_fixed_count: 12,
      completed_surahs: [1, 114],
      unlocked_badge_ids: ['first_recitation'],
    });

    const restored = rowToStats(row as never, 'مبتدئ');
    expect(restored).toMatchObject({
      points: 1250,
      level: 'طالب إتقان متقدم',
      streakDays: 4,
      totalVersesRecited: 320,
      accuracyRate: 96.5,
      completedSurahs: [1, 114],
    });
  });

  it('clamps out-of-range values and deduplicates lists', () => {
    const row = statsToRow(
      stats({ accuracyRate: 140, completedSurahs: [2, 2, 3], unlockedBadgeIds: ['a', 'a'] }),
    );

    expect(row.accuracy_rate).toBe(100);
    expect(row.completed_surahs).toEqual([2, 3]);
    expect(row.unlocked_badge_ids).toEqual(['a']);
  });

  it('falls back to a default level when the remote row has none', () => {
    const restored = rowToStats(
      {
        points: 120,
        level: '',
        streak_days: 0,
        last_active_date: null,
        total_verses_recited: 0,
        total_recited_seconds: 0,
        accuracy_rate: '0',
        mistakes_fixed_count: 0,
        completed_surahs: null,
        unlocked_badge_ids: null,
      },
      'حافظ مبتدئ',
    );

    expect(restored.level).toBe('حافظ مبتدئ');
    expect(restored.completedSurahs).toEqual([]);
  });
});

describe('normalized progress detection', () => {
  function emptyProgress() {
    return {
      stats: {
        points: 0,
        level: 'مبتدئ',
        streakDays: 0,
        lastActiveDate: '',
        totalVersesRecited: 0,
        totalRecitedSeconds: 0,
        accuracyRate: 0,
        mistakesFixedCount: 0,
        completedSurahs: [],
        unlockedBadgeIds: [],
      },
      profile: null,
      mastery: {},
    };
  }

  it('treats the zeroed signup row as empty', () => {
    expect(hasNormalizedProgress(emptyProgress())).toBe(false);
    expect(hasNormalizedProgress({ ...emptyProgress(), stats: null })).toBe(false);
  });

  it('detects aggregate, badge and verse progress', () => {
    const withPoints = emptyProgress();
    withPoints.stats.points = 10;
    expect(hasNormalizedProgress(withPoints)).toBe(true);

    const withBadge = emptyProgress();
    withBadge.stats.unlockedBadgeIds = ['first_recitation'];
    expect(hasNormalizedProgress(withBadge)).toBe(true);

    const withVerse = emptyProgress();
    withVerse.mastery = { '1_1': verse() };
    expect(hasNormalizedProgress(withVerse)).toBe(true);
  });
});
