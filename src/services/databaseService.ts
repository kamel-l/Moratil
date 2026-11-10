/**
 * خدمة قاعدة البيانات المحلية (Local-first).
 *
 * تُخزَّن كل «جدول» كسجل JSON مستقل في localStorage، بنفس أسماء الجداول وأعمدتها
 * في supabase/migrations، بحيث يمكن لاحقًا استبدال هذه الطبقة بمزوّد سحابي
 * (Supabase) دون تغيير الواجهات التي تستهلك الدوال المُصدَّرة هنا.
 *
 * ملاحظات تصميمية:
 *  - كل صف يحمل id (uuid يُولَّد على العميل) + created_at + updated_at + deleted_at.
 *  - الحذف ناعم دائمًا (softDelete) حتى تُلتقط عمليات الحذف عند المزامنة.
 *  - كل كتابة تُوسم _sync.state = 'pending' ليأخذها محرّك المزامنة لاحقًا.
 *  - لا يُخزَّن نص القرآن هنا؛ الجدولان surahs/ayahs مرجعيان في الحزم المحلية.
 */

import { DatabaseRowMap, NewRow, RowPatch, StoredRow, SyncStamp, SyncableTable } from '../types/database';
import { VerseMastery } from '../types/quran';

/** سجل خطأ واحد بصيغة العرض (مطابق لعنصر recentMistakes في VerseMastery). */
export type MistakeRecord = VerseMastery['recentMistakes'][number];

const KEY_PREFIX = 'murattil.db.';
const USER_ID_KEY = `${KEY_PREFIX}user_id`;

/** الجداول التي يملكها المستخدم (القابلة للمزامنة). */
export const SYNCABLE_TABLES: SyncableTable[] = [
  'profiles',
  'memorization_progress',
  'recitation_sessions',
  'recitation_errors',
  'review_schedule',
];

// -----------------------------------------------------------------------------
// أدوات مساعدة
// -----------------------------------------------------------------------------

/** مُعرّف فريد — crypto.randomUUID مع بديل احتياطي للبيئات القديمة. */
export function uuid(): string {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** مُعرّف المستخدم المحلي (يُولَّد عند أول استخدام، ويُستبدل بـ auth.uid عند المزامنة). */
export function getLocalUserId(): string {
  try {
    const existing = localStorage.getItem(USER_ID_KEY);
    if (existing) return existing;
    const created = uuid();
    localStorage.setItem(USER_ID_KEY, created);
    return created;
  } catch {
    return uuid();
  }
}

export function setLocalUserId(userId: string): void {
  try {
    localStorage.setItem(USER_ID_KEY, userId);
  } catch (error) {
    console.warn('تعذّر حفظ مُعرّف المستخدم', error);
  }
}

/**
 * يعيد نسب البيانات المحلية من مُعرّف محلي قديم إلى مُعرّف مستخدم مصادَق (auth.uid)
 * عند أول تسجيل دخول، ويوسم الصفوف المتأثرة بالانتظار لتُرفع في أول مزامنة.
 * (الملف الشخصي يُعاد مفتاحه لأن معرّفه هو نفسه معرّف المستخدم.)
 */
export function claimLocalData(fromUserId: string, toUserId: string): number {
  if (!fromUserId || fromUserId === toUserId) return 0;

  const pending: SyncStamp = { state: 'pending', lastSyncedAt: null };
  let claimed = 0;

  for (const table of SYNCABLE_TABLES) {
    const rows = readTable(table) as unknown as (Record<string, unknown> & { id: string })[];
    let touched = false;

    const next = rows.map((row) => {
      const isOwner = table === 'profiles' ? row.id === fromUserId : row.user_id === fromUserId;
      if (!isOwner) return row;
      touched = true;
      claimed += 1;
      return table === 'profiles'
        ? { ...row, id: toUserId, _sync: pending }
        : { ...row, user_id: toUserId, _sync: pending };
    });

    if (touched) writeTable(table, next as unknown as StoredRow<DatabaseRowMap[SyncableTable]>[]);
  }

  return claimed;
}

const tableKey = (table: SyncableTable) => `${KEY_PREFIX}${table}`;

function readTable<K extends SyncableTable>(table: K): StoredRow<DatabaseRowMap[K]>[] {
  try {
    const raw = localStorage.getItem(tableKey(table));
    if (raw) return JSON.parse(raw) as StoredRow<DatabaseRowMap[K]>[];
  } catch (error) {
    console.warn(`تعذّر قراءة الجدول ${table}`, error);
  }
  return [];
}

function writeTable<K extends SyncableTable>(table: K, rows: StoredRow<DatabaseRowMap[K]>[]): void {
  try {
    localStorage.setItem(tableKey(table), JSON.stringify(rows));
  } catch (error) {
    console.warn(`تعذّر كتابة الجدول ${table}`, error);
  }
}

// -----------------------------------------------------------------------------
// عمليات عامة على أي جدول
// -----------------------------------------------------------------------------

/** كل الصفوف غير المحذوفة في جدول. */
export function listRows<K extends SyncableTable>(table: K): StoredRow<DatabaseRowMap[K]>[] {
  return readTable(table).filter((row) => !row.deleted_at);
}

/** كل الصفوف بما فيها المحذوفة ناعمًا (تستخدمها المزامنة). */
export function listRowsWithDeleted<K extends SyncableTable>(
  table: K,
): StoredRow<DatabaseRowMap[K]>[] {
  return readTable(table);
}

export function getRow<K extends SyncableTable>(
  table: K,
  id: string,
): StoredRow<DatabaseRowMap[K]> | undefined {
  return readTable(table).find((row) => row.id === id);
}

/**
 * إدراج أو تحديث صف. إن لم يحمل الصف id يُولَّد له، ويُضبط created_at/updated_at.
 */
export function upsertRow<K extends SyncableTable>(
  table: K,
  row: NewRow<DatabaseRowMap[K]> & { id: string } & Partial<DatabaseRowMap[K]>,
): StoredRow<DatabaseRowMap[K]> {
  const rows = readTable(table);
  const index = rows.findIndex((item) => item.id === row.id);
  const timestamp = nowIso();

  if (index >= 0) {
    const updated = {
      ...rows[index],
      ...row,
      updated_at: timestamp,
      _sync: { state: 'pending' as const, lastSyncedAt: null },
    } as StoredRow<DatabaseRowMap[K]>;
    rows[index] = updated;
    writeTable(table, rows);
    return updated;
  }

  const created = {
    ...(row as DatabaseRowMap[K]),
    id: row.id,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: row.deleted_at ?? null,
    _sync: { state: 'pending' as const, lastSyncedAt: null },
  } as StoredRow<DatabaseRowMap[K]>;
  rows.push(created);
  writeTable(table, rows);
  return created;
}

/** تحديث جزئي بالمعرّف. يعيد الصف المحدَّث أو undefined إن لم يوجد. */
export function patchRow<K extends SyncableTable>(
  table: K,
  id: string,
  patch: RowPatch<DatabaseRowMap[K]>,
): StoredRow<DatabaseRowMap[K]> | undefined {
  const rows = readTable(table);
  const index = rows.findIndex((item) => item.id === id);
  if (index < 0) return undefined;

  const updated = {
    ...rows[index],
    ...patch,
    updated_at: nowIso(),
    _sync: { state: 'pending' as const, lastSyncedAt: null },
  } as StoredRow<DatabaseRowMap[K]>;
  rows[index] = updated;
  writeTable(table, rows);
  return updated;
}

/** حذف ناعم: يضبط deleted_at بدل إزالة الصف، ليبقى قابلًا للمزامنة. */
export function softDeleteRow<K extends SyncableTable>(table: K, id: string): void {
  patchRow(table, id, { deleted_at: nowIso() } as RowPatch<DatabaseRowMap[K]>);
}

// -----------------------------------------------------------------------------
// واجهات مُخصَّصة لكل جدول
// -----------------------------------------------------------------------------

export const profileRepo = {
  get(userId: string) {
    return getRow('profiles', userId);
  },

  /** ينشئ ملف المستخدم المحلي عند الحاجة، أو يحدّث الحقول المُمرَّرة. */
  upsert(userId: string, changes: Partial<Omit<DatabaseRowMap['profiles'], 'id'>> = {}) {
    const existing = getRow('profiles', userId);
    if (existing) return patchRow('profiles', userId, changes);

    return upsertRow('profiles', {
      id: userId,
      email: null,
      display_name: null,
      daily_goal_ayahs: 5,
      preferred_riwayah: 'hafs',
      settings: {},
      ...changes,
    });
  },
};

export const memorizationProgressRepo = {
  listForUser(userId: string) {
    return listRows('memorization_progress').filter((row) => row.user_id === userId);
  },

  listForSurah(userId: string, riwayah: string, surahNumber: number) {
    return listRows('memorization_progress').filter(
      (row) =>
        row.user_id === userId && row.riwayah === riwayah && row.surah_number === surahNumber,
    );
  },

  find(userId: string, riwayah: string, surahNumber: number, ayahNumber: number) {
    return listRows('memorization_progress').find(
      (row) =>
        row.user_id === userId &&
        row.riwayah === riwayah &&
        row.surah_number === surahNumber &&
        row.ayah_number === ayahNumber,
    );
  },

  /** إدراج/تحديث بحسب المفتاح المنطقي (user, riwayah, surah, ayah). */
  upsertByAyah(
    userId: string,
    riwayah: DatabaseRowMap['memorization_progress']['riwayah'],
    surahNumber: number,
    ayahNumber: number,
    changes: Partial<
      Omit<
        DatabaseRowMap['memorization_progress'],
        'id' | 'user_id' | 'riwayah' | 'surah_number' | 'ayah_number'
      >
    > = {},
  ) {
    const existing = this.find(userId, riwayah, surahNumber, ayahNumber);
    if (existing) return patchRow('memorization_progress', existing.id, changes);

    return upsertRow('memorization_progress', {
      id: uuid(),
      user_id: userId,
      riwayah,
      surah_number: surahNumber,
      ayah_number: ayahNumber,
      is_target: true,
      status: 'not_started',
      mastery_level: 0,
      consecutive_success_count: 0,
      mistake_count: 0,
      last_reviewed_at: null,
      next_review_at: null,
      ...changes,
    });
  },
};

export const recitationSessionRepo = {
  create(
    userId: string,
    input: Omit<
      NewRow<DatabaseRowMap['recitation_sessions']>,
      'user_id' | 'started_at' | 'ended_at' | 'duration_seconds' | 'processing_state'
    > &
      Partial<Pick<DatabaseRowMap['recitation_sessions'], 'started_at'>>,
  ) {
    return upsertRow('recitation_sessions', {
      id: uuid(),
      user_id: userId,
      started_at: nowIso(),
      ended_at: null,
      duration_seconds: 0,
      processing_state: 'pending',
      analysis: {},
      ...input,
    });
  },

  complete(
    sessionId: string,
    changes: Partial<
      Pick<
        DatabaseRowMap['recitation_sessions'],
        'ended_at' | 'duration_seconds' | 'accuracy_percent' | 'flawless_count' | 'error_count'
      >
    > = {},
  ) {
    return patchRow('recitation_sessions', sessionId, {
      ended_at: nowIso(),
      processing_state: 'processed',
      ...changes,
    });
  },

  listForUser(userId: string) {
    return listRows('recitation_sessions')
      .filter((row) => row.user_id === userId)
      .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  },
};

export const recitationErrorRepo = {
  addMany(
    userId: string,
    sessionId: string | null,
    errors: Omit<NewRow<DatabaseRowMap['recitation_errors']>, 'user_id' | 'session_id'>[],
  ) {
    return errors.map((error) =>
      upsertRow('recitation_errors', {
        id: uuid(),
        user_id: userId,
        session_id: sessionId,
        ...error,
      }),
    );
  },

  /**
   * تسجيل أخطاء آية مباشرةً (خارج سياق جلسة). يُستخدم عند ربط نتيجة تسميع
   * سريعة بنظام الحفظ دون فتح جلسة كاملة.
   */
  addForAyah(
    userId: string,
    riwayah: DatabaseRowMap['recitation_errors']['riwayah'],
    surahNumber: number,
    ayahNumber: number,
    mistakes: { expectedWord: string; recitedWord: string; wordIndex?: number }[],
    sessionId: string | null = null,
  ) {
    return mistakes.map((mistake) =>
      upsertRow('recitation_errors', {
        id: uuid(),
        user_id: userId,
        session_id: sessionId,
        riwayah,
        surah_number: surahNumber,
        ayah_number: ayahNumber,
        word_index: mistake.wordIndex ?? null,
        error_type: 'substitution',
        expected_word: mistake.expectedWord,
        recited_word: mistake.recitedWord,
        confidence: null,
        user_confirmed: null,
      }),
    );
  },

  /** أحدث الأخطاء المسجّلة على آية (لأحدث أولًا) — تُغذّي سجل الأخطاء في الواجهة. */
  latestMistakes(
    userId: string,
    riwayah: string,
    surahNumber: number,
    ayahNumber: number,
    limit = 5,
  ): MistakeRecord[] {
    return listRows('recitation_errors')
      .filter(
        (row) =>
          row.user_id === userId &&
          row.riwayah === riwayah &&
          row.surah_number === surahNumber &&
          row.ayah_number === ayahNumber,
      )
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, limit)
      .map((row) => ({
        expectedWord: row.expected_word ?? '',
        recitedWord: row.recited_word ?? '',
        timestamp: row.created_at,
      }));
  },

  listForSession(sessionId: string) {
    return listRows('recitation_errors').filter((row) => row.session_id === sessionId);
  },

  /** الآيات التي تراكمت عليها أخطاء، مرتبة تنازليًا بعدد الأخطاء. */
  weakestAyahs(userId: string, riwayah: string, surahNumber?: number) {
    const counts = new Map<string, { surah_number: number; ayah_number: number; count: number }>();
    for (const row of listRows('recitation_errors')) {
      if (row.user_id !== userId || row.riwayah !== riwayah) continue;
      if (surahNumber !== undefined && row.surah_number !== surahNumber) continue;
      const key = `${row.surah_number}_${row.ayah_number}`;
      const entry = counts.get(key) ?? {
        surah_number: row.surah_number,
        ayah_number: row.ayah_number,
        count: 0,
      };
      entry.count += 1;
      counts.set(key, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  },
};

export const reviewScheduleRepo = {
  /** المواعيد المستحقة (due_at <= الآن) أو السابقة. */
  due(userId: string, at: Date = new Date()) {
    const now = at.toISOString();
    return listRows('review_schedule')
      .filter((row) => row.user_id === userId && row.due_at <= now)
      .sort((a, b) => (a.due_at < b.due_at ? -1 : 1));
  },

  find(userId: string, riwayah: string, surahNumber: number, ayahNumber: number) {
    return listRows('review_schedule').find(
      (row) =>
        row.user_id === userId &&
        row.riwayah === riwayah &&
        row.surah_number === surahNumber &&
        row.ayah_number === ayahNumber,
    );
  },

  upsertByAyah(
    userId: string,
    riwayah: DatabaseRowMap['review_schedule']['riwayah'],
    surahNumber: number,
    ayahNumber: number,
    changes: Partial<
      Omit<
        DatabaseRowMap['review_schedule'],
        'id' | 'user_id' | 'riwayah' | 'surah_number' | 'ayah_number'
      >
    > = {},
  ) {
    const existing = this.find(userId, riwayah, surahNumber, ayahNumber);
    if (existing) return patchRow('review_schedule', existing.id, changes);

    return upsertRow('review_schedule', {
      id: uuid(),
      user_id: userId,
      riwayah,
      surah_number: surahNumber,
      ayah_number: ayahNumber,
      due_at: nowIso(),
      interval_days: 1,
      repetitions: 0,
      last_result: null,
      last_reviewed_at: null,
      ...changes,
    });
  },
};

// -----------------------------------------------------------------------------
// واجهة المزامنة (تُنفَّذ لاحقًا مع مزوّد سحابي)
// -----------------------------------------------------------------------------

/** الصفوف التي تغيّرت منذ لحظة معيّنة في كل الجداول (دفعة الرفع إلى الخادم). */
export function getChangedSince(
  sinceIso: string,
): { table: SyncableTable; rows: StoredRow<unknown>[] }[] {
  return SYNCABLE_TABLES.map((table) => ({
    table,
    rows: listRowsWithDeleted(table).filter((row) => row.updated_at > sinceIso),
  })).filter((batch) => batch.rows.length > 0);
}

/** دمج صف قادم من الخادم بسياسة «آخر كتابة تفوز» على updated_at. */
export function mergeRemoteRow<K extends SyncableTable>(table: K, remote: DatabaseRowMap[K]): void {
  const local = getRow(table, remote.id);
  if (local && local.updated_at >= remote.updated_at) return;

  const rows = readTable(table);
  const index = rows.findIndex((item) => item.id === remote.id);
  const merged = {
    ...remote,
    _sync: { state: 'synced' as const, lastSyncedAt: nowIso() },
  } as StoredRow<DatabaseRowMap[K]>;

  if (index >= 0) rows[index] = merged;
  else rows.push(merged);
  writeTable(table, rows);
}

/** وسم صفوف بأنها مُزامَنة بعد نجاح الرفع. */
export function markSynced<K extends SyncableTable>(table: K, ids: string[]): void {
  const idSet = new Set(ids);
  const rows = readTable(table).map((row) =>
    idSet.has(row.id)
      ? { ...row, _sync: { state: 'synced' as const, lastSyncedAt: nowIso() } }
      : row,
  );
  writeTable(table, rows);
}

/** لقطة كاملة للتشخيص أو النسخ الاحتياطي. */
export function exportSnapshot(): Record<string, StoredRow<unknown>[]> {
  return Object.fromEntries(SYNCABLE_TABLES.map((table) => [table, listRowsWithDeleted(table)]));
}

/** تفريغ قاعدة البيانات المحلية (يُستخدم في الاختبارات أو تسجيل الخروج). */
export function clearLocalDatabase(): void {
  for (const table of SYNCABLE_TABLES) {
    try {
      localStorage.removeItem(tableKey(table));
    } catch (error) {
      console.warn(`تعذّر تفريغ الجدول ${table}`, error);
    }
  }
}
