import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserStats, VerseMastery } from '../types/quran';

type Row = Record<string, unknown>;

interface Write {
  table: string;
  rows: Row[];
  onConflict?: string;
}

const writes: Write[] = [];
const tables: Record<string, Row[]> = {};

function resetTables() {
  for (const key of Object.keys(tables)) delete tables[key];
  writes.length = 0;
}

function createFakeClient(): SupabaseClient {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let range: { from: number; to: number } | null = null;

      const select = (): Row[] => {
        const rows = (tables[table] ?? []).filter((row) =>
          Object.entries(filters).every(([column, value]) => row[column] === value),
        );
        if (!range) return rows;
        return rows.slice(range.from, range.to + 1);
      };

      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        order: () => builder,
        range(from: number, to: number) {
          range = { from, to };
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: select()[0] ?? null, error: null }),
        upsert(rows: Row[], options?: { onConflict?: string }) {
          writes.push({ table, rows, onConflict: options?.onConflict });
          return Promise.resolve({ error: null });
        },
        then<TResult1 = unknown, TResult2 = never>(
          onFulfilled?: ((value: { data: Row[]; error: null }) => TResult1) | null,
          onRejected?: ((reason: unknown) => TResult2) | null,
        ) {
          return Promise.resolve({ data: select(), error: null }).then(onFulfilled, onRejected);
        },
      };

      return builder;
    },
  } as unknown as SupabaseClient;
}

vi.mock('./supabase', () => ({
  supabase: createFakeClient(),
  missingSupabaseConfig: [],
}));

const storage = new Map<string, string>();

function mastery(overrides: Partial<VerseMastery> = {}): VerseMastery {
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

function legacyStats(overrides: Partial<UserStats> = {}): UserStats {
  return {
    points: 500,
    level: 'حافظ مبتدئ',
    streakDays: 3,
    lastActiveDate: '2026-01-09T20:00:00.000Z',
    totalVersesRecited: 120,
    totalRecitedSeconds: 1800,
    accuracyRate: 91.2,
    mistakesFixedCount: 4,
    completedSurahs: [1],
    unlockedBadgeIds: ['first_recitation'],
    ...overrides,
  };
}

const LEGACY_KEY = 'murattil_user_stats';
const MASTERY_KEY = 'murattil_verse_mastery';

function readStored(key: string): string | undefined {
  const exact = storage.get(key);
  if (exact !== undefined) return exact;
  for (const [name, value] of storage) {
    if (name.startsWith(`${key}:`)) return value;
  }
  return undefined;
}

function localStats(): UserStats {
  return JSON.parse(readStored(LEGACY_KEY) ?? '{}') as UserStats;
}

function localMastery(): Record<string, VerseMastery> {
  return JSON.parse(readStored(MASTERY_KEY) ?? '{}') as Record<string, VerseMastery>;
}

function writeFor(table: string): Row[] {
  return writes.filter((write) => write.table === table).flatMap((write) => write.rows);
}

let storageModule: typeof import('./storageService');

beforeEach(async () => {
  resetTables();
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });

  storageModule = await import('./storageService');
  const { resetAyahIndexCache } = await import('./normalizedProgressService');
  resetAyahIndexCache();
  storageModule.setStorageUserId(null);

  tables.ayahs = [
    { id: 1, surah_number: 1, ayah_number: 1 },
    { id: 2, surah_number: 1, ayah_number: 2 },
  ];
});

afterEach(() => {
  storageModule.stopProgressSync();
  storageModule.setStorageUserId(null);
});

describe('phase 2 double write', () => {
  it('mirrors the legacy snapshot into the normalized tables', async () => {
    tables.user_progress = [{ user_id: 'user-a', stats: legacyStats() }];
    tables.verse_mastery = [
      { user_id: 'user-a', mastery: mastery() },
      { user_id: 'user-a', mastery: mastery({ ayahNumber: 2, level: 'review_needed' }) },
    ];
    tables.daily_activity = [
      { user_id: 'user-a', activity_date: '2026-01-09', verses: 12, sessions: 2 },
    ];

    await storageModule.syncProgressFromCloud('user-a', () => {});

    // Legacy tables keep receiving the snapshot.
    expect(writeFor('user_progress')).toHaveLength(1);
    expect(writeFor('verse_mastery')).toHaveLength(2);
    expect(writeFor('daily_activity')).toHaveLength(1);

    // The normalized tables receive the same data, keyed by ayah id.
    const statsRows = writeFor('user_stats');
    expect(statsRows).toHaveLength(1);
    expect(statsRows[0]).toMatchObject({
      user_id: 'user-a',
      points: 500,
      streak_days: 3,
      last_active_date: '2026-01-09',
      completed_surahs: [1],
    });

    const progressRows = writeFor('memorization_progress');
    expect(progressRows).toHaveLength(2);
    expect(progressRows).toContainEqual(
      expect.objectContaining({ ayah_id: 2, status: 'review_needed', mistake_count: 1 }),
    );

    const scheduleRows = writeFor('review_schedule');
    expect(scheduleRows).toHaveLength(2);
    expect(scheduleRows[0]).toMatchObject({ ayah_id: 1, interval_days: 6, ease_factor: 2.7 });

    expect(writeFor('profiles')[0]).toMatchObject({ id: 'user-a', daily_verse_goal: 10 });
  });

  it('recovers legacy-only data into the normalized tables', async () => {
    // A user who only ever synced with the legacy client.
    tables.verse_mastery = [{ user_id: 'user-b', mastery: mastery({ level: 'mastered' }) }];

    await storageModule.syncProgressFromCloud('user-b', () => {});

    expect(localMastery()['1_1']).toMatchObject({ level: 'mastered' });
    expect(writeFor('memorization_progress')[0]).toMatchObject({
      ayah_id: 1,
      status: 'mastered',
    });
  });

  it('reads newer normalized progress back into the local client', async () => {
    tables.user_progress = [{ user_id: 'user-c', stats: legacyStats({ points: 500 }) }];
    tables.user_stats = [
      {
        user_id: 'user-c',
        points: 900,
        level: 'فارس الحُفاظ',
        streak_days: 9,
        last_active_date: '2026-01-10',
        total_verses_recited: 400,
        total_recited_seconds: 7200,
        accuracy_rate: '95.40',
        mistakes_fixed_count: 8,
        completed_surahs: [1, 2],
        unlocked_badge_ids: ['first_recitation', 'streak_7'],
      },
    ];
    tables.memorization_progress = [
      {
        user_id: 'user-c',
        ayah_id: 1,
        status: 'mastered',
        consecutive_success_count: 4,
        mistake_count: 0,
        last_reviewed_at: '2026-01-09T08:00:00.000Z',
      },
    ];
    tables.review_schedule = [
      {
        user_id: 'user-c',
        ayah_id: 1,
        due_at: '2026-02-01T08:00:00.000Z',
        last_result: 'success',
        last_reviewed_at: '2026-01-09T08:00:00.000Z',
        interval_days: 16,
        ease_factor: '2.80',
        repetition_count: 4,
        status: 'scheduled',
      },
    ];
    tables.profiles = [
      {
        id: 'user-c',
        daily_verse_goal: 25,
        revision_reminder_enabled: true,
        revision_reminder_time: '18:45:00',
      },
    ];

    await storageModule.syncProgressFromCloud('user-c', () => {});

    expect(localStats()).toMatchObject({ points: 900, streakDays: 9, accuracyRate: 95.4 });
    expect(localMastery()['1_1']).toMatchObject({
      level: 'mastered',
      consecutiveSuccessCount: 4,
      repetitionCount: 4,
      intervalDays: 16,
      nextReviewAt: '2026-02-01T08:00:00.000Z',
    });
    expect(localMastery()['1_1'].easeFactor).toBeCloseTo(2.8);

    // Settings are inherited on a device that never stored them.
    expect(storageModule.getDailyVerseGoal()).toBe(25);
    expect(storageModule.getRevisionReminderSettings()).toEqual({ enabled: true, time: '18:45' });

    // And the merged state is pushed back to both models.
    expect(writeFor('user_stats')[0]).toMatchObject({ points: 900 });
    expect(writeFor('memorization_progress')[0]).toMatchObject({ ayah_id: 1, status: 'mastered' });
  });

  it('keeps local settings when the device already stored a choice', async () => {
    storageModule.setStorageUserId('user-d');
    storageModule.saveDailyVerseGoal(15);
    storageModule.saveRevisionReminderSettings({ enabled: false, time: '07:30' });

    tables.profiles = [
      {
        id: 'user-d',
        daily_verse_goal: 25,
        revision_reminder_enabled: true,
        revision_reminder_time: '18:45:00',
      },
    ];

    await storageModule.syncProgressFromCloud('user-d', () => {});

    expect(storageModule.getDailyVerseGoal()).toBe(15);
    expect(storageModule.getRevisionReminderSettings()).toEqual({ enabled: false, time: '07:30' });
    expect(writeFor('profiles')[0]).toMatchObject({ daily_verse_goal: 15 });
  });
});
