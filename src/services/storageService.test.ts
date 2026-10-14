import { beforeEach, describe, expect, it } from 'vitest';
import {
  addPointsAndVerses,
  getDailyRecitationActivity,
  getDailyVerseGoal,
  getChallenges,
  getFriends,
  getRevisionPlans,
  getVerseMasteryMap,
  recordRecitationSession,
  resetCompetitionData,
  resetRevisionData,
  saveChallenges,
  saveDailyVerseGoal,
  saveFriends,
  saveRevisionPlans,
  saveVerseMasteryMap,
} from './storageService';
import { FriendUser, QuranChallenge, RevisionPlan, VerseMastery } from '../types/quran';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
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
