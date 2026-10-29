-- Repair the SM-2 rows written before the schedule bounds existed.
--
-- The legacy client increased `ease_factor` by 0.1 on every flawless review
-- without a ceiling and multiplied `interval_days` by it. A verse reviewed often
-- ended up scheduled decades away: one production row had an interval of
-- 73 183 days, so the verse was effectively never reviewed again.
--
-- `storageService.recordVerseResult` now caps the ease factor at 3.00 and the
-- interval at 365 days, and `normalizedProgressService` applies the same bounds
-- when it mirrors a snapshot. This migration fixes the rows already stored.
--
-- It is a no-op on a database that never received such a row. In the SET list,
-- `interval_days` and `status` still refer to the row's previous values, and a
-- suspended or completed row keeps its status.

update public.review_schedule
set
  interval_days = least(interval_days, 365),
  ease_factor = least(ease_factor, 3.00),
  due_at = case
    when interval_days > 365 then coalesce(last_reviewed_at, now()) + interval '365 days'
    else due_at
  end,
  status = case
    when interval_days <= 365 then status
    when status not in ('scheduled', 'due') then status
    when coalesce(last_reviewed_at, now()) + interval '365 days' <= now() then 'due'
    else 'scheduled'
  end
where interval_days > 365
   or ease_factor > 3.00;
