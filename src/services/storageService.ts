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

const DEFAULT_PLANS: RevisionPlan[] = [
  {
    id: 'juz_30_srs',
    title: 'تثبيت جزء عمّ بالتكرار المتباعد',
    description: 'مراجعة دورية ذكية للسور القصيرة لضمان عدم النسيان',
    category: 'spaced_repetition',
    targetSurahs: [114, 113, 112, 110, 108, 103, 109, 97, 94, 93, 87],
    dailyTargetAyahs: 15,
    durationDays: 14,
    currentDay: 3,
    isCompleted: false,
    startDate: new Date().toISOString(),
  },
  {
    id: 'surah_mulk_fix',
    title: 'تثبيت سورة الملك المنجية',
    description: 'حفظ ومراجعة 3 آيات يومياً مع التفسير الميسر',
    category: 'surah_fix',
    targetSurahs: [67],
    dailyTargetAyahs: 3,
    durationDays: 10,
    currentDay: 2,
    isCompleted: false,
    startDate: new Date().toISOString(),
  },
  {
    id: 'daily_wird_basic',
    title: 'الورد اليومي لتثبيت المحفوظ',
    description: 'مراجعة ربع حزب يومياً مع الفحص الصوتي للأخطاء',
    category: 'daily_wird',
    targetSurahs: [1, 87, 93, 94, 97, 103, 108, 112, 113, 114],
    dailyTargetAyahs: 25,
    durationDays: 30,
    currentDay: 5,
    isCompleted: false,
    startDate: new Date().toISOString(),
  },
];

export const INITIAL_FRIENDS: FriendUser[] = [
  {
    id: 'f1',
    name: 'أحمد بن علي الكندري',
    avatar: '👨‍💼',
    points: 3420,
    versesToday: 35,
    streakDays: 12,
    accuracy: 98,
    rank: 1,
    badge: 'فارس الحفاظ',
    lastActive: 'منذ 10 دقائق',
  },
  {
    id: 'f_me',
    name: 'أنت (حسابي)',
    avatar: '🌱',
    points: 1850,
    versesToday: 18,
    streakDays: 5,
    accuracy: 96,
    rank: 2,
    badge: 'طالب إتقان',
    lastActive: 'الآن',
  },
  {
    id: 'f2',
    name: 'عائشة المحمود',
    avatar: '🧕',
    points: 1640,
    versesToday: 20,
    streakDays: 7,
    accuracy: 95,
    rank: 3,
    badge: 'شعلة الاستمرار',
    lastActive: 'منذ ساعة',
  },
  {
    id: 'f3',
    name: 'عمر الفاروق الدوسري',
    avatar: '🧔',
    points: 1320,
    versesToday: 12,
    streakDays: 4,
    accuracy: 94,
    rank: 4,
    badge: 'مكافح النسيان',
    lastActive: 'منذ 3 ساعات',
  },
  {
    id: 'f4',
    name: 'فاطمة الزهراء',
    avatar: '🌸',
    points: 980,
    versesToday: 8,
    streakDays: 3,
    accuracy: 92,
    rank: 5,
    badge: 'بداية النور',
    lastActive: 'أمس',
  },
];

export const DAILY_CHALLENGES: QuranChallenge[] = [
  {
    id: 'c1',
    title: 'تحدي سورة الفاتحة والإخلاص بإتقان تام',
    surahNumber: 1,
    ayahStart: 1,
    ayahEnd: 7,
    rewardPoints: 200,
    difficulty: 'سهل',
    expiresInHours: 14,
    completed: false,
  },
  {
    id: 'c2',
    title: 'تسميع سورة الأعلى دون أي توقف أو خطأ',
    surahNumber: 87,
    ayahStart: 1,
    ayahEnd: 9,
    rewardPoints: 350,
    difficulty: 'متوسط',
    expiresInHours: 18,
    completed: false,
  },
  {
    id: 'c3',
    title: 'مراجعة آيات سورة الملك الأولى (تثبيت الحفظ)',
    surahNumber: 67,
    ayahStart: 1,
    ayahEnd: 5,
    rewardPoints: 300,
    difficulty: 'متوسط',
    expiresInHours: 24,
    completed: false,
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
  accuracy: number,
) {
  const stats = getUserStats();
  stats.points += addedPoints;
  stats.totalVersesRecited += versesCount;
  stats.totalRecitedSeconds += seconds;

  // Calculate running weighted accuracy
  stats.accuracyRate = Math.round(((stats.accuracyRate * 4 + accuracy) / 5) * 10) / 10;

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

  saveRevisionPlans(DEFAULT_PLANS);
  return DEFAULT_PLANS;
}

export function saveRevisionPlans(plans: RevisionPlan[]) {
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  } catch (error) {
    console.warn('Unable to save revision plans to localStorage', error);
  }
}

export function getFriends(): FriendUser[] {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to read friends from localStorage', error);
  }

  saveFriends(INITIAL_FRIENDS);
  return INITIAL_FRIENDS;
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

  saveChallenges(DAILY_CHALLENGES);
  return DAILY_CHALLENGES;
}

export function saveChallenges(challenges: QuranChallenge[]) {
  try {
    localStorage.setItem(CHALLENGES_KEY, JSON.stringify(challenges));
  } catch (error) {
    console.warn('Unable to save challenges to localStorage', error);
  }
}
