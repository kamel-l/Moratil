import { beforeEach, describe, expect, it } from 'vitest';
import {
  addPointsAndVerses,
  getDailyRecitationActivity,
  getDailyVerseGoal,
  recordRecitationSession,
  saveDailyVerseGoal,
} from './storageService';

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
