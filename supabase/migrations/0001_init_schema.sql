-- =============================================================================
-- 0001_init_schema.sql
-- مخطط قاعدة بيانات تطبيق حفظ القرآن — تصميم «محلي أولًا + مزامنة لاحقًا»
-- الهدف: PostgreSQL / Supabase
--
-- المبادئ المعتمدة:
--   1) جدولان مرجعيان للقراءة فقط (surahs / ayahs) مصدرهما الحزم المحلية الموثّقة،
--      فلا تُكتب من التطبيق ولا تُعدّل يدويًا.
--   2) كل صف يخصّ المستخدم يحمل: id (uuid يُولَّد على العميل) + updated_at + deleted_at
--      لتمكين المزامنة لاحقًا بسياسة «آخر كتابة تفوز» (last-write-wins).
--   3) الحذف ناعم (deleted_at) لأن الحذف الصلب يمنع المزامنة (لا يمكن تمييز
--      «غير موجود» عن «جديد»).
--   4) جداول الأحداث (recitation_sessions / recitation_errors) هي سجل الحقيقة،
--      وجداول الحالة (memorization_progress / review_schedule) مُجمَّعات تُشتق منها.
--   5) بُعد الرواية (riwayah) جزء من مفتاح الآية؛ نص حفص وورش يختلفان.
-- =============================================================================

create extension if not exists "pgcrypto"; -- لتوفير gen_random_uuid()

-- =============================================================================
-- 1) البيانات المرجعية (للقراءة فقط)
-- =============================================================================

create table if not exists public.surahs (
  id              smallint primary key,                                   -- رقم السورة 1..114
  name            text     not null,                                      -- الاسم بالعربية
  english_name    text     not null,
  revelation_type text     not null check (revelation_type in ('مكية', 'مدنية')),
  ayah_count      smallint not null check (ayah_count > 0),
  page_start      smallint,
  juz_start       smallint
);

comment on table public.surahs is 'بيانات السور المرجعية — تُزرع من quranSurahsList.ts ولا تُعدّل من التطبيق';

create table if not exists public.ayahs (
  id           text     primary key,                                      -- مفتاح ثابت: '<riwayah>-<surah>-<ayah>'
  riwayah      text     not null check (riwayah in ('hafs', 'warsh')),
  surah_number smallint not null references public.surahs (id) on delete cascade,
  ayah_number  smallint not null check (ayah_number > 0),
  text         text     not null,                                         -- النص المشكول الموثّق
  simple_text  text,                                                      -- النص بلا تشكيل (للمطابقة الصوتية)
  juz          smallint,
  page         smallint,                                                  -- رقم الصفحة في المصحف لهذه الرواية
  source       text,                                                      -- مصدر النص للتوثيق
  unique (riwayah, surah_number, ayah_number)
);

comment on table public.ayahs is 'الآيات المرجعية لكل رواية — تُشتق من public/quran/{warsh-text.json, mushaf-pages.json}';

-- =============================================================================
-- 2) المستخدمون
-- =============================================================================

-- ملاحظة: على Supabase يُعرَّف هذا الجدول كامتداد لـ auth.users (جدول profiles).
create table if not exists public.profiles (
  id                uuid        primary key references auth.users (id) on delete cascade,
  email             text,
  display_name      text,
  daily_goal_ayahs  smallint    not null default 5 check (daily_goal_ayahs > 0), -- الهدف اليومي
  preferred_riwayah text        not null default 'hafs' check (preferred_riwayah in ('hafs', 'warsh')),
  settings          jsonb       not null default '{}'::jsonb,                    -- إعدادات مرنة (قارئ مفضّل، وحدة العرض…)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table public.profiles is 'حساب المستخدم وإعداداته وهدفه اليومي';

-- =============================================================================
-- 3) تقدم الحفظ (حالة مُجمَّعة)
-- =============================================================================

create table if not exists public.memorization_progress (
  id                        uuid        primary key default gen_random_uuid(),
  user_id                   uuid        not null references public.profiles (id) on delete cascade,
  riwayah                   text        not null check (riwayah in ('hafs', 'warsh')),
  surah_number              smallint    not null,
  ayah_number               smallint    not null,
  is_target                 boolean     not null default true,   -- هل هي ضمن مقطع الحفظ الحالي؟
  status                    text        not null default 'not_started'
                            check (status in ('not_started', 'learning', 'memorized', 'needs_review')),
  mastery_level             smallint    not null default 0 check (mastery_level between 0 and 5),
  consecutive_success_count integer     not null default 0,
  mistake_count             integer     not null default 0,
  last_reviewed_at          timestamptz,
  next_review_at            timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  deleted_at                timestamptz,
  unique (user_id, riwayah, surah_number, ayah_number)
);

comment on table public.memorization_progress is 'حالة حفظ كل آية لكل مستخدم — تُحدَّث بعد كل جلسة تسميع';

-- =============================================================================
-- 4) جلسات التسميع (سجل أحداث)
-- =============================================================================

create table if not exists public.recitation_sessions (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles (id) on delete cascade,
  riwayah          text        not null check (riwayah in ('hafs', 'warsh')),
  mode             text        not null default 'recite' check (mode in ('listen', 'recite', 'review')),
  surah_number     smallint    not null,
  ayah_start       smallint    not null,
  ayah_end         smallint    not null,
  daily_amount     smallint,                                    -- مقدار الحفظ اليومي المختار
  repeat_count     smallint,                                    -- عدد مرات التكرار المختار
  reciter_id       text,                                        -- القارئ المختار للاستماع
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds integer     not null default 0,
  accuracy_percent numeric(5, 2) check (accuracy_percent between 0 and 100),
  flawless_count   smallint    not null default 0,
  error_count      integer     not null default 0,
  processing_state text        not null default 'pending'
                   check (processing_state in ('pending', 'processed', 'failed')),
  analysis         jsonb       not null default '{}'::jsonb,     -- نتيجة التحليل الخام كما رجعت من التعرّف الصوتي
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table public.recitation_sessions is 'كل جلسة تسميع: الآيات المطلوبة ووقتها ونتيجة التحليل';

-- =============================================================================
-- 5) أخطاء التسميع (تفاصيل داخلة في الجلسة)
-- =============================================================================

create table if not exists public.recitation_errors (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  -- nullable: قد يُسجَّل الخطأ خارج سياق جلسة (تسميع سريع لآية واحدة)
  session_id    uuid        references public.recitation_sessions (id) on delete cascade,
  riwayah       text        not null check (riwayah in ('hafs', 'warsh')),
  surah_number  smallint    not null,
  ayah_number   smallint    not null,
  word_index    smallint,                                        -- موضع الكلمة إن توفّر من المحلّل
  error_type    text        not null check (error_type in ('substitution', 'omission', 'addition', 'order', 'tajweed')),
  expected_word text,                                            -- الكلمة المتوقّعة
  recited_word  text,                                            -- ما سمعه المحرّك فعليًا
  confidence    numeric(4, 3) check (confidence between 0 and 1), -- درجة ثقة المحرّك
  user_confirmed boolean,                                        -- null = لم يُحسم بعد
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.recitation_errors is 'تفاصيل الأخطاء داخل الجلسة مع موضعها ونوعها وثقتها';

-- =============================================================================
-- 6) جدول المراجعة (حالة مُجمَّعة)
-- =============================================================================

create table if not exists public.review_schedule (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles (id) on delete cascade,
  riwayah          text        not null check (riwayah in ('hafs', 'warsh')),
  surah_number     smallint    not null,
  ayah_number      smallint    not null,
  due_at           timestamptz not null default now(),          -- موعد المراجعة التالية
  interval_days    smallint    not null default 1 check (interval_days > 0),
  repetitions      integer     not null default 0,              -- عدد النجاحات المتتالية (فهرس التكرار المتباعد)
  last_result      text        check (last_result in ('flawless', 'errors', 'skipped')),
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (user_id, riwayah, surah_number, ayah_number)
);

comment on table public.review_schedule is 'مواعيد المراجعة المتباعدة لكل آية لكل مستخدم';

-- =============================================================================
-- 7) الفهارس
-- =============================================================================

-- «ما هو مستحق للمراجعة اليوم؟»
create index if not exists idx_review_schedule_due
  on public.review_schedule (user_id, due_at) where deleted_at is null;

create index if not exists idx_memorization_progress_next_review
  on public.memorization_progress (user_id, next_review_at) where deleted_at is null;

-- «آيات تحتاج تدريبًا إضافيًا في سورة معيّنة»
create index if not exists idx_memorization_progress_weak
  on public.memorization_progress (user_id, riwayah, surah_number)
  where deleted_at is null and (mistake_count > 0 or status = 'needs_review');

-- سجل الجلسات مرتبًا زمنيًا
create index if not exists idx_recitation_sessions_user_time
  on public.recitation_sessions (user_id, started_at desc);

create index if not exists idx_recitation_errors_session
  on public.recitation_errors (session_id);

create index if not exists idx_recitation_errors_ayah
  on public.recitation_errors (user_id, riwayah, surah_number, ayah_number);

-- فهرس المزامنة: «ما الذي تغيّر منذ آخر مزامنة؟»
create index if not exists idx_memorization_progress_updated on public.memorization_progress (updated_at);
create index if not exists idx_recitation_sessions_updated   on public.recitation_sessions (updated_at);
create index if not exists idx_recitation_errors_updated     on public.recitation_errors (updated_at);
create index if not exists idx_review_schedule_updated       on public.review_schedule (updated_at);

create index if not exists idx_ayahs_lookup on public.ayahs (riwayah, surah_number, ayah_number);

-- =============================================================================
-- 8) تحديث updated_at تلقائيًا
-- =============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'memorization_progress',
    'recitation_sessions',
    'recitation_errors',
    'review_schedule'
  ]
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
       for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;
