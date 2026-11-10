-- =============================================================================
-- 0002_rls_policies.sql
-- سياسات أمان الصفوف (Row Level Security)
--
-- القاعدة: كل مستخدم يرى ويعدّل صفوفه هو فقط.
-- الجداول المرجعية (surahs / ayahs) للقراءة العامة، والكتابة محصورة على
-- service_role (زرع البيانات) — أي لا يمكن للمستخدم العادي تعديل نص القرآن.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- تفعيل RLS على جميع الجداول
-- -----------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.memorization_progress  enable row level security;
alter table public.recitation_sessions    enable row level security;
alter table public.recitation_errors      enable row level security;
alter table public.review_schedule        enable row level security;
alter table public.surahs                 enable row level security;
alter table public.ayahs                  enable row level security;

-- -----------------------------------------------------------------------------
-- profiles: المستخدم يقرأ ويعدّل ملفه فقط
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- الجداول التي تملكها المستخدم: عبر user_id = auth.uid()
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'memorization_progress',
    'recitation_sessions',
    'recitation_errors',
    'review_schedule'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      t || '_select_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
      t || '_insert_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_update_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format(
      'create policy %I on public.%I for delete using (auth.uid() = user_id)',
      t || '_delete_own', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- الجداول المرجعية: قراءة عامة، وكتابة محصورة على service_role
-- -----------------------------------------------------------------------------
drop policy if exists surahs_read_all on public.surahs;
create policy surahs_read_all on public.surahs
  for select using (true);

drop policy if exists ayahs_read_all on public.ayahs;
create policy ayahs_read_all on public.ayahs
  for select using (true);

-- لا سياسات insert/update/delete للجداول المرجعية ⇒ لا يمكن الكتابة إلا بـ service_role
-- (service_role يتجاوز RLS بطبيعته).
