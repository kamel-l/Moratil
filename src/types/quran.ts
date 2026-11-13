export type Riwaya = 'hafs' | 'warsh';

export interface Ayah {
  numberInSurah: number;
  text: string; // Full Uthmani / Tashkeel text
  simpleText?: string; // Normalized text without diacritics
  juz: number;
  page?: number;
  tafsir?: string; // التفسير الميسر
  words?: string[]; // Array of words for word-by-word tracking
  audioUrl?: string; // Optional direct audio
  /**
   * Verse number to use for the audio collection. Warsh verses are played with
   * the Hafs recording that covers them, because the published Warsh folders
   * (everyayah.com) are numbered with the Hafs 6,236 identity.
   */
  audioAyahNumber?: number;
  keyWordsMeaning?: { word: string; meaning: string }[];
}

export interface Surah {
  number: number;
  name: string; // e.g. "الفاتحة"
  englishName: string; // e.g. "Al-Faatiha"
  revelationType: 'مكية' | 'مدنية';
  numberOfAyahs: number;
  juzStart: number;
  pageStart: number;
  /** Standalone basmalah printed above the ayahs (Warsh); absent for Hafs. */
  basmalah?: string;
  ayahs: Ayah[];
}

export interface Reciter {
  id: string;
  name: string;
  description: string;
  folder: string; // EveryAyah folder identifier
  bitrate: string;
  avatarUrl?: string;
  hasTeacherStyle?: boolean;
  riwaya?: Riwaya; // ✅ جديد — الافتراضي حفص
}

export type MasteryLevel = 'new' | 'learning' | 'review_needed' | 'good' | 'mastered';

export interface VerseMastery {
  surahNumber: number;
  ayahNumber: number;
  /** Riwayah whose numbering this verse belongs to. Missing means Hafs. */
  riwaya?: Riwaya;
  level: MasteryLevel;
  consecutiveSuccessCount: number;
  mistakeCount: number;
  repetitionCount?: number;
  easeFactor?: number;
  intervalDays?: number;
  lastReviewedAt: string; // ISO date
  nextReviewAt: string; // ISO date for spaced repetition
  recentMistakes: {
    expectedWord: string;
    recitedWord: string;
    timestamp: string;
  }[];
}

export interface RevisionPlan {
  id: string;
  title: string;
  description: string;
  category: 'daily_wird' | 'spaced_repetition' | 'juz_amma' | 'surah_fix' | 'custom';
  targetSurahs: number[]; // Surah numbers included
  dailyTargetAyahs: number;
  durationDays: number;
  currentDay: number;
  isCompleted: boolean;
  startDate: string;
}

export interface UserStats {
  points: number; // XP / Hasanat
  level: string; // e.g., "حافظ مبتدئ", "مجاز متقن"
  streakDays: number;
  lastActiveDate: string;
  totalVersesRecited: number;
  totalRecitedSeconds: number;
  accuracyRate: number; // e.g. 96.5%
  mistakesFixedCount: number;
  completedSurahs: number[];
  unlockedBadgeIds: string[];
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  pointsReward: number;
  conditionDescription: string;
  unlockedAt?: string;
}

export interface FriendUser {
  id: string;
  name: string;
  avatar: string;
  points: number;
  versesToday: number;
  streakDays: number;
  accuracy: number;
  rank: number;
  badge: string;
  lastActive: string;
}

export interface QuranChallenge {
  id: string;
  title: string;
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  /** Riwayah whose numbering the verse range uses. Missing means Hafs. */
  riwaya?: Riwaya;
  rewardPoints: number;
  difficulty: 'سهل' | 'متوسط' | 'تحدي قوي';
  expiresInHours: number;
  completed: boolean;

  // ── حقول النتيجة ──
  createdAt?: number;           // Date.now() عند الإنشاء
  completedAt?: number | null;  // عند أول نجاح ≥ 60%
  bestScore?: number | null;    // 0..100 — أفضل نسبة دقة
  bestAyahsPerfect?: number;    // أفضل عدد آيات كاملة
  attempts?: number;            // عدد المحاولات
}

export interface WordMatchStatus {
  word: string;
  cleanWord: string;
  status: 'correct' | 'wrong' | 'current' | 'pending';
  heardWord?: string;
}

export type AppTab =
  | 'home'
  | 'memorize'
  | 'recite'
  | 'revision'
  | 'explorer'
  | 'competition'
  | 'stats';