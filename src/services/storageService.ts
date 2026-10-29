import type {
  UserStats,
  VerseMastery,
  RevisionPlan,
  Badge,
  FriendUser,
  QuranChallenge,
} from '../types/quran';
import { supabase } from './supabase';
import { fetchNormalizedProgress, saveNormalizedProgress } from './normalizedProgressService';

const STATS_KEY = 'murattil_user_stats';
const MASTERY_KEY = 'murattil_verse_mastery';
const PLANS_KEY = 'murattil_revision_plans';
const FRIENDS_KEY = 'murattil_friends';
const CHALLENGES_KEY = 'murattil_challenges';
const DAILY_ACTIVITY_KEY = 'murattil_daily_activity';
const DAILY_GOAL_KEY = 'murattil_daily_verse_goal';
const REVISION_REMINDER_KEY = 'murattil_revision_reminder';
const STORAGE_OWNER_KEY = 'murattil_storage_owner';
const STORAGE_KEYS = [
  STATS_KEY,
  MASTERY_KEY,
  PLANS_KEY,
  FRIENDS_KEY,
  CHALLENGES_KEY,
  DAILY_ACTIVITY_KEY,
  DAILY_GOAL_KEY,
  REVISION_REMINDER_KEY,
];

const MAX_ACTIVITY_DAYS = 30;
const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ProgressSyncStatus = 'syncing' | 'synced' | 'error';

export interface DailyRecitationActivity {
  date: string;
  verses: number;
  sessions: number;
}

export interface RevisionReminderSettings {
  enabled: boolean;
  time: string;
}

const DEFAULT_REVISION_REMINDER: RevisionReminderSettings = {
  enabled: false,
  time: '09:00',
};

let storageUserId: string | null = null;
let syncStatusListener: ((status: ProgressSyncStatus, error?: unknown) => void) | null = null;
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let syncQueue: Promise<void> = Promise.resolve();
let isHydratingFromCloud = false;
let syncGeneration = 0;
let masteryCache: { storageKey: string; value: Record<string, VerseMastery> } | null = null;

// ────────────────────────────────────────────────────────────
// localStorage helpers
// ────────────────────────────────────────────────────────────

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch (error) {
    console.warn(`Unable to read ${key} from localStorage`, error);
    return null;
  }
}

function writeRaw(key: string, value: string): boolean {
  try {
    getStorage()?.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Unable to save ${key} to localStorage`, error);
    return false;
  }
}

function readJson(key: string): unknown {
  const raw = readRaw(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn(`Unable to parse ${key} from localStorage`, error);
    return undefined;
  }
}

function writeJson(key: string, value: unknown): boolean {
  return writeRaw(key, JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNonNegativeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readJsonArray<T>(key: string, isValid: (item: unknown) => item is T): T[] {
  const parsed = readJson(key);
  return Array.isArray(parsed) ? parsed.filter(isValid) : [];
}

function storageKey(key: string): string {
  return storageUserId ? `${key}:${storageUserId}` : key;
}

function resolveLevel(points: number): string {
  if (points >= 5000) return 'حافظ متقن ومجاز';
  if (points >= 3000) return 'فارس الحُفاظ';
  if (points >= 1500) return 'طالب إتقان متقدم';
  return points > 0 ? 'حافظ مبتدئ' : 'مبتدئ';
}

export function setStorageUserId(userId: string | null): void {
  if (storageUserId !== userId) {
    syncGeneration += 1;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = undefined;
    syncStatusListener = null;
  }
  storageUserId = userId;
  masteryCache = null;
  if (!userId || readRaw(STORAGE_OWNER_KEY)) return;

  // Adopt pre-sync local progress once, for the first authenticated account on this device.
  for (const key of STORAGE_KEYS) {
    const existing = readRaw(key);
    if (existing !== null && readRaw(storageKey(key)) === null) {
      writeRaw(storageKey(key), existing);
    }
  }
  writeRaw(STORAGE_OWNER_KEY, userId);
}

// ────────────────────────────────────────────────────────────
// Cloud synchronization
// ────────────────────────────────────────────────────────────

function notifySyncStatus(status: ProgressSyncStatus, error?: unknown): void {
  syncStatusListener?.(status, error);
}

let lastNormalizedSyncWarning: string | null = null;

/**
 * The normalized tables are written next to the legacy ones during phase 2.
 * A failure there must not degrade the user experience as long as the legacy
 * tables are up to date, so it is logged once instead of surfaced as a sync
 * error.
 */
function warnNormalizedSync(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (message === lastNormalizedSyncWarning) return;
  lastNormalizedSyncWarning = message;
  console.warn('Normalized progress sync failed; legacy tables remain authoritative.', message);
}

function scheduleProgressSync(): void {
  if (!storageUserId || !supabase || isHydratingFromCloud) return;
  const userId = storageUserId;
  const generation = syncGeneration;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = undefined;
    if (storageUserId !== userId || syncGeneration !== generation) return;
    syncQueue = syncQueue
      .then(async () => {
        if (storageUserId === userId && syncGeneration === generation) {
          await uploadProgressSnapshot(generation);
        }
      })
      .catch((error: unknown) => {
        if (storageUserId !== userId || syncGeneration !== generation) return;
        console.error('Unable to synchronize Quran progress:', error);
        notifySyncStatus('error', error);
      });
  }, 500);
}

function mergeStats(local: UserStats, remote: UserStats | null): UserStats {
  if (!remote) return local;
  const points = Math.max(local.points, remote.points);
  const merged: UserStats = {
    ...remote,
    points,
    streakDays: Math.max(local.streakDays, remote.streakDays),
    lastActiveDate:
      local.lastActiveDate > remote.lastActiveDate ? local.lastActiveDate : remote.lastActiveDate,
    totalVersesRecited: Math.max(local.totalVersesRecited, remote.totalVersesRecited),
    totalRecitedSeconds: Math.max(local.totalRecitedSeconds, remote.totalRecitedSeconds),
    accuracyRate: Math.max(local.accuracyRate, remote.accuracyRate),
    mistakesFixedCount: Math.max(local.mistakesFixedCount, remote.mistakesFixedCount),
    completedSurahs: [...new Set([...local.completedSurahs, ...remote.completedSurahs])],
    unlockedBadgeIds: [...new Set([...local.unlockedBadgeIds, ...remote.unlockedBadgeIds])],
  };
  merged.level = resolveLevel(points);
  return merged;
}

function mergeMastery(
  local: Record<string, VerseMastery>,
  remote: Record<string, VerseMastery>,
): Record<string, VerseMastery> {
  const merged = { ...remote };
  for (const [key, localVerse] of Object.entries(local)) {
    const remoteVerse = merged[key];
    if (!remoteVerse || localVerse.lastReviewedAt > remoteVerse.lastReviewedAt) {
      merged[key] = localVerse;
    }
  }
  return merged;
}

async function uploadProgressSnapshot(generation = syncGeneration): Promise<void> {
  if (!storageUserId || !supabase) return;
  const userId = storageUserId;
  const client = supabase;
  notifySyncStatus('syncing');

  const stats = getUserStats();
  const mastery = getVerseMasteryMap();
  const activity = readLocalDailyActivity();
  const [statsResult, masteryResult, activityResult] = await Promise.all([
    client.from('user_progress').upsert({ user_id: userId, stats }, { onConflict: 'user_id' }),
    client.from('verse_mastery').upsert(
      Object.values(mastery).map((verse) => ({
        user_id: userId,
        surah_number: verse.surahNumber,
        ayah_number: verse.ayahNumber,
        mastery: verse,
      })),
      { onConflict: 'user_id,surah_number,ayah_number' },
    ),
    client.from('daily_activity').upsert(
      activity.map((day) => ({
        user_id: userId,
        activity_date: day.date,
        verses: day.verses,
        sessions: day.sessions,
      })),
      { onConflict: 'user_id,activity_date' },
    ),
  ]);

  // Phase 2 double write: the normalized schema receives the same snapshot.
  const normalizedError = await saveNormalizedProgress(client, userId, {
    stats,
    mastery,
    dailyVerseGoal: getDailyVerseGoal(),
    reminder: getRevisionReminderSettings(),
  }).then(
    () => null,
    (error: unknown) => error,
  );

  if (storageUserId !== userId || syncGeneration !== generation) return;
  if (normalizedError) warnNormalizedSync(normalizedError);
  const error = statsResult.error || masteryResult.error || activityResult.error;
  if (error) {
    notifySyncStatus('error', error);
    throw error;
  }
  notifySyncStatus('synced');
}

export async function syncProgressFromCloud(
  userId: string,
  onStatus: (status: ProgressSyncStatus, error?: unknown) => void,
): Promise<void> {
  setStorageUserId(userId);
  syncStatusListener = onStatus;
  const generation = ++syncGeneration;
  if (!supabase) {
    const error = new Error('Supabase is not configured');
    notifySyncStatus('error', error);
    throw error;
  }
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = undefined;
  notifySyncStatus('syncing');

  const [statsResult, masteryResult, activityResult] = await Promise.all([
    supabase.from('user_progress').select('stats').eq('user_id', userId).maybeSingle(),
    supabase.from('verse_mastery').select('mastery').eq('user_id', userId),
    supabase.from('daily_activity').select('activity_date,verses,sessions').eq('user_id', userId),
  ]);
  if (storageUserId !== userId || syncGeneration !== generation) return;
  const error = statsResult.error || masteryResult.error || activityResult.error;
  if (error) {
    notifySyncStatus('error', error);
    throw error;
  }

  const localStats = getUserStats();
  const remoteStats = (statsResult.data?.stats as UserStats | undefined) ?? null;

  // Phase 2: read the normalized snapshot too. On a first run after the
  // migration it is empty, and the merged legacy data is written back to it.
  const normalized = await fetchNormalizedProgress(supabase, userId, localStats.level).catch(
    (normalizedError: unknown) => {
      warnNormalizedSync(normalizedError);
      return null;
    },
  );
  if (storageUserId !== userId || syncGeneration !== generation) return;

  const mergedStats = mergeStats(mergeStats(localStats, remoteStats), normalized?.stats ?? null);
  const remoteMastery = Object.fromEntries(
    (masteryResult.data ?? []).map((row) => {
      const mastery = row.mastery as VerseMastery;
      return [`${mastery.surahNumber}_${mastery.ayahNumber}`, mastery];
    }),
  ) as Record<string, VerseMastery>;
  const mergedMastery = mergeMastery(
    mergeMastery(getVerseMasteryMap(), remoteMastery),
    normalized?.mastery ?? {},
  );
  const activityByDate = new Map(readLocalDailyActivity().map((day) => [day.date, day]));
  for (const row of activityResult.data ?? []) {
    const date = row.activity_date as string;
    const local = activityByDate.get(date);
    activityByDate.set(date, {
      date,
      verses: Math.max(local?.verses ?? 0, row.verses as number),
      sessions: Math.max(local?.sessions ?? 0, row.sessions as number),
    });
  }

  isHydratingFromCloud = true;
  try {
    saveUserStats(mergedStats);
    saveVerseMasteryMap(mergedMastery);
    saveDailyActivity([...activityByDate.values()].sort((a, b) => a.date.localeCompare(b.date)));

    // Settings live in `profiles` now. Adopt the remote value only when this
    // device never stored an explicit preference, so a fresh install inherits
    // the account settings without overwriting local choices.
    if (normalized?.profile) {
      if (readRaw(storageKey(DAILY_GOAL_KEY)) === null) {
        saveDailyVerseGoal(normalized.profile.dailyVerseGoal);
      }
      if (readRaw(storageKey(REVISION_REMINDER_KEY)) === null) {
        saveRevisionReminderSettings(normalized.profile.reminder);
      }
    }
  } finally {
    isHydratingFromCloud = false;
  }
  await uploadProgressSnapshot(generation);
}

export function stopProgressSync(): void {
  syncStatusListener = null;
}

export async function retryProgressSync(): Promise<void> {
  if (!storageUserId || !supabase) return;
  try {
    await uploadProgressSnapshot();
  } catch (error) {
    notifySyncStatus('error', error);
    throw error;
  }
}

// ────────────────────────────────────────────────────────────
// Daily activity & goals
// ────────────────────────────────────────────────────────────

function isDailyActivity(value: unknown): value is DailyRecitationActivity {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    typeof value.verses === 'number' &&
    Number.isFinite(value.verses) &&
    typeof value.sessions === 'number' &&
    Number.isFinite(value.sessions)
  );
}

function readLocalDailyActivity(): DailyRecitationActivity[] {
  return readJsonArray(storageKey(DAILY_ACTIVITY_KEY), isDailyActivity);
}

function saveDailyActivity(activity: DailyRecitationActivity[]): void {
  if (writeJson(storageKey(DAILY_ACTIVITY_KEY), activity.slice(-MAX_ACTIVITY_DAYS))) {
    scheduleProgressSync();
  }
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDailyRecitationActivity(dayCount = 7): DailyRecitationActivity[] {
  const savedByDate = new Map(
    readLocalDailyActivity().map((entry) => [entry.date, entry] as const),
  );
  const count = Math.max(1, dayCount);
  const today = new Date();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - index - 1));
    const dateKey = getLocalDateKey(date);
    const savedDay = savedByDate.get(dateKey);
    return {
      date: dateKey,
      verses: savedDay?.verses ?? 0,
      sessions: savedDay?.sessions ?? 0,
    };
  });
}

function updateTodayActivity(update: (today: DailyRecitationActivity) => void): void {
  const date = getLocalDateKey(new Date());
  const activity = getDailyRecitationActivity(MAX_ACTIVITY_DAYS);
  let today = activity.find((entry) => entry.date === date);
  if (!today) {
    today = { date, verses: 0, sessions: 0 };
    activity.push(today);
  }
  update(today);
  saveDailyActivity(activity);
}

export function getDailyVerseGoal(): number {
  const parsed = Number(readRaw(storageKey(DAILY_GOAL_KEY)));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 10;
}

export function saveDailyVerseGoal(goal: number): void {
  const validGoal = Math.max(1, Math.min(100, Math.round(goal)));
  writeRaw(storageKey(DAILY_GOAL_KEY), String(validGoal));
}

export function getRevisionReminderSettings(): RevisionReminderSettings {
  const parsed = readJson(storageKey(REVISION_REMINDER_KEY));
  if (
    isRecord(parsed) &&
    typeof parsed.enabled === 'boolean' &&
    typeof parsed.time === 'string' &&
    REMINDER_TIME_PATTERN.test(parsed.time)
  ) {
    return { enabled: parsed.enabled, time: parsed.time };
  }
  return { ...DEFAULT_REVISION_REMINDER };
}

export function saveRevisionReminderSettings(settings: RevisionReminderSettings): void {
  if (!REMINDER_TIME_PATTERN.test(settings.time)) {
    throw new Error('صيغة وقت التنبيه غير صالحة.');
  }
  writeJson(storageKey(REVISION_REMINDER_KEY), settings);
}

function recordDailyActivity(versesCount: number): void {
  if (versesCount <= 0) return;
  updateTodayActivity((today) => {
    today.verses += versesCount;
  });
}

export function recordRecitationSession(): void {
  updateTodayActivity((today) => {
    today.sessions += 1;
  });
}

// ────────────────────────────────────────────────────────────
// Stats
// ────────────────────────────────────────────────────────────

function createDefaultStats(): UserStats {
  return {
    points: 0,
    level: 'مبتدئ',
    streakDays: 0,
    // A brand-new account has not recited yet. Keeping the field empty lets the
    // merge prefer a real remote date instead of "now".
    lastActiveDate: '',
    totalVersesRecited: 0,
    totalRecitedSeconds: 0,
    accuracyRate: 0,
    mistakesFixedCount: 0,
    completedSurahs: [],
    unlockedBadgeIds: [],
  };
}

function normalizeStats(value: unknown): UserStats {
  if (!isRecord(value)) return createDefaultStats();
  const points = Math.max(0, asFiniteNumber(value.points));
  return {
    points,
    level: typeof value.level === 'string' && value.level ? value.level : resolveLevel(points),
    streakDays: asNonNegativeInteger(value.streakDays),
    lastActiveDate: typeof value.lastActiveDate === 'string' ? value.lastActiveDate : '',
    totalVersesRecited: asNonNegativeInteger(value.totalVersesRecited),
    totalRecitedSeconds: Math.max(0, asFiniteNumber(value.totalRecitedSeconds)),
    accuracyRate: Math.max(0, asFiniteNumber(value.accuracyRate)),
    mistakesFixedCount: asNonNegativeInteger(value.mistakesFixedCount),
    completedSurahs: asNumberArray(value.completedSurahs),
    unlockedBadgeIds: asStringArray(value.unlockedBadgeIds),
  };
}

export function getUserStats(): UserStats {
  const stored = readJson(storageKey(STATS_KEY));
  if (stored !== undefined) return normalizeStats(stored);

  const defaults = createDefaultStats();
  saveUserStats(defaults);
  return defaults;
}

export function saveUserStats(stats: UserStats): void {
  if (writeJson(storageKey(STATS_KEY), stats)) {
    scheduleProgressSync();
  }
}

export function addPointsAndVerses(
  addedPoints: number,
  versesCount: number,
  seconds: number,
  accuracy?: number,
): UserStats {
  const stats = getUserStats();
  stats.points += addedPoints;
  stats.totalVersesRecited += versesCount;
  stats.totalRecitedSeconds += seconds;
  recordDailyActivity(versesCount);

  if (accuracy !== undefined && Number.isFinite(accuracy)) {
    stats.accuracyRate = Math.round(((stats.accuracyRate * 4 + accuracy) / 5) * 10) / 10;
  }

  stats.level = resolveLevel(stats.points);
  saveUserStats(stats);
  return stats;
}

// ────────────────────────────────────────────────────────────
// Verse mastery & spaced repetition
// ────────────────────────────────────────────────────────────

function isVerseMastery(value: unknown): value is VerseMastery {
  return (
    isRecord(value) &&
    typeof value.surahNumber === 'number' &&
    typeof value.ayahNumber === 'number' &&
    typeof value.level === 'string' &&
    typeof value.lastReviewedAt === 'string' &&
    typeof value.nextReviewAt === 'string'
  );
}

function normalizeMasteryMap(value: unknown): Record<string, VerseMastery> {
  if (!isRecord(value)) return {};
  const map: Record<string, VerseMastery> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isVerseMastery(entry)) continue;
    map[key] = {
      ...entry,
      consecutiveSuccessCount: asNonNegativeInteger(entry.consecutiveSuccessCount),
      mistakeCount: asNonNegativeInteger(entry.mistakeCount),
      recentMistakes: Array.isArray(entry.recentMistakes)
        ? entry.recentMistakes.filter(
            (mistake) =>
              isRecord(mistake) &&
              typeof mistake.expectedWord === 'string' &&
              typeof mistake.recitedWord === 'string' &&
              typeof mistake.timestamp === 'string',
          )
        : [],
    };
  }
  return map;
}

export function getVerseMasteryMap(): Record<string, VerseMastery> {
  const key = storageKey(MASTERY_KEY);
  if (masteryCache?.storageKey === key) return masteryCache.value;

  const stored = readJson(key);
  if (stored === undefined) {
    const empty: Record<string, VerseMastery> = {};
    saveVerseMasteryMap(empty);
    return empty;
  }

  const map = normalizeMasteryMap(stored);
  masteryCache = { storageKey: key, value: map };
  return map;
}

export function saveVerseMasteryMap(map: Record<string, VerseMastery>): void {
  masteryCache = { storageKey: storageKey(MASTERY_KEY), value: map };
  if (writeJson(storageKey(MASTERY_KEY), map)) {
    scheduleProgressSync();
  }
}

/**
 * Records a verse recitation in the spaced-repetition system (SM-2).
 */
export function recordVerseResult(
  surahNumber: number,
  ayahNumber: number,
  isFlawless: boolean,
  mistakes: { expectedWord: string; recitedWord: string }[] = [],
): VerseMastery {
  const map = getVerseMasteryMap();
  const key = `${surahNumber}_${ayahNumber}`;
  const now = new Date();

  const existing = map[key];
  const current: VerseMastery = existing
    ? { ...existing, recentMistakes: [...existing.recentMistakes] }
    : {
        surahNumber,
        ayahNumber,
        level: 'new',
        consecutiveSuccessCount: 0,
        mistakeCount: 0,
        lastReviewedAt: now.toISOString(),
        nextReviewAt: now.toISOString(),
        recentMistakes: [],
      };

  const previousRepetitionCount =
    typeof current.repetitionCount === 'number' &&
    Number.isInteger(current.repetitionCount) &&
    current.repetitionCount >= 0
      ? current.repetitionCount
      : current.consecutiveSuccessCount;
  const previousEaseFactor =
    typeof current.easeFactor === 'number' &&
    Number.isFinite(current.easeFactor) &&
    current.easeFactor >= 1.3
      ? current.easeFactor
      : 2.5;
  const inferredLegacyInterval = Math.round(
    (Date.parse(current.nextReviewAt) - Date.parse(current.lastReviewedAt)) / 86_400_000,
  );
  const previousInterval =
    typeof current.intervalDays === 'number' &&
    Number.isFinite(current.intervalDays) &&
    current.intervalDays > 0
      ? current.intervalDays
      : Number.isFinite(inferredLegacyInterval)
        ? Math.max(1, inferredLegacyInterval)
        : 1;
  const quality = isFlawless ? 5 : 2;
  const easeFactor = Math.max(
    1.3,
    previousEaseFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  );
  const repetitionCount = quality < 3 ? 0 : previousRepetitionCount + 1;
  const intervalDays =
    quality < 3
      ? 1
      : previousRepetitionCount === 0
        ? 1
        : previousRepetitionCount === 1
          ? 6
          : Math.max(1, Math.round(previousInterval * previousEaseFactor));

  current.repetitionCount = repetitionCount;
  current.easeFactor = easeFactor;
  current.intervalDays = intervalDays;
  current.lastReviewedAt = now.toISOString();
  current.nextReviewAt = new Date(now.getTime() + intervalDays * 86_400_000).toISOString();

  if (isFlawless) {
    current.consecutiveSuccessCount += 1;
    current.level = current.consecutiveSuccessCount >= 3 ? 'mastered' : 'good';
  } else {
    current.mistakeCount += 1;
    current.consecutiveSuccessCount = 0;
    current.level = 'review_needed';

    if (mistakes.length > 0) {
      current.recentMistakes = [
        ...mistakes.map((mistake) => ({ ...mistake, timestamp: now.toISOString() })),
        ...current.recentMistakes,
      ].slice(0, 5);
    }
  }

  map[key] = current;
  saveVerseMasteryMap(map);
  return current;
}

/**
 * Returns all verses that need review or reinforcement due to past mistakes.
 */
export function getVersesNeedingReinforcement(): VerseMastery[] {
  const now = new Date();
  return Object.values(getVerseMasteryMap()).filter(
    (item) =>
      item.level === 'review_needed' || item.mistakeCount > 0 || new Date(item.nextReviewAt) <= now,
  );
}

export function getVersesDueForReview(now = new Date()): VerseMastery[] {
  const nowTime = now.getTime();
  return Object.values(getVerseMasteryMap()).filter((item) => {
    const nextReviewTime = Date.parse(item.nextReviewAt);
    return Number.isFinite(nextReviewTime) && nextReviewTime <= nowTime;
  });
}

// ────────────────────────────────────────────────────────────
// Revision plans, friends & challenges
// ────────────────────────────────────────────────────────────

function isRevisionPlan(value: unknown): value is RevisionPlan {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.category === 'string' &&
    Array.isArray(value.targetSurahs)
  );
}

function isFriend(value: unknown): value is FriendUser {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isChallenge(value: unknown): value is QuranChallenge {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.surahNumber === 'number'
  );
}

export function getRevisionPlans(): RevisionPlan[] {
  const stored = readJson(storageKey(PLANS_KEY));
  if (stored === undefined) {
    saveRevisionPlans([]);
    return [];
  }
  return readJsonArray(storageKey(PLANS_KEY), isRevisionPlan);
}

export function saveRevisionPlans(plans: RevisionPlan[]): void {
  writeJson(storageKey(PLANS_KEY), plans);
}

export function resetRevisionData(): void {
  saveRevisionPlans([]);
  saveVerseMasteryMap({});
}

export function getFriends(): FriendUser[] {
  const stored = readJson(storageKey(FRIENDS_KEY));
  if (stored === undefined) {
    saveFriends([]);
    return [];
  }
  return readJsonArray(storageKey(FRIENDS_KEY), isFriend);
}

export function saveFriends(friends: FriendUser[]): void {
  writeJson(storageKey(FRIENDS_KEY), friends);
}

export function getChallenges(): QuranChallenge[] {
  const stored = readJson(storageKey(CHALLENGES_KEY));
  if (stored === undefined) {
    saveChallenges([]);
    return [];
  }
  return readJsonArray(storageKey(CHALLENGES_KEY), isChallenge);
}

export function saveChallenges(challenges: QuranChallenge[]): void {
  writeJson(storageKey(CHALLENGES_KEY), challenges);
}

export function resetCompetitionData(): void {
  saveFriends([]);
  saveChallenges([]);
}

// ────────────────────────────────────────────────────────────
// Badges catalogue
// ────────────────────────────────────────────────────────────

export const INITIAL_BADGES: Badge[] = [
  {
    id: 'first_recitation',
    title: 'بداية النور',
    description: 'إتمام أول جلسة تسميع ومراجعة بنجاح',
    icon: '✨',
    pointsReward: 100,
    conditionDescription: 'تسميع أول آية بنجاح',
  },
  {
    id: 'streak_3',
    title: 'شعلة الاستمرار',
    description: 'المحافظة على الحفظ لـ 3 أيام متتالية',
    icon: '🔥',
    pointsReward: 250,
    conditionDescription: '3 أيام تتابع متصلة',
  },
  {
    id: 'streak_7',
    title: 'همّة الحفّاظ',
    description: 'المواظبة على الورد القرآني أسبوعاً كاملاً',
    icon: '🌟',
    pointsReward: 500,
    conditionDescription: '7 أيام متتالية من المراجعة',
  },
  {
    id: 'flawless_surah',
    title: 'سفير الإتقان',
    description: 'تسميع سورة كاملة بنسبة دقة 100% دون أي خطأ',
    icon: '💎',
    pointsReward: 600,
    conditionDescription: 'سورة كاملة بلا أي خطأ',
  },
  {
    id: 'mistake_fixer',
    title: 'طبيب الحفظ',
    description: 'مراجعة وتصحيح 5 آيات كانت منسية أو ملتبسة',
    icon: '🛡️',
    pointsReward: 350,
    conditionDescription: 'تصحيح 5 آيات متعثرة',
  },
  {
    id: 'juz_master',
    title: 'فارس جزء عم',
    description: 'إتقان ومراجعة سور جزء عم وتثبيتها',
    icon: '👑',
    pointsReward: 1200,
    conditionDescription: 'إتقان سور جزء عم',
  },
];
