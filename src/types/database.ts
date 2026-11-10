/**
 * أنواع قاعدة البيانات — تعكس مخطط supabase/migrations حرفيًا (snake_case).
 *
 * هذه الأنواع تخصّ طبقة التخزين فقط (صفوف الجداول)، أما أنواع المجال التي
 * تستخدمها الواجهات فتبقى في types/quran.ts. الطبقة الوسيطة في
 * services/databaseService.ts هي التي تحوّل بينهما عند الحاجة.
 */

import { RiwayahKey } from './quran';

/** الرواية كما تُخزَّن في قاعدة البيانات (نفس مفتاح المجال). */
export type Riwayah = RiwayahKey;

// -----------------------------------------------------------------------------
// أعمدة مشتركة
// -----------------------------------------------------------------------------

/** أعمدة المزامنة الإلزامية في كل جدول يملكه المستخدم. */
export interface SyncColumns {
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  deleted_at: string | null; // حذف ناعم (tombstone) لتمكين المزامنة
}

/** صف جديد قبل الكتابة: id اختياري (يُولَّد على العميل)، وأعمدة المزامنة تلقائية. */
export type NewRow<T extends { id: string } & SyncColumns> = Omit<
  T,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
> & { id?: string };

/** تعديل جزئي لصف قائم. */
export type RowPatch<T> = Partial<Omit<T, 'id' | 'created_at'>>;

// -----------------------------------------------------------------------------
// قيم مُعدَّدة (مطابقة لقيود check في SQL)
// -----------------------------------------------------------------------------

export type MemorizationStatus = 'not_started' | 'learning' | 'memorized' | 'needs_review';
export type RecitationMode = 'listen' | 'recite' | 'review';
export type ProcessingState = 'pending' | 'processed' | 'failed';
export type RecitationErrorType = 'substitution' | 'omission' | 'addition' | 'order' | 'tajweed';
export type ReviewResult = 'flawless' | 'errors' | 'skipped';
export type RevelationType = 'مكية' | 'مدنية';

// -----------------------------------------------------------------------------
// 1) البيانات المرجعية (للقراءة فقط)
// -----------------------------------------------------------------------------

export interface SurahRow {
  id: number; // رقم السورة 1..114
  name: string;
  english_name: string;
  revelation_type: RevelationType;
  ayah_count: number;
  page_start: number | null;
  juz_start: number | null;
}

export interface AyahRow {
  id: string; // '<riwayah>-<surah>-<ayah>'
  riwayah: Riwayah;
  surah_number: number;
  ayah_number: number;
  text: string;
  simple_text: string | null;
  juz: number | null;
  page: number | null;
  source: string | null;
}

// -----------------------------------------------------------------------------
// 2) المستخدمون
// -----------------------------------------------------------------------------

export interface ProfileRow extends SyncColumns {
  id: string; // uuid — يطابق auth.users.id
  email: string | null;
  display_name: string | null;
  daily_goal_ayahs: number;
  preferred_riwayah: Riwayah;
  settings: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// 3) تقدم الحفظ
// -----------------------------------------------------------------------------

export interface MemorizationProgressRow extends SyncColumns {
  id: string;
  user_id: string;
  riwayah: Riwayah;
  surah_number: number;
  ayah_number: number;
  is_target: boolean;
  status: MemorizationStatus;
  mastery_level: number; // 0..5
  consecutive_success_count: number;
  mistake_count: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
}

// -----------------------------------------------------------------------------
// 4) جلسات التسميع
// -----------------------------------------------------------------------------

export interface RecitationSessionRow extends SyncColumns {
  id: string;
  user_id: string;
  riwayah: Riwayah;
  mode: RecitationMode;
  surah_number: number;
  ayah_start: number;
  ayah_end: number;
  daily_amount: number | null;
  repeat_count: number | null;
  reciter_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  accuracy_percent: number | null;
  flawless_count: number;
  error_count: number;
  processing_state: ProcessingState;
  analysis: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// 5) أخطاء التسميع
// -----------------------------------------------------------------------------

export interface RecitationErrorRow extends SyncColumns {
  id: string;
  user_id: string;
  session_id: string | null; // null = سُجّل الخطأ خارج سياق جلسة
  riwayah: Riwayah;
  surah_number: number;
  ayah_number: number;
  word_index: number | null; // موضع الكلمة إن توفّر من محلّل الجلسة
  error_type: RecitationErrorType;
  expected_word: string | null;
  recited_word: string | null;
  confidence: number | null; // 0..1
  user_confirmed: boolean | null;
}

// -----------------------------------------------------------------------------
// 6) جدول المراجعة
// -----------------------------------------------------------------------------

export interface ReviewScheduleRow extends SyncColumns {
  id: string;
  user_id: string;
  riwayah: Riwayah;
  surah_number: number;
  ayah_number: number;
  due_at: string;
  interval_days: number;
  repetitions: number;
  last_result: ReviewResult | null;
  last_reviewed_at: string | null;
}

// -----------------------------------------------------------------------------
// حالة المزامنة المحلية (لا تُرسل للخادم)
// -----------------------------------------------------------------------------

export type LocalSyncState = 'local' | 'pending' | 'synced';

export interface SyncStamp {
  state: LocalSyncState;
  lastSyncedAt: string | null;
}

/** صف كما يُخزَّن محليًا: الصف نفسه + بصمة مزامنة اختيارية. */
export type StoredRow<T> = T & { _sync?: SyncStamp };

/** اسم أي جدول يملكه المستخدم (قابل للمزامنة). */
export type SyncableTable =
  | 'profiles'
  | 'memorization_progress'
  | 'recitation_sessions'
  | 'recitation_errors'
  | 'review_schedule';

/** خريطة أسماء الجداول إلى أنواع صفوفها. */
export interface DatabaseRowMap {
  profiles: ProfileRow;
  memorization_progress: MemorizationProgressRow;
  recitation_sessions: RecitationSessionRow;
  recitation_errors: RecitationErrorRow;
  review_schedule: ReviewScheduleRow;
  surahs: SurahRow;
  ayahs: AyahRow;
}
