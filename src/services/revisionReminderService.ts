import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  getRevisionReminderSettings,
  getVerseMasteryMap,
  getVersesDueForReview,
} from './storageService';

const REVISION_REMINDER_ID = 230415;

export type RevisionReminderScheduleResult =
  | 'scheduled'
  | 'disabled'
  | 'unsupported'
  | 'permission-denied'
  | 'no-upcoming-reviews';

function getNextReminderTime(dueAt: Date, hour: number, minute: number): Date {
  const scheduledAt = new Date(dueAt);
  scheduledAt.setHours(hour, minute, 0, 0);
  if (scheduledAt.getTime() < dueAt.getTime()) {
    scheduledAt.setDate(scheduledAt.getDate() + 1);
  }
  return scheduledAt;
}

export async function scheduleDueReviewReminder(
  requestPermission = false,
  now = new Date(),
): Promise<RevisionReminderScheduleResult> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';

  const settings = getRevisionReminderSettings();
  await LocalNotifications.cancel({ notifications: [{ id: REVISION_REMINDER_ID }] });
  if (!settings.enabled) return 'disabled';

  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted' && requestPermission) {
    permission = await LocalNotifications.requestPermissions();
  }
  if (permission.display !== 'granted') return 'permission-denied';

  const [hour, minute] = settings.time.split(':').map(Number);
  const dueVerses = getVersesDueForReview(now);
  let schedule: { at?: Date; on?: { hour: number; minute: number }; every?: 'day' };
  if (dueVerses.length > 0) {
    schedule = { on: { hour, minute }, every: 'day' };
  } else {
    const nextReviewTime = Object.values(getVerseMasteryMap())
      .map((mastery) => Date.parse(mastery.nextReviewAt))
      .filter((time) => Number.isFinite(time) && time > now.getTime())
      .sort((a, b) => a - b)[0];
    if (nextReviewTime === undefined) return 'no-upcoming-reviews';
    schedule = {
      at: getNextReminderTime(new Date(nextReviewTime), hour, minute),
    };
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: REVISION_REMINDER_ID,
        title: 'موعد مراجعة القرآن',
        body:
          dueVerses.length > 0
            ? `لديك ${dueVerses.length} آية مستحقة للمراجعة.`
            : 'حان موعد مراجعة آياتك المحفوظة.',
        schedule: { ...schedule, allowWhileIdle: true },
        isExactNotification: false,
        extra: { tab: 'revision' },
      },
    ],
  });
  return 'scheduled';
}
