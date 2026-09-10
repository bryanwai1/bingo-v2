-- Contest ("contending") mode for competition cards.
--
-- Two teams meet face to face. The CHALLENGER opens a contest card and scans the
-- DEFENDER's in-app QR code, which pairs them into a duel row. Both phones then
-- unlock the same clue and the same randomised game payload, play it out, and a
-- marshal declares the winner.
--
-- Scoring rules this schema has to support (decided with Bryan):
--   • The cross-off on the board ALWAYS belongs to the challenger — it is their
--     tile and they spent it, win or lose — and it earns the card's normal
--     points exactly like any other tile. Nothing about tile scoring changes.
--   • On top of that, each contest card carries a CONTEST BONUS. Only the winner
--     of the duel banks it. A winning defender therefore scores the bonus
--     without their own board being touched at all.

-- ── 1. Cards can be marked as contest cards ──────────────────────────────────
ALTER TABLE bingo_tasks
  ADD COLUMN IF NOT EXISTS is_contest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contest_game text NOT NULL DEFAULT 'speed-edit',
  ADD COLUMN IF NOT EXISTS contest_bonus int NOT NULL DEFAULT 100;

COMMENT ON COLUMN bingo_tasks.is_contest IS
  'When true this card is played as a head-to-head duel between two teams instead of a solo task.';
COMMENT ON COLUMN bingo_tasks.contest_game IS
  'Which contest game this card runs. Keys come from src/lib/contestGames.ts.';
COMMENT ON COLUMN bingo_tasks.contest_bonus IS
  'Extra points awarded to the WINNER of the duel, on top of the tile points the challenger gets for crossing off.';

-- ── 2. The duel ledger ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bingo_duels (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id         uuid NOT NULL REFERENCES bingo_sections(id) ON DELETE CASCADE,
  task_id            uuid NOT NULL REFERENCES bingo_tasks(id)    ON DELETE CASCADE,
  challenger_team_id uuid NOT NULL REFERENCES bingo_teams(id)    ON DELETE CASCADE,
  defender_team_id   uuid NOT NULL REFERENCES bingo_teams(id)    ON DELETE CASCADE,
  game_key           text NOT NULL DEFAULT 'speed-edit',
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'active', 'done', 'declined', 'cancelled')),
  -- Whatever the game needs both phones to agree on, e.g. the randomly drawn
  -- Speed Edit target image. Written once by the challenger so both sides read
  -- the identical value.
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_team_id     uuid REFERENCES bingo_teams(id) ON DELETE SET NULL,
  -- Snapshot of the card's contest bonus at resolve time, so later edits to the
  -- card never rewrite history on the scoreboard.
  bonus_points       int  NOT NULL DEFAULT 0,
  -- Human-readable reference so a marshal can match phone to phone out loud.
  code               text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz,
  resolved_at        timestamptz,
  CONSTRAINT bingo_duels_distinct_teams CHECK (challenger_team_id <> defender_team_id)
);

CREATE INDEX IF NOT EXISTS bingo_duels_defender_idx   ON bingo_duels (defender_team_id, status);
CREATE INDEX IF NOT EXISTS bingo_duels_challenger_idx ON bingo_duels (challenger_team_id, status);
CREATE INDEX IF NOT EXISTS bingo_duels_section_idx    ON bingo_duels (section_id, status);
CREATE INDEX IF NOT EXISTS bingo_duels_winner_idx     ON bingo_duels (winner_team_id);

-- ── 3. RLS — mirrors the other gameplay tables ───────────────────────────────
-- Players are anonymous and need full write access; authenticated sessions are
-- confined to their own tenant so "reset all teams" can never reach across.
ALTER TABLE bingo_duels ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'bingo_duels'
  LOOP
    EXECUTE format('drop policy %I on public.bingo_duels', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "read open"   ON public.bingo_duels FOR SELECT USING (true);
CREATE POLICY "anon write"  ON public.bingo_duels FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update" ON public.bingo_duels FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete" ON public.bingo_duels FOR DELETE TO anon USING (true);
CREATE POLICY "tenant write" ON public.bingo_duels FOR ALL TO authenticated
  USING (public.can_use_game('bingo') AND EXISTS (
    SELECT 1 FROM public.bingo_sections s
    WHERE s.id = section_id AND public.bingo_can_write(s.owner_id)))
  WITH CHECK (public.can_use_game('bingo') AND EXISTS (
    SELECT 1 FROM public.bingo_sections s
    WHERE s.id = section_id AND public.bingo_can_write(s.owner_id)));

-- ── 4. Realtime — both phones and the scoreboard live-follow duels ───────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bingo_duels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bingo_duels;
  END IF;
END $$;
