import {
  UserStats,
  VerseMastery,
  RevisionPlan,
  Badge,
  FriendUser,
  QuranChallenge,
} from '../types/quran';

const STATS_KEY = 'murattil_user_stats';
const MASTERY_KEY = 'murattil_verse_mastery';
const PLANS_KEY = 'murattil_revision_plans';
const FRIENDS_KEY = 'murattil_friends';
const CHALLENGES_KEY = 'murattil_challenges';
const DAILY_ACTIVITY_KEY = 'murattil_daily_activity';
const DAILY_GOAL_KEY = 'murattil_daily_verse_goal';

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
    const raw = localStorage.getItem(DAILY_ACTIVITY_KEY);
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
    const raw = localStorage.getItem(DAILY_GOAL_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 100) return parsed;
  } catch (error) {
    console.warn('Unable to read daily verse goal from localStorage', error);
  }
  return 10;
}

export function saveDailyVerseGoal(goal: number): void {
  const validGoal = Math.max(1, Math.min(100, Math.round(goal)));
  try {
    localStorage.setItem(DAILY_GOAL_KEY, String(validGoal));
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
    localStorage.setItem(DAILY_ACTIVITY_KEY, JSON.stringify(activity.slice(-30)));
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
    localStorage.setItem(DAILY_ACTIVITY_KEY, JSON.stringify(activity.slice(-30)));
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
    const raw = localStorage.getItem(STATS_KEY);
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
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
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
    const raw = localStorage.getItem(MASTERY_KEY);
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
    localStorage.setItem(MASTERY_KEY, JSON.stringify(map));
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

  current.lastReviewedAt = now.toISOString();

  if (isFlawless) {
    current.consecutiveSuccessCount += 1;
    // Spaced repetition intervals: 1 day -> 3 days -> 7 days -> 14 days -> 30 days
    const intervals = [1, 3, 7, 14, 30];
    const offsetIndex = Math.max(0, current.consecutiveSuccessCount - 1);
    const daysToAdd = intervals[Math.min(offsetIndex, intervals.length - 1)];
    const nextDate = new Date(now.getTime() + daysToAdd * 86400000);
    current.nextReviewAt = nextDate.toISOString();

    if (current.consecutiveSuccessCount >= 3) {
      current.level = 'mastered';
    } else {
      current.level = 'good';
    }
  } else {
    current.mistakeCount += 1;
    current.consecutiveSuccessCount = 0;
    current.level = 'review_needed';
    // Review again tomorrow or immediately
    current.nextReviewAt = new Date(now.getTime() + 86400000).toISOString();

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

export function getRevisionPlans(): RevisionPlan[] {
  try {
    const raw = localStorage.getItem(PLANS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to read revision plans from localStorage', error);
  }

  saveRevisionPlans([]);
  return [];
}

export function saveRevisionPlans(plans: RevisionPlan[]) {
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
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
    const raw = localStorage.getItem(FRIENDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to read friends from localStorage', error);
  }

  saveFriends([]);
  return [];
}

export function saveFriends(friends: FriendUser[]) {
  try {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
  } catch (error) {
    console.warn('Unable to save friends to localStorage', error);
  }
}

export function getChallenges(): QuranChallenge[] {
  try {
    const raw = localStorage.getItem(CHALLENGES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to read challenges from localStorage', error);
  }

  saveChallenges([]);
  return [];
}

export function saveChallenges(challenges: QuranChallenge[]) {
  try {
    localStorage.setItem(CHALLENGES_KEY, JSON.stringify(challenges));
  } catch (error) {
    console.warn('Unable to save challenges to localStorage', error);
  }
}

export function resetCompetitionData(): void {
  saveFriends([]);
  saveChallenges([]);
}
