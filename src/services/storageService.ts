import {
  UserStats,
  VerseMastery,
  RevisionPlan,
  Badge,
  FriendUser,
  QuranChallenge,
} from '../types/quran';
import { supabase } from './supabase';

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

export type ProgressSyncStatus = 'syncing' | 'synced' | 'error';

export interface RevisionReminderSettings {
  enabled: boolean;
  time: string;
}

function isRevisionReminderSettings(value: unknown): value is RevisionReminderSettings {
  return (
    typeof value === 'object' &&
    value !== null &&
    'enabled' in value &&
    typeof value.enabled === 'boolean' &&
    'time' in value &&
    typeof value.time === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)
  );
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

function storageKey(key: string): string {
  return storageUserId ? `${key}:${storageUserId}` : key;
}

export function setStorageUserId(userId: string | null): void {
  if (storageUserId !== userId) {
    syncGeneration += 1;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = undefined;
    syncStatusListener = null;
  }
  storageUserId = userId;
  if (!userId || localStorage.getItem(STORAGE_OWNER_KEY)) return;

  // Adopt pre-sync local progress once, for the first authenticated account on this device.
  for (const key of STORAGE_KEYS) {
    const existing = localStorage.getItem(key);
    if (existing !== null && localStorage.getItem(storageKey(key)) === null) {
      localStorage.setItem(storageKey(key), existing);
    }
  }
  localStorage.setItem(STORAGE_OWNER_KEY, userId);
}

function notifySyncStatus(status: ProgressSyncStatus, error?: unknown): void {
  syncStatusListener?.(status, error);
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

function readLocalDailyActivity(): DailyRecitationActivity[] {
  try {
    const raw = localStorage.getItem(storageKey(DAILY_ACTIVITY_KEY));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DailyRecitationActivity =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.date === 'string' &&
        typeof item.verses === 'number' &&
        Number.isFinite(item.verses) &&
        typeof item.sessions === 'number' &&
        Number.isFinite(item.sessions),
    );
  } catch (error) {
    console.warn('Unable to read daily recitation activity from localStorage', error);
    return [];
  }
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
  if (points >= 5000) merged.level = 'حافظ متقن ومجاز';
  else if (points >= 3000) merged.level = 'فارس الحُفاظ';
  else if (points >= 1500) merged.level = 'طالب إتقان متقدم';
  else merged.level = 'حافظ مبتدئ';
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
  notifySyncStatus('syncing');

  const stats = getUserStats();
  const mastery = getVerseMasteryMap();
  const activity = readLocalDailyActivity();
  const [statsResult, masteryResult, activityResult] = await Promise.all([
    supabase.from('user_progress').upsert({ user_id: userId, stats }, { onConflict: 'user_id' }),
    supabase.from('verse_mastery').upsert(
      Object.values(mastery).map((verse) => ({
        user_id: userId,
        surah_number: verse.surahNumber,
        ayah_number: verse.ayahNumber,
        mastery: verse,
      })),
      { onConflict: 'user_id,surah_number,ayah_number' },
    ),
    supabase.from('daily_activity').upsert(
      activity.map((day) => ({
        user_id: userId,
        activity_date: day.date,
        verses: day.verses,
        sessions: day.sessions,
      })),
      { onConflict: 'user_id,activity_date' },
    ),
  ]);
  if (storageUserId !== userId || syncGeneration !== generation) return;
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
    supabase
      .from('daily_activity')
      .select('activity_date,verses,sessions')
      .eq('user_id', userId),
  ]);
  if (storageUserId !== userId || syncGeneration !== generation) return;
  const error = statsResult.error || masteryResult.error || activityResult.error;
  if (error) {
    notifySyncStatus('error', error);
    throw error;
  }

  const localStats = getUserStats();
  const remoteStats = (statsResult.data?.stats as UserStats | undefined) ?? null;
  const mergedStats = mergeStats(localStats, remoteStats);
  const remoteMastery = Object.fromEntries(
    (masteryResult.data ?? []).map((row) => {
      const mastery = row.mastery as VerseMastery;
      return [`${mastery.surahNumber}_${mastery.ayahNumber}`, mastery];
    }),
  ) as Record<string, VerseMastery>;
  const mergedMastery = mergeMastery(getVerseMasteryMap(), remoteMastery);
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

function saveDailyActivity(activity: DailyRecitationActivity[]): void {
  try {
    localStorage.setItem(storageKey(DAILY_ACTIVITY_KEY), JSON.stringify(activity.slice(-30)));
    scheduleProgressSync();
  } catch (error) {
    console.warn('Unable to save daily recitation activity to localStorage', error);
  }
}

export interface DailyRecitationActivity {
  date: string;
  verses: number;
  sessions: number;
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDailyRecitationActivity(dayCount = 7): DailyRecitationActivity[] {
  let savedActivity: DailyRecitationActivity[] = [];
  try {
    const raw = localStorage.getItem(storageKey(DAILY_ACTIVITY_KEY));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        savedActivity = parsed
          .filter(
            (item): item is DailyRecitationActivity =>
              typeof item === 'object' &&
              item !== null &&
              typeof item.date === 'string' &&
              typeof item.verses === 'number' &&
              Number.isFinite(item.verses),
          )
          .map((item) => ({
            date: item.date,
            verses: item.verses,
            sessions:
              typeof item.sessions === 'number' && Number.isFinite(item.sessions)
                ? item.sessions
                : 0,
          }));
      }
    }
  } catch (error) {
    console.warn('Unable to read daily recitation activity from localStorage', error);
  }

  const activityByDate = new Map(savedActivity.map((item) => [item.date, item.verses]));
  const today = new Date();
  return Array.from({ length: Math.max(1, dayCount) }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (Math.max(1, dayCount) - index - 1));
    const dateKey = getLocalDateKey(date);
    const savedDay = savedActivity.find((item) => item.date === dateKey);
    return {
      date: dateKey,
      verses: activityByDate.get(dateKey) || 0,
      sessions: savedDay?.sessions || 0,
    };
  });
}

export function getDailyVerseGoal(): number {
  try {
    const raw = localStorage.getItem(storageKey(DAILY_GOAL_KEY));
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 100) return parsed;
  } catch (error) {
    console.warn('Unable to read daily verse goal from localStorage', error);
  }
  return 10;
}

export function getRevisionReminderSettings(): RevisionReminderSettings {
  try {
    const raw = localStorage.getItem(storageKey(REVISION_REMINDER_KEY));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isRevisionReminderSettings(parsed)) return parsed;
    }
  } catch (error) {
    console.warn('Unable to read revision reminder settings from localStorage', error);
  }
  return { ...DEFAULT_REVISION_REMINDER };
}

export function saveRevisionReminderSettings(settings: RevisionReminderSettings): void {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time)) {
    throw new Error('صيغة وقت التنبيه غير صالحة.');
  }
  try {
    localStorage.setItem(storageKey(REVISION_REMINDER_KEY), JSON.stringify(settings));
  } catch (error) {
    console.error('Unable to save revision reminder settings to localStorage', error);
    throw error;
  }
}

export function saveDailyVerseGoal(goal: number): void {
  const validGoal = Math.max(1, Math.min(100, Math.round(goal)));
  try {
    localStorage.setItem(storageKey(DAILY_GOAL_KEY), String(validGoal));
  } catch (error) {
    console.warn('Unable to save daily verse goal to localStorage', error);
  }
}

function recordDailyActivity(versesCount: number): void {
  if (versesCount <= 0) return;
  const date = getLocalDateKey(new Date());
  const activity = getDailyRecitationActivity(30);
  const today = activity.find((item) => item.date === date);
  if (today) today.verses += versesCount;
  else activity.push({ date, verses: versesCount, sessions: 0 });

  try {
    saveDailyActivity(activity);
  } catch (error) {
    console.warn('Unable to save daily recitation activity to localStorage', error);
  }
}

export function recordRecitationSession(): void {
  const date = getLocalDateKey(new Date());
  const activity = getDailyRecitationActivity(30);
  const today = activity.find((item) => item.date === date);
  if (today) today.sessions += 1;
  else activity.push({ date, verses: 0, sessions: 1 });

  try {
    saveDailyActivity(activity);
  } catch (error) {
    console.warn('Unable to save daily recitation session to localStorage', error);
  }
}

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

export function getUserStats(): UserStats {
  try {
    const raw = localStorage.getItem(storageKey(STATS_KEY));
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (error) {
    console.warn('Unable to read user stats from localStorage', error);
  }

  const defaultStats: UserStats = {
    points: 0,
    level: 'مبتدئ',
    streakDays: 0,
    lastActiveDate: new Date().toISOString(),
    totalVersesRecited: 0,
    totalRecitedSeconds: 0,
    accuracyRate: 0,
    mistakesFixedCount: 0,
    completedSurahs: [],
    unlockedBadgeIds: [],
  };

  saveUserStats(defaultStats);
  return defaultStats;
}

export function saveUserStats(stats: UserStats) {
  try {
    localStorage.setItem(storageKey(STATS_KEY), JSON.stringify(stats));
    scheduleProgressSync();
  } catch (error) {
    console.warn('Unable to save user stats to localStorage', error);
  }
}

export function addPointsAndVerses(
  addedPoints: number,
  versesCount: number,
  seconds: number,
  accuracy?: number,
) {
  const stats = getUserStats();
  stats.points += addedPoints;
  stats.totalVersesRecited += versesCount;
  stats.totalRecitedSeconds += seconds;
  recordDailyActivity(versesCount);

  if (accuracy !== undefined && Number.isFinite(accuracy)) {
    stats.accuracyRate = Math.round(((stats.accuracyRate * 4 + accuracy) / 5) * 10) / 10;
  }

  // Level progression
  if (stats.points >= 5000) stats.level = 'حافظ متقن ومجاز';
  else if (stats.points >= 3000) stats.level = 'فارس الحُفاظ';
  else if (stats.points >= 1500) stats.level = 'طالب إتقان متقدم';
  else stats.level = 'حافظ مبتدئ';

  saveUserStats(stats);
  return stats;
}

export function getVerseMasteryMap(): Record<string, VerseMastery> {
  try {
    const raw = localStorage.getItem(storageKey(MASTERY_KEY));
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to read verse mastery from localStorage', error);
  }

  const initial: Record<string, VerseMastery> = {};
  saveVerseMasteryMap(initial);
  return initial;
}

export function saveVerseMasteryMap(map: Record<string, VerseMastery>) {
  try {
    localStorage.setItem(storageKey(MASTERY_KEY), JSON.stringify(map));
    scheduleProgressSync();
  } catch (error) {
    console.warn('Unable to save verse mastery to localStorage', error);
  }
}

/**
 * Record recitation result of a verse in Spaced Repetition System
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

  const current: VerseMastery = map[key] || {
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
  const inferredLegacyInterval =
    Math.round((Date.parse(current.nextReviewAt) - Date.parse(current.lastReviewedAt)) / 86400000);
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
  current.nextReviewAt = new Date(now.getTime() + intervalDays * 86400000).toISOString();

  if (isFlawless) {
    current.consecutiveSuccessCount += 1;

    if (current.consecutiveSuccessCount >= 3) {
      current.level = 'mastered';
    } else {
      current.level = 'good';
    }
  } else {
    current.mistakeCount += 1;
    current.consecutiveSuccessCount = 0;
    current.level = 'review_needed';

    if (mistakes.length > 0) {
      current.recentMistakes = [
        ...mistakes.map((m) => ({ ...m, timestamp: now.toISOString() })),
        ...current.recentMistakes,
      ].slice(0, 5);
    }
  }

  map[key] = current;
  saveVerseMasteryMap(map);
  return current;
}

/**
 * Returns all verses that need review or reinforcement due to past mistakes
 */
export function getVersesNeedingReinforcement(): VerseMastery[] {
  const map = getVerseMasteryMap();
  const now = new Date();

  return Object.values(map).filter((item) => {
    return (
      item.level === 'review_needed' || item.mistakeCount > 0 || new Date(item.nextReviewAt) <= now
    );
  });
}

export function getVersesDueForReview(now = new Date()): VerseMastery[] {
  const nowTime = now.getTime();
  return Object.values(getVerseMasteryMap()).filter((item) => {
    const nextReviewTime = Date.parse(item.nextReviewAt);
    return Number.isFinite(nextReviewTime) && nextReviewTime <= nowTime;
  });
}

export function getRevisionPlans(): RevisionPlan[] {
  try {
    const raw = localStorage.getItem(storageKey(PLANS_KEY));
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to read revision plans from localStorage', error);
  }

  saveRevisionPlans([]);
  return [];
}

export function saveRevisionPlans(plans: RevisionPlan[]) {
  try {
    localStorage.setItem(storageKey(PLANS_KEY), JSON.stringify(plans));
  } catch (error) {
    console.warn('Unable to save revision plans to localStorage', error);
  }
}

export function resetRevisionData(): void {
  saveRevisionPlans([]);
  saveVerseMasteryMap({});
}

export function getFriends(): FriendUser[] {
  try {
    const raw = localStorage.getItem(storageKey(FRIENDS_KEY));
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to read friends from localStorage', error);
  }

  saveFriends([]);
  return [];
}

export function saveFriends(friends: FriendUser[]) {
  try {
    localStorage.setItem(storageKey(FRIENDS_KEY), JSON.stringify(friends));
  } catch (error) {
    console.warn('Unable to save friends to localStorage', error);
  }
}

export function getChallenges(): QuranChallenge[] {
  try {
    const raw = localStorage.getItem(storageKey(CHALLENGES_KEY));
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to read challenges from localStorage', error);
  }

  saveChallenges([]);
  return [];
}

export function saveChallenges(challenges: QuranChallenge[]) {
  try {
    localStorage.setItem(storageKey(CHALLENGES_KEY), JSON.stringify(challenges));
  } catch (error) {
    console.warn('Unable to save challenges to localStorage', error);
  }
}

export function resetCompetitionData(): void {
  saveFriends([]);
  saveChallenges([]);
}
