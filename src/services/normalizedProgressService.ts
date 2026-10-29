import type { SupabaseClient } from '@supabase/supabase-js';
import type { MasteryLevel, UserStats, VerseMastery } from '../types/quran';
import type { RevisionReminderSettings } from './storageService';

/**
 * Phase 2 client bridge for the normalized Supabase schema.
 *
 * The app still keys progress by `surahNumber`/`ayahNumber`, while the
 * normalized schema keys it by `ayahs.id`. This module owns the translation and
 * writes `user_stats`, `profiles`, `memorization_progress` and `review_schedule`
 * next to the legacy tables (`user_progress`, `verse_mastery`).
 *
 * Every write is additive and idempotent so the legacy client keeps working
 * while both models are active.
 */

const PAGE_SIZE = 1000;
const UPSERT_CHUNK_SIZE = 500;
const AYAH_INDEX_CACHE_KEY = 'murattil_ayah_index:v1';

const MASTERY_LEVELS: MasteryLevel[] = ['new', 'learning', 'review_needed', 'good', 'mastered'];

export interface AyahIndex {
  readonly size: number;
  idOf(key: string): number | undefined;
  keyOf(id: number): string | undefined;
}

interface AyahRow {
  id: number;
  surah_number: number;
  ayah_number: number;
}

interface ProfileRow {
  daily_verse_goal: number | null;
  revision_reminder_enabled: boolean | null;
  revision_reminder_time: string | null;
}

interface UserStatsRow {
  points: number | null;
  level: string | null;
  streak_days: number | null;
  last_active_date: string | null;
  total_verses_recited: number | null;
  total_recited_seconds: number | null;
  accuracy_rate: number | string | null;
  mistakes_fixed_count: number | null;
  completed_surahs: number[] | null;
  unlocked_badge_ids: string[] | null;
}

interface ProgressRow {
  ayah_id: number;
  status: MasteryLevel;
  consecutive_success_count: number | null;
  mistake_count: number | null;
  last_reviewed_at: string | null;
}

interface ScheduleRow {
  ayah_id: number;
  due_at: string;
  last_result: 'success' | 'failure' | 'skipped' | null;
  last_reviewed_at: string | null;
  interval_days: number | null;
  ease_factor: number | string | null;
  repetition_count: number | null;
}

export interface NormalizedProgressSnapshot {
  stats: UserStats;
  mastery: Record<string, VerseMastery>;
  dailyVerseGoal: number;
  reminder: RevisionReminderSettings;
}

export interface NormalizedProgress {
  stats: UserStats | null;
  profile: { dailyVerseGoal: number; reminder: RevisionReminderSettings } | null;
  mastery: Record<string, VerseMastery>;
}

export class AyahIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AyahIndexError';
  }
}

// ────────────────────────────────────────────────────────────
// Ayah identity index (surah:ayah ⇄ ayahs.id)
// ────────────────────────────────────────────────────────────

export function createAyahIndex(rows: AyahRow[]): AyahIndex {
  const idsByKey = new Map<string, number>();
  const keysById = new Map<number, string>();

  for (const row of rows) {
    if (!Number.isInteger(row.id) || !Number.isInteger(row.surah_number)) continue;
    if (!Number.isInteger(row.ayah_number)) continue;
    const key = `${row.surah_number}:${row.ayah_number}`;
    idsByKey.set(key, row.id);
    keysById.set(row.id, key);
  }

  return {
    size: idsByKey.size,
    idOf: (key) => idsByKey.get(key),
    keyOf: (id) => keysById.get(id),
  };
}

function readCachedAyahIndex(): AyahIndex | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(AYAH_INDEX_CACHE_KEY);
    if (!raw) return null;
    const rows: AyahRow[] = [];
    for (const entry of raw.split(';')) {
      if (!entry) continue;
      const [surah, ayah, id] = entry.split(':').map(Number);
      if (!Number.isInteger(surah) || !Number.isInteger(ayah) || !Number.isInteger(id)) {
        return null;
      }
      rows.push({ surah_number: surah, ayah_number: ayah, id });
    }
    return rows.length > 0 ? createAyahIndex(rows) : null;
  } catch {
    return null;
  }
}

function writeCachedAyahIndex(rows: AyahRow[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      AYAH_INDEX_CACHE_KEY,
      rows.map((row) => `${row.surah_number}:${row.ayah_number}:${row.id}`).join(';'),
    );
  } catch (error) {
    console.warn('Unable to cache the ayah index', error);
  }
}

export function resetAyahIndexCache(): void {
  ayahIndexPromise = null;
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(AYAH_INDEX_CACHE_KEY);
  } catch {
    // Ignore storage failures: the index is a cache only.
  }
}

let ayahIndexPromise: Promise<AyahIndex> | null = null;

async function collectPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

async function loadAyahIndex(client: SupabaseClient): Promise<AyahIndex> {
  const rows = await collectPages<AyahRow>((from, to) =>
    client
      .from('ayahs')
      .select('id,surah_number,ayah_number')
      .order('id', { ascending: true })
      .range(from, to),
  );
  if (rows.length === 0) {
    throw new AyahIndexError('The Quran reference data is empty.');
  }
  writeCachedAyahIndex(rows);
  return createAyahIndex(rows);
}

/**
 * Loads the `surah:ayah → ayahs.id` index once per session. The index is cached
 * in localStorage because it is identical for every user.
 */
export function getAyahIndex(client: SupabaseClient, { refresh = false } = {}): Promise<AyahIndex> {
  if (!refresh) {
    if (ayahIndexPromise) return ayahIndexPromise;

    const cached = readCachedAyahIndex();
    if (cached) {
      ayahIndexPromise = Promise.resolve(cached);
      return ayahIndexPromise;
    }
  }

  const pending = loadAyahIndex(client).catch((error: unknown) => {
    ayahIndexPromise = null;
    throw error;
  });
  ayahIndexPromise = pending;
  return pending;
}

// ────────────────────────────────────────────────────────────
// Legacy ⇄ normalized mapping
// ────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // PostgREST serializes `numeric` columns as strings.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toIsoString(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

export function statsToRow(stats: UserStats): Record<string, unknown> {
  const lastActive = Date.parse(stats.lastActiveDate);
  return {
    points: Math.max(0, Math.round(finiteNumber(stats.points))),
    level: stats.level || 'مبتدئ',
    streak_days: Math.max(0, Math.round(finiteNumber(stats.streakDays))),
    last_active_date: Number.isFinite(lastActive)
      ? new Date(lastActive).toISOString().slice(0, 10)
      : null,
    total_verses_recited: Math.max(0, Math.round(finiteNumber(stats.totalVersesRecited))),
    total_recited_seconds: Math.max(0, Math.round(finiteNumber(stats.totalRecitedSeconds))),
    accuracy_rate: clamp(Math.round(finiteNumber(stats.accuracyRate) * 100) / 100, 0, 100),
    mistakes_fixed_count: Math.max(0, Math.round(finiteNumber(stats.mistakesFixedCount))),
    completed_surahs: [...new Set(stats.completedSurahs.filter(Number.isInteger))],
    unlocked_badge_ids: [...new Set(stats.unlockedBadgeIds.filter((id) => typeof id === 'string'))],
  };
}

export function rowToStats(row: UserStatsRow, fallbackLevel: string): UserStats {
  const points = Math.max(0, finiteNumber(row.points));
  return {
    points,
    level: typeof row.level === 'string' && row.level ? row.level : fallbackLevel,
    streakDays: Math.max(0, Math.round(finiteNumber(row.streak_days))),
    lastActiveDate: toIsoString(row.last_active_date, ''),
    totalVersesRecited: Math.max(0, Math.round(finiteNumber(row.total_verses_recited))),
    totalRecitedSeconds: Math.max(0, Math.round(finiteNumber(row.total_recited_seconds))),
    accuracyRate: clamp(finiteNumber(row.accuracy_rate), 0, 100),
    mistakesFixedCount: Math.max(0, Math.round(finiteNumber(row.mistakes_fixed_count))),
    completedSurahs: Array.isArray(row.completed_surahs) ? row.completed_surahs : [],
    unlockedBadgeIds: Array.isArray(row.unlocked_badge_ids) ? row.unlocked_badge_ids : [],
  };
}

function scheduleStatusFor(dueAt: string, now: number): 'due' | 'scheduled' {
  const due = Date.parse(dueAt);
  return Number.isFinite(due) && due <= now ? 'due' : 'scheduled';
}

function lastResultFor(mastery: VerseMastery): 'success' | 'failure' | null {
  if (mastery.level === 'new') return null;
  return mastery.level === 'review_needed' ? 'failure' : 'success';
}

/** Builds the `memorization_progress` rows, skipping verses missing from the index. */
export function buildProgressRows(
  mastery: Record<string, VerseMastery>,
  index: AyahIndex,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const verse of Object.values(mastery)) {
    const ayahId = index.idOf(`${verse.surahNumber}:${verse.ayahNumber}`);
    if (ayahId === undefined) continue;
    rows.push({
      ayah_id: ayahId,
      status: MASTERY_LEVELS.includes(verse.level) ? verse.level : 'new',
      consecutive_success_count: Math.max(
        0,
        Math.round(finiteNumber(verse.consecutiveSuccessCount)),
      ),
      mistake_count: Math.max(0, Math.round(finiteNumber(verse.mistakeCount))),
      last_reviewed_at: toIsoString(verse.lastReviewedAt, new Date().toISOString()),
    });
  }
  return rows;
}

/** Builds the SM-2 `review_schedule` rows, skipping verses missing from the index. */
export function buildScheduleRows(
  mastery: Record<string, VerseMastery>,
  index: AyahIndex,
  now = Date.now(),
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const verse of Object.values(mastery)) {
    const ayahId = index.idOf(`${verse.surahNumber}:${verse.ayahNumber}`);
    if (ayahId === undefined) continue;

    const fallbackDue = toIsoString(verse.lastReviewedAt, new Date(now).toISOString());
    const dueAt = toIsoString(verse.nextReviewAt, fallbackDue);
    const intervalDays = Math.max(1, Math.round(finiteNumber(verse.intervalDays, 1)));
    const easeFactor = Math.max(1.3, finiteNumber(verse.easeFactor, 2.5));

    rows.push({
      ayah_id: ayahId,
      due_at: dueAt,
      last_result: lastResultFor(verse),
      last_reviewed_at: toIsoString(verse.lastReviewedAt, fallbackDue),
      interval_days: intervalDays,
      ease_factor: Math.round(easeFactor * 100) / 100,
      repetition_count: Math.max(0, Math.round(finiteNumber(verse.repetitionCount))),
      status: scheduleStatusFor(dueAt, now),
    });
  }
  return rows;
}

/** Rebuilds the legacy mastery map from `memorization_progress` + `review_schedule`. */
export function rowsToMastery(
  progressRows: ProgressRow[],
  scheduleRows: ScheduleRow[],
  index: AyahIndex,
): Record<string, VerseMastery> {
  const schedulesById = new Map(scheduleRows.map((row) => [row.ayah_id, row] as const));
  const mastery: Record<string, VerseMastery> = {};

  for (const progress of progressRows) {
    const key = index.keyOf(progress.ayah_id);
    if (!key) continue;
    const [surahNumber, ayahNumber] = key.split(':').map(Number);
    const schedule = schedulesById.get(progress.ayah_id);
    const now = new Date().toISOString();
    const lastReviewedAt = toIsoString(
      progress.last_reviewed_at ?? schedule?.last_reviewed_at,
      now,
    );

    mastery[key.replace(':', '_')] = {
      surahNumber,
      ayahNumber,
      level: MASTERY_LEVELS.includes(progress.status) ? progress.status : 'new',
      consecutiveSuccessCount: Math.max(
        0,
        Math.round(finiteNumber(progress.consecutive_success_count)),
      ),
      mistakeCount: Math.max(0, Math.round(finiteNumber(progress.mistake_count))),
      repetitionCount: Math.max(0, Math.round(finiteNumber(schedule?.repetition_count))),
      easeFactor: Math.max(1.3, finiteNumber(schedule?.ease_factor, 2.5)),
      intervalDays: Math.max(1, Math.round(finiteNumber(schedule?.interval_days, 1))),
      lastReviewedAt,
      nextReviewAt: toIsoString(schedule?.due_at, lastReviewedAt),
      recentMistakes: [],
    };
  }

  // A schedule can exist without progress (for example after a partial import).
  for (const schedule of scheduleRows) {
    const key = index.keyOf(schedule.ayah_id);
    if (!key) continue;
    const mapKey = key.replace(':', '_');
    if (mastery[mapKey]) continue;

    const [surahNumber, ayahNumber] = key.split(':').map(Number);
    const lastReviewedAt = toIsoString(schedule.last_reviewed_at, new Date().toISOString());
    mastery[mapKey] = {
      surahNumber,
      ayahNumber,
      level: schedule.last_result === 'failure' ? 'review_needed' : 'learning',
      consecutiveSuccessCount: 0,
      mistakeCount: 0,
      repetitionCount: Math.max(0, Math.round(finiteNumber(schedule.repetition_count))),
      easeFactor: Math.max(1.3, finiteNumber(schedule.ease_factor, 2.5)),
      intervalDays: Math.max(1, Math.round(finiteNumber(schedule.interval_days, 1))),
      lastReviewedAt,
      nextReviewAt: toIsoString(schedule.due_at, lastReviewedAt),
      recentMistakes: [],
    };
  }

  return mastery;
}

// ────────────────────────────────────────────────────────────
// Writes
// ────────────────────────────────────────────────────────────

async function upsertRows(
  client: SupabaseClient,
  table: 'profiles' | 'user_stats' | 'memorization_progress' | 'review_schedule',
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  for (let start = 0; start < rows.length; start += UPSERT_CHUNK_SIZE) {
    const { error } = await client
      .from(table)
      .upsert(rows.slice(start, start + UPSERT_CHUNK_SIZE), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/**
 * Mirrors a progress snapshot into the normalized tables. The legacy tables are
 * still written by `storageService`, so a failure here never blocks the app.
 */
export async function saveNormalizedProgress(
  client: SupabaseClient,
  userId: string,
  snapshot: NormalizedProgressSnapshot,
): Promise<void> {
  const index = await getAyahIndex(client);
  const progressRows = buildProgressRows(snapshot.mastery, index);
  const scheduleRows = buildScheduleRows(snapshot.mastery, index);

  await upsertRows(
    client,
    'profiles',
    [
      {
        id: userId,
        daily_verse_goal: clamp(Math.round(snapshot.dailyVerseGoal), 1, 100),
        revision_reminder_enabled: snapshot.reminder.enabled,
        revision_reminder_time: snapshot.reminder.time,
        locale: 'ar',
        timezone: resolveTimezone(),
      },
    ],
    'id',
  );

  await upsertRows(
    client,
    'user_stats',
    [{ user_id: userId, ...statsToRow(snapshot.stats) }],
    'user_id',
  );

  if (progressRows.length > 0) {
    await upsertRows(client, 'memorization_progress', progressRows, 'user_id,ayah_id');
  }
  if (scheduleRows.length > 0) {
    await upsertRows(client, 'review_schedule', scheduleRows, 'user_id,ayah_id');
  }
}

function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// ────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────

async function fetchProgressRows(client: SupabaseClient, userId: string): Promise<ProgressRow[]> {
  return collectPages<ProgressRow>((from, to) =>
    client
      .from('memorization_progress')
      .select('ayah_id,status,consecutive_success_count,mistake_count,last_reviewed_at')
      .eq('user_id', userId)
      .order('ayah_id', { ascending: true })
      .range(from, to),
  );
}

async function fetchScheduleRows(client: SupabaseClient, userId: string): Promise<ScheduleRow[]> {
  return collectPages<ScheduleRow>((from, to) =>
    client
      .from('review_schedule')
      .select(
        'ayah_id,due_at,last_result,last_reviewed_at,interval_days,ease_factor,repetition_count',
      )
      .eq('user_id', userId)
      .order('ayah_id', { ascending: true })
      .range(from, to),
  );
}

/** Reads the normalized snapshot and converts it back to the client shape. */
export async function fetchNormalizedProgress(
  client: SupabaseClient,
  userId: string,
  fallbackLevel: string,
): Promise<NormalizedProgress> {
  const index = await getAyahIndex(client);

  const [profileResult, statsResult, progressRows, scheduleRows] = await Promise.all([
    client
      .from('profiles')
      .select('daily_verse_goal,revision_reminder_enabled,revision_reminder_time')
      .eq('id', userId)
      .maybeSingle(),
    client
      .from('user_stats')
      .select(
        'points,level,streak_days,last_active_date,total_verses_recited,total_recited_seconds,accuracy_rate,mistakes_fixed_count,completed_surahs,unlocked_badge_ids',
      )
      .eq('user_id', userId)
      .maybeSingle(),
    fetchProgressRows(client, userId),
    fetchScheduleRows(client, userId),
  ]);

  if (profileResult.error) throw new Error(`profiles: ${profileResult.error.message}`);
  if (statsResult.error) throw new Error(`user_stats: ${statsResult.error.message}`);

  const profileRow = profileResult.data as ProfileRow | null;
  const statsRow = statsResult.data as UserStatsRow | null;

  return {
    stats: statsRow ? rowToStats(statsRow, fallbackLevel) : null,
    profile: profileRow
      ? {
          dailyVerseGoal: clamp(Math.round(finiteNumber(profileRow.daily_verse_goal, 10)), 1, 100),
          reminder: {
            enabled: profileRow.revision_reminder_enabled === true,
            time:
              typeof profileRow.revision_reminder_time === 'string' &&
              /^([01]\d|2[0-3]):[0-5]\d/.test(profileRow.revision_reminder_time)
                ? profileRow.revision_reminder_time.slice(0, 5)
                : '09:00',
          },
        }
      : null,
    mastery: rowsToMastery(progressRows, scheduleRows, index),
  };
}
