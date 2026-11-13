import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addPointsAndVerses,
  getDailyRecitationActivity,
  getDailyVerseGoal,
  getRevisionReminderSettings,
  getChallenges,
  getFriends,
  getRevisionPlans,
  getUserStats,
  getVerseMasteryMap,
  getVersesDueForReview,
  recordRecitationSession,
  recordVerseResult,
  resetCompetitionData,
  resetRevisionData,
  saveChallenges,
  saveDailyVerseGoal,
  saveRevisionReminderSettings,
  saveFriends,
  saveRevisionPlans,
  saveUserStats,
  saveVerseMasteryMap,
  setStorageUserId,
} from './storageService';
import { FriendUser, QuranChallenge, RevisionPlan, VerseMastery } from '../types/quran';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  setStorageUserId(null);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('account-scoped local progress', () => {
  it('keeps progress separate when switching authenticated accounts', () => {
    setStorageUserId('user-one');
    const firstAccountStats = getUserStats();
    firstAccountStats.points = 125;
    saveUserStats(firstAccountStats);

    setStorageUserId('user-two');
    expect(getUserStats().points).toBe(0);

    const secondAccountStats = getUserStats();
    secondAccountStats.points = 20;
    saveUserStats(secondAccountStats);

    setStorageUserId('user-one');
    expect(getUserStats().points).toBe(125);
  });

  it('adopts existing local progress only for the first signed-in account', () => {
    const legacyStats = { ...getUserStats(), points: 77 };
    saveUserStats(legacyStats);

    setStorageUserId('first-account');
    expect(getUserStats().points).toBe(77);

    setStorageUserId('another-account');
    expect(getUserStats().points).toBe(0);
  });
});

describe('daily recitation activity', () => {
  it('tracks completed verses and started sessions separately', () => {
    recordRecitationSession();
    addPointsAndVerses(50, 15, 600);

    const today = getDailyRecitationActivity(1)[0];
    expect(today.verses).toBe(15);
    expect(today.sessions).toBe(1);
  });

  it('does not treat an unverified review-plan completion as a text match', () => {
    addPointsAndVerses(50, 15, 600);

    const stats = JSON.parse(storage.get('murattil_user_stats') || '{}');
    expect(stats.accuracyRate).toBe(0);
  });

  it('persists a bounded daily verse goal', () => {
    expect(getDailyVerseGoal()).toBe(10);

    saveDailyVerseGoal(25);
    expect(getDailyVerseGoal()).toBe(25);

    saveDailyVerseGoal(1000);
    expect(getDailyVerseGoal()).toBe(100);
  });
});

describe('SM-2 spaced repetition', () => {
  it('uses 1-day, 6-day, then ease-adjusted intervals for successful reviews', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const first = recordVerseResult(1, 3, true);
    const second = recordVerseResult(1, 3, true);
    const third = recordVerseResult(1, 3, true);

    expect(first).toMatchObject({ repetitionCount: 1, intervalDays: 1, easeFactor: 2.6 });
    expect(second).toMatchObject({ repetitionCount: 2, intervalDays: 6, easeFactor: 2.7 });
    expect(third).toMatchObject({ repetitionCount: 3, intervalDays: 16 });
    expect(third.easeFactor).toBeCloseTo(2.8);

    vi.useRealTimers();
  });

  it('resets successful repetitions after a failed review and identifies due verses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    recordVerseResult(1, 4, true);
    const failed = recordVerseResult(1, 4, false);

    expect(failed).toMatchObject({ repetitionCount: 0, intervalDays: 1, level: 'review_needed' });
    expect(getVersesDueForReview(new Date('2026-01-03T00:00:00Z'))).toHaveLength(1);

    vi.useRealTimers();
  });

  it('caps the ease factor and the interval so a verse is reviewed at least yearly', () => {
    vi.useFakeTimers();
    const reviewDate = new Date('2026-01-01T00:00:00Z');
    vi.setSystemTime(reviewDate);

    let verse = recordVerseResult(2, 255, true);
    for (let review = 0; review < 40; review += 1) {
      vi.setSystemTime(new Date(reviewDate.getTime() + (review + 1) * 86_400_000));
      verse = recordVerseResult(2, 255, true);
    }

    expect(verse.easeFactor).toBe(3);
    expect(verse.intervalDays).toBe(365);
    const daysUntilReview = (Date.parse(verse.nextReviewAt) - Date.now()) / 86_400_000;
    expect(daysUntilReview).toBeCloseTo(365);

    vi.useRealTimers();
  });

  it('repairs an interval that predates the cap', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveVerseMasteryMap({
      '2_255': {
        surahNumber: 2,
        ayahNumber: 255,
        level: 'mastered',
        consecutiveSuccessCount: 12,
        mistakeCount: 0,
        repetitionCount: 12,
        easeFactor: 5.16,
        intervalDays: 73183,
        lastReviewedAt: '2025-06-01T00:00:00.000Z',
        nextReviewAt: new Date(
          Date.parse('2025-06-01T00:00:00.000Z') + 73183 * 86_400_000,
        ).toISOString(),
        recentMistakes: [],
      },
    });

    const repaired = recordVerseResult(2, 255, true);

    expect(repaired.easeFactor).toBe(3);
    expect(repaired.intervalDays).toBe(365);
    expect((Date.parse(repaired.nextReviewAt) - Date.now()) / 86_400_000).toBeCloseTo(365);

    vi.useRealTimers();
  });
});

describe('revision reminder preferences', () => {
  it('defaults to disabled and stores a validated local reminder time', () => {
    expect(getRevisionReminderSettings()).toEqual({ enabled: false, time: '09:00' });

    saveRevisionReminderSettings({ enabled: true, time: '18:45' });
    expect(getRevisionReminderSettings()).toEqual({ enabled: true, time: '18:45' });
    expect(() => saveRevisionReminderSettings({ enabled: true, time: '25:90' })).toThrow();
  });
});

describe('resetting competition and revision data', () => {
  it('starts with no default friends, challenges, or revision plans', () => {
    expect(getFriends()).toEqual([]);
    expect(getChallenges()).toEqual([]);
    expect(getRevisionPlans()).toEqual([]);
  });

  it('clears friends and challenges instead of restoring defaults', () => {
    const friend: FriendUser = {
      id: 'friend_test',
      name: 'صديق',
      avatar: '🌟',
      points: 0,
      versesToday: 0,
      streakDays: 0,
      accuracy: 0,
      rank: 1,
      badge: '',
      lastActive: '',
    };
    const challenge: QuranChallenge = {
      id: 'challenge_test',
      title: 'تحدٍّ',
      surahNumber: 1,
      ayahStart: 1,
      ayahEnd: 1,
      rewardPoints: 0,
      difficulty: 'سهل',
      expiresInHours: 1,
      completed: false,
    };
    saveFriends([friend]);
    saveChallenges([challenge]);

    resetCompetitionData();

    expect(getFriends()).toEqual([]);
    expect(getChallenges()).toEqual([]);
  });

  it('clears all plans and verse mastery', () => {
    const plan: RevisionPlan = {
      id: 'plan_test',
      title: 'خطة اختبار',
      description: '',
      category: 'custom',
      targetSurahs: [],
      dailyTargetAyahs: 1,
      durationDays: 1,
      currentDay: 1,
      isCompleted: false,
      startDate: new Date().toISOString(),
    };
    saveRevisionPlans([plan]);
    const mastery: VerseMastery = {
      surahNumber: 1,
      ayahNumber: 1,
      level: 'learning',
      consecutiveSuccessCount: 1,
      mistakeCount: 0,
      lastReviewedAt: new Date().toISOString(),
      nextReviewAt: new Date().toISOString(),
      recentMistakes: [],
    };
    saveVerseMasteryMap({ '1_1': mastery });

    resetRevisionData();

    expect(getRevisionPlans()).toEqual([]);
    expect(getVerseMasteryMap()).toEqual({});
  });
});
