import {
  UserStats,
  VerseMastery,
  RevisionPlan,
  Badge,
  FriendUser,
  QuranChallenge,
  MasteryLevel,
  RiwayahKey,
} from '../types/quran';
import { MemorizationStatus } from '../types/database';
import {
  getLocalUserId,
  memorizationProgressRepo,
  profileRepo,
  recitationErrorRepo,
  reviewScheduleRepo,
} from './databaseService';

const STATS_KEY = 'murattil_user_stats';
// مفتاح النسخة القديمة (ما قبل قاعدة البيانات) — يُقرأ مرة واحدة عند الترحيل.
const LEGACY_MASTERY_KEY = 'murattil_verse_mastery';
const LEGACY_MIGRATION_FLAG = 'murattil_verse_mastery_migrated';
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

// -----------------------------------------------------------------------------
// نظام التكرار المتباعد — مُخزَّن في جدولي memorization_progress و review_schedule
// -----------------------------------------------------------------------------

/** فترات المراجعة بالأيام: 1 → 3 → 7 → 14 → 30. */
const SPACED_INTERVALS = [1, 3, 7, 14, 30];

/** يحوّل مستوى المجال إلى حالة قاعدة البيانات (للترحيل من النسخة القديمة). */
function levelToStatus(level: MasteryLevel): MemorizationStatus {
  if (level === 'mastered') return 'memorized';
  if (level === 'review_needed') return 'needs_review';
  if (level === 'new') return 'not_started';
  return 'learning';
}

/** يحوّل حالة قاعدة البيانات إلى مستوى المجال الذي تستهلكه الواجهات. */
function statusToLevel(status: MemorizationStatus): MasteryLevel {
  if (status === 'memorized') return 'mastered';
  if (status === 'needs_review') return 'review_needed';
  if (status === 'not_started') return 'new';
  return 'good';
}

/**
 * ترحيل لمرة واحدة من الخريطة القديمة (murattil_verse_mastery) إلى الجدولين
 * الجديدين. البيانات القديمة لا تحمل رواية، فتُنسب إلى الرواية المفضّلة في الملف
 * الشخصي (الافتراضي: حفص).
 */
export function migrateLegacyVerseMasteryIfNeeded(): void {
  try {
    if (localStorage.getItem(LEGACY_MIGRATION_FLAG)) return;

    const raw = localStorage.getItem(LEGACY_MASTERY_KEY);
    const userId = getLocalUserId();

    if (raw) {
      const legacy = JSON.parse(raw) as Record<string, VerseMastery>;
      const riwayah = profileRepo.get(userId)?.preferred_riwayah ?? 'hafs';
      const alreadyTracked = memorizationProgressRepo
        .listForUser(userId)
        .some((row) => row.riwayah === riwayah);

      if (!alreadyTracked) {
        for (const item of Object.values(legacy)) {
          const status = levelToStatus(item.level);
          memorizationProgressRepo.upsertByAyah(userId, riwayah, item.surahNumber, item.ayahNumber, {
            status,
            mastery_level: Math.min(5, item.consecutiveSuccessCount),
            consecutive_success_count: item.consecutiveSuccessCount,
            mistake_count: item.mistakeCount,
            last_reviewed_at: item.lastReviewedAt,
            next_review_at: item.nextReviewAt,
          });
          reviewScheduleRepo.upsertByAyah(userId, riwayah, item.surahNumber, item.ayahNumber, {
            due_at: item.nextReviewAt,
            interval_days: 1,
            repetitions: item.consecutiveSuccessCount,
            last_result: status === 'needs_review' ? 'errors' : 'flawless',
            last_reviewed_at: item.lastReviewedAt,
          });
        }
      }
    }

    localStorage.setItem(LEGACY_MIGRATION_FLAG, new Date().toISOString());
  } catch (error) {
    console.warn('تعذّر ترحيل بيانات الحفظ القديمة', error);
  }
}

/** خريطة إتقان الآيات للرواية المطلوبة، بمفاتيح '<سورة>_<آية>'. */
export function getVerseMasteryMap(riwayah: RiwayahKey): Record<string, VerseMastery> {
  migrateLegacyVerseMasteryIfNeeded();

  const userId = getLocalUserId();
  const map: Record<string, VerseMastery> = {};

  for (const row of memorizationProgressRepo.listForUser(userId)) {
    // الآيات التي لم تُسمَّع بعد لا تظهر في الخريطة.
    if (row.riwayah !== riwayah || !row.last_reviewed_at) continue;

    map[`${row.surah_number}_${row.ayah_number}`] = {
      surahNumber: row.surah_number,
      ayahNumber: row.ayah_number,
      level: statusToLevel(row.status),
      consecutiveSuccessCount: row.consecutive_success_count,
      mistakeCount: row.mistake_count,
      lastReviewedAt: row.last_reviewed_at,
      nextReviewAt: row.next_review_at ?? row.last_reviewed_at,
      recentMistakes: recitationErrorRepo.latestMistakes(
        userId,
        riwayah,
        row.surah_number,
        row.ayah_number,
      ),
    };
  }

  return map;
}

/**
 * تسجيل نتيجة تسميع آية في نظام التكرار المتباعد.
 * يكتب في memorization_progress و review_schedule وأخطاء الآية في recitation_errors.
 */
export function recordVerseResult(
  surahNumber: number,
  ayahNumber: number,
  isFlawless: boolean,
  mistakes: { expectedWord: string; recitedWord: string; wordIndex?: number }[] = [],
  riwayah: RiwayahKey = 'hafs',
): VerseMastery {
  migrateLegacyVerseMasteryIfNeeded();

  const userId = getLocalUserId();
  const now = new Date();
  const reviewedAt = now.toISOString();
  const previous = memorizationProgressRepo.find(userId, riwayah, surahNumber, ayahNumber);

  let consecutiveSuccessCount = previous?.consecutive_success_count ?? 0;
  let mistakeCount = previous?.mistake_count ?? 0;
  let masteryLevel = previous?.mastery_level ?? 0;
  let status: MemorizationStatus;
  let nextReviewAt: string;
  let intervalDays: number;

  if (isFlawless) {
    consecutiveSuccessCount += 1;
    masteryLevel = Math.min(5, consecutiveSuccessCount);
    status = consecutiveSuccessCount >= 3 ? 'memorized' : 'learning';
    // فترات متباعدة: 1 → 3 → 7 → 14 → 30 يومًا حسب طول السلسلة الناجحة.
    intervalDays = SPACED_INTERVALS[Math.min(consecutiveSuccessCount - 1, SPACED_INTERVALS.length - 1)];
    nextReviewAt = new Date(now.getTime() + intervalDays * 86400000).toISOString();
  } else {
    consecutiveSuccessCount = 0;
    mistakeCount += 1;
    masteryLevel = Math.max(0, masteryLevel - 1);
    status = 'needs_review';
    intervalDays = 1;
    nextReviewAt = new Date(now.getTime() + intervalDays * 86400000).toISOString();
  }

  memorizationProgressRepo.upsertByAyah(userId, riwayah, surahNumber, ayahNumber, {
    is_target: true,
    status,
    mastery_level: masteryLevel,
    consecutive_success_count: consecutiveSuccessCount,
    mistake_count: mistakeCount,
    last_reviewed_at: reviewedAt,
    next_review_at: nextReviewAt,
  });

  reviewScheduleRepo.upsertByAyah(userId, riwayah, surahNumber, ayahNumber, {
    due_at: nextReviewAt,
    interval_days: intervalDays,
    repetitions: consecutiveSuccessCount,
    last_result: isFlawless ? 'flawless' : 'errors',
    last_reviewed_at: reviewedAt,
  });

  // سجل الأخطاء: تُضاف الحالات الجديدة وتُقرأ أحدث خمس حالات للعرض.
  const previousMistakes = recitationErrorRepo.latestMistakes(
    userId,
    riwayah,
    surahNumber,
    ayahNumber,
  );
  let recentMistakes = previousMistakes;
  if (!isFlawless && mistakes.length > 0) {
    recitationErrorRepo.addForAyah(userId, riwayah, surahNumber, ayahNumber, mistakes);
    recentMistakes = [
      ...mistakes.map((mistake) => ({ ...mistake, timestamp: reviewedAt })),
      ...previousMistakes,
    ].slice(0, 5);
  }

  return {
    surahNumber,
    ayahNumber,
    level: statusToLevel(status),
    consecutiveSuccessCount,
    mistakeCount,
    lastReviewedAt: reviewedAt,
    nextReviewAt,
    recentMistakes,
  };
}

/**
 * الآيات التي تحتاج مراجعة أو تثبيتًا بسبب أخطاء سابقة أو حلول موعد مراجعتها.
 */
export function getVersesNeedingReinforcement(riwayah: RiwayahKey): VerseMastery[] {
  const map = getVerseMasteryMap(riwayah);
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
