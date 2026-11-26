-- ============================================================================
-- مُرتِّل — riwayat (qira'at) support
--
-- The app now offers Hafs `حفص عن عاصم` (Kufi counting, 6,236 verses) and Warsh
-- `ورش عن نافع` (Madani-last counting, 6,214 verses). A verse number is only
-- meaningful inside one riwayah: `2:255` is not the same verse in both, so the
-- ayah identity includes the riwayah code.
--
-- `surahs` keeps the Hafs metadata for backwards compatibility; per-riwayah
-- counts live in `surah_ayah_counts`.
-- ============================================================================

-- ────────────────────────────────────────────────────────────
-- Riwayat reference table
-- ────────────────────────────────────────────────────────────

create table if not exists public.riwayat (
  code text primary key check (code ~ '^[a-z][a-z0-9_-]{2,31}$'),
  name_ar text not null check (length(btrim(name_ar)) > 0),
  name_en text not null check (length(btrim(name_en)) > 0),
  qiraah_ar text not null check (length(btrim(qiraah_ar)) > 0),
  counting_system_ar text not null check (length(btrim(counting_system_ar)) > 0),
  total_ayahs smallint not null check (total_ayahs between 1 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.riwayat
  (code, name_ar, name_en, qiraah_ar, counting_system_ar, total_ayahs)
values
  ('hafs', 'حفص عن عاصم', 'Hafs', 'عاصم', 'العد الكوفي', 6236),
  ('warsh', 'ورش عن نافع', 'Warsh', 'نافع المدني', 'المدني الأخير', 6214)
on conflict (code) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  qiraah_ar = excluded.qiraah_ar,
  counting_system_ar = excluded.counting_system_ar,
  total_ayahs = excluded.total_ayahs;

-- ────────────────────────────────────────────────────────────
-- Per-riwayah surah counts
-- ────────────────────────────────────────────────────────────

create table if not exists public.surah_ayah_counts (
  riwayah_code text not null references public.riwayat (code) on delete cascade,
  surah_number smallint not null
    references public.surahs (number) on delete restrict,
  ayah_count smallint not null check (ayah_count between 1 and 300),
  primary key (riwayah_code, surah_number)
);

-- Seed the Hafs counts from the existing canonical surah table.
insert into public.surah_ayah_counts (riwayah_code, surah_number, ayah_count)
select 'hafs', s.number, s.ayah_count
  from public.surahs s
on conflict (riwayah_code, surah_number) do update set
  ayah_count = excluded.ayah_count;

-- ────────────────────────────────────────────────────────────
-- Ayah identity now includes the riwayah
-- ────────────────────────────────────────────────────────────

alter table public.ayahs
  add column if not exists riwayah_code text not null default 'hafs'
    references public.riwayat (code) on delete restrict;

-- Drop the old (surah, ayah) uniqueness. The replacement below allows the same
-- surah/ayah number in two riwayat while keeping each riwayah unique.
alter table public.ayahs
  drop constraint if exists ayahs_surah_number_ayah_number_key;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.ayahs'::regclass
       and conname = 'ayahs_riwayah_surah_ayah_key'
  ) then
    alter table public.ayahs
      add constraint ayahs_riwayah_surah_ayah_key
      unique (riwayah_code, surah_number, ayah_number);
  end if;
end $$;

create index if not exists ayahs_riwayah_surah_idx
  on public.ayahs (riwayah_code, surah_number, ayah_number);

-- An edition belongs to exactly one riwayah. Existing Tanzil/Uthmani rows
-- default to Hafs.
alter table public.quran_editions
  add column if not exists riwayah_code text not null default 'hafs'
    references public.riwayat (code) on delete restrict;

create index if not exists quran_editions_riwayah_idx
  on public.quran_editions (riwayah_code);

-- The reciter's preferred riwayah. It is only a default: progress is always
-- keyed by the ayah id, which carries the riwayah.
alter table public.profiles
  add column if not exists riwayah_code text not null default 'hafs'
    references public.riwayat (code) on delete restrict;

-- ────────────────────────────────────────────────────────────
-- Grants and row level security
-- ────────────────────────────────────────────────────────────

grant select on public.riwayat, public.surah_ayah_counts to anon, authenticated;

alter table public.riwayat enable row level security;
alter table public.surah_ayah_counts enable row level security;

drop policy if exists "Riwayat are readable" on public.riwayat;
create policy "Riwayat are readable"
  on public.riwayat for select to anon, authenticated using (true);

drop policy if exists "Surah ayah counts are readable" on public.surah_ayah_counts;
create policy "Surah ayah counts are readable"
  on public.surah_ayah_counts for select to anon, authenticated using (true);
