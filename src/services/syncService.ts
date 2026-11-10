/**
 * محرّك المزامنة مع Supabase (الطبقة السحابية للمسار «محلي أولًا + مزامنة لاحقًا»).
 *
 * يعمل على مبدئين:
 *  1. السحب أولًا: تُدمج تغييرات الخادم محليًا بسياسة «آخر كتابة تفوز» على updated_at
 *     (عبر mergeRemoteRow في databaseService، التي تتجاهل الصفوف المحلية الأحدث).
 *  2. الرفع ثانيًا: تُرفع الصفوف المحلية المعلّقة (_sync.state = 'pending') فقط.
 *     وبعد الدمج تكون الصفوف التي فاز فيها الخادم قد صارت 'synced' فلا تُرفع مجددًا،
 *     ما يجعل الترتيب (سحب ثم رفع) يحسم التعارض لصالح الأحدث دون منطق إضافي.
 *
 * علاقة الصفوف بالمستخدم: RLS في Supabase تشترط auth.uid() = user_id، لذا تتوقف
 * المزامنة إن لم تكن هناك جلسة مصادَق عليها، أو إن اختلف مُعرّف المستخدم المحلي عن
 * مُعرّف الجلسة (حماية من رفع الصفوف تحت مستخدم خطأ).
 */

import {
  SYNCABLE_TABLES,
  getLocalUserId,
  listRowsWithDeleted,
  mergeRemoteRow,
  markSynced,
  nowIso,
} from './databaseService';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { DatabaseRowMap, SyncStamp, SyncableTable } from '../types/database';

const LAST_SYNC_KEY = 'murattil.db.last_sync_at';

/** صف محلي عام (أعمدة الجدول + بصمة المزامنة). */
type LocalRow = Record<string, unknown> & { id: string; _sync?: SyncStamp };

export type SyncStatus =
  | 'not_configured' // لا توجد إعدادات Supabase في البيئة
  | 'unauthenticated' // لا توجد جلسة مصادَق عليها
  | 'identity_mismatch' // مُعرّف المستخدم المحلي يخالف مُعرّف الجلسة
  | 'synced' // اكتملت المزامنة
  | 'failed'; // خطأ شبكي أو من الخادم

export interface SyncResult {
  status: SyncStatus;
  pushed: number;
  pulled: number;
  error?: string;
}

/** وقت آخر مزامنة ناجحة (علامة السحب المرجعية). */
export function getLastSyncAt(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

function setLastSyncAt(iso: string): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, iso);
  } catch (error) {
    console.warn('تعذّر حفظ وقت المزامنة', error);
  }
}

/** يحذف بصمة المزامنة المحلية قبل الإرسال للخادم. */
function stripLocal(row: LocalRow): Record<string, unknown> {
  const { _sync, ...rest } = row;
  return rest;
}

/** الصفوف المعلّقة (`_sync.state = 'pending'`) مجمّعة حسب الجدول. */
function pendingBatches(): { table: SyncableTable; rows: LocalRow[] }[] {
  return SYNCABLE_TABLES.map((table) => ({
    table,
    rows: (listRowsWithDeleted(table) as unknown as LocalRow[]).filter(
      (row) => row._sync?.state === 'pending',
    ),
  })).filter((batch) => batch.rows.length > 0);
}

/**
 * يُنفّذ دورة مزامنة كاملة (سحب ثم رفع). آمن للاستدعاء المتكرر: لا يفعل شيئًا
 * ويُعيد حالة توضيحية إن لم تكن المزامنة مهيّأة أو مصادَقة.
 */
export async function syncNow(): Promise<SyncResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { status: 'not_configured', pushed: 0, pulled: 0 };
  }
  const client = supabase;

  try {
    const { data: sessionData } = await client.auth.getSession();
    const authUserId = sessionData.session?.user.id;
    if (!authUserId) return { status: 'unauthenticated', pushed: 0, pulled: 0 };
    if (authUserId !== getLocalUserId()) {
      return { status: 'identity_mismatch', pushed: 0, pulled: 0 };
    }

    const since = getLastSyncAt();
    const startedAt = nowIso();
    let pulled = 0;
    let pushed = 0;

    // 1) سحب تغييرات الخادم منذ آخر مزامنة ودمجها (آخر كتابة تفوز).
    for (const table of SYNCABLE_TABLES) {
      let query = client.from(table).select('*');
      if (since) query = query.gt('updated_at', since);
      const { data, error } = await query;
      if (error) throw error;
      for (const row of data ?? []) {
        mergeRemoteRow(table, row as DatabaseRowMap[SyncableTable]);
        pulled += 1;
      }
    }

    // 2) رفع الصفوف المحلية المعلّقة (بعد الدمج: الأحدث فقط يبقى معلّقًا).
    for (const { table, rows } of pendingBatches()) {
      const { error } = await client
        .from(table)
        .upsert(rows.map(stripLocal));
      if (error) throw error;
      markSynced(
        table,
        rows.map((row) => row.id),
      );
      pushed += rows.length;
    }

    setLastSyncAt(startedAt);
    return { status: 'synced', pushed, pulled };
  } catch (error) {
    console.warn('فشلت المزامنة مع Supabase', error);
    return { status: 'failed', pushed: 0, pulled: 0, error: String(error) };
  }
}
