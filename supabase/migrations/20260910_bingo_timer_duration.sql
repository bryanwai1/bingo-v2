-- ============================================================
-- bingo_sections: remember the timer's configured duration separately
-- from its live/paused remaining value
--
-- Symptom: "Reset" could only zero the timer or leave it untouched,
-- because timer_seconds does two jobs at once — the duration an admin
-- configures AND the remaining time once paused (pauseTimer overwrites
-- it with whatever's left). Once paused, the original duration was gone
-- for good, so there was nothing for Reset to hand back.
--
-- Fix: track the configured duration in its own column. Reset now
-- restores timer_seconds to timer_duration_seconds instead of wiping to
-- zero, so it goes back to the length the admin actually set.
--
-- Safe to run more than once, and safe on an event day: it only adds a
-- column and backfills it, touching no existing rows' live timers.
-- ============================================================

alter table public.bingo_sections
  add column if not exists timer_duration_seconds integer not null default 0;

-- Backfill: best guess for boards that already have a duration configured —
-- carry the current timer_seconds forward as the configured duration.
update public.bingo_sections
set timer_duration_seconds = timer_seconds
where timer_duration_seconds = 0 and timer_seconds > 0;
