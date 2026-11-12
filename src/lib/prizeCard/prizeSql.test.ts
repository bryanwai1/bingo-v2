// PRD-008 / ADR-008: the SQL is written but NOT run against any database here,
// so these tests read the migration text and check each rule is in it. The rules
// themselves are exercised by supabase/prize-card/prize_card.test.sql (run by hand
// in a sandbox).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = (p: string) => readFileSync(new URL(`../../../supabase/${p}`, import.meta.url), 'utf8')
const mig = sql('prize-card/20261117_prize_card.sql')
const claimFn = mig.slice(mig.indexOf('function public.claim_prize'), mig.indexOf('function public.get_prize_reveal'))

test('AC-3: one winner is enforced by a unique placement id and insert ... on conflict do nothing', () => {
  assert.match(mig, /board_card_id uuid not null unique references public\.bingo_board_cards/)
  assert.match(claimFn, /on conflict \(board_card_id\) do nothing/)
  assert.match(claimFn, /'reason', 'taken'/)
})

test('AC-4/AC-8: the server re-counts completed grid scans below slot 200 and refuses below the threshold', () => {
  assert.match(claimFn, /sc\.completed/)
  assert.match(claimFn, /g\.slot < 200/)
  assert.match(claimFn, /n < t\.prize_threshold then return json_build_object\('ok', false, 'reason', 'not_eligible'\)/)
  assert.ok(claimFn.indexOf('n < t.prize_threshold') < claimFn.indexOf('insert into bingo_prize_claims'), 'threshold is checked before anything is written')
})

test('fix 3: a repeat claim by the holding team returns ok instead of "taken"', () => {
  const afterConflict = claimFn.slice(claimFn.indexOf('if v_id is null'))
  assert.ok(afterConflict.indexOf('v_team = tm.id') < afterConflict.indexOf("'reason', 'taken'"))
  assert.match(afterConflict, /v_team = tm\.id then return json_build_object\('ok', true\)/)
})

test('AC-9: team and role come from the member row, and an observer is refused', () => {
  assert.match(claimFn, /select \* into m\s+from bingo_members where id = p_member/)
  assert.match(claimFn, /m\.role <> 'player'/)
})

test('AC-6/AC-7: the reveal is for the claiming team only and has no game-state or date check', () => {
  const fn = mig.slice(mig.indexOf('function public.get_prize_reveal'))
  assert.match(fn, /c\.team_id = m\.team_id/)
  assert.ok(!/game_started|timer_end_at/.test(fn))
})

test('AC-6: the secret text is a table players cannot read (tenant-only policy, no select-true)', () => {
  const part = mig.slice(mig.indexOf('create table if not exists public.bingo_prize_secrets'), mig.indexOf('-- 3. Reserved'))
  assert.match(part, /enable row level security/)
  assert.match(part, /for all to authenticated/)
  assert.ok(!/using \(true\)/.test(part))
})

test('AC-5: claims are public, realtime-published and keep full replica identity', () => {
  assert.match(mig, /create policy "read open" on public\.bingo_prize_claims for select using \(true\)/)
  assert.match(mig, /replica identity full/)
  assert.match(mig, /alter publication supabase_realtime add table public\.bingo_prize_claims/)
})

test('AC-11: the admin can delete a claim; Reset Game cascades through the team', () => {
  assert.match(mig, /create policy "tenant delete" on public\.bingo_prize_claims for delete to authenticated/)
  assert.match(mig, /team_id\s+uuid not null references public\.bingo_teams\(id\) on delete cascade/)
})

test('AC-12: prize placements use slots 200..209, so clone and sync copy them by slot', () => {
  assert.match(mig, /slot >= 0 and slot < 210/)
  assert.match(mig, /is_prize boolean not null default false/)
  assert.match(mig, /prize_threshold int not null default 20/)
})

test('AC-12: clone, sync, template clone, fork and library push all carry bingo_prize_secrets', () => {
  for (const f of ['accounts-tenancy/20261112_clone_board_exact.sql', 'accounts-tenancy/20261116_sync_board_from_source.sql', 'accounts-tenancy/functions.sql']) {
    assert.match(sql(f), /array\['bingo_prize_secrets', 'task_id'\]/, f)
  }
  assert.match(sql('core-tables/20261008_board_card_fork.sql'), /insert into public\.bingo_prize_secrets/)
  const push = sql('core-tables/20261028_push_board_copy_to_library.sql')
  assert.match(push, /insert into public\.bingo_prize_secrets/)
  assert.match(push, /delete from public\.bingo_prize_secrets/)
})

test('AC-12: library packs carry the flag and threshold; the claim table is never copied', () => {
  assert.match(mig, /alter table public\.bingo_library_cards\s+add column if not exists is_prize/)
  assert.match(sql('accounts-tenancy/functions.sql'), /is_prize, prize_threshold\)/)
  for (const f of ['accounts-tenancy/20261112_clone_board_exact.sql', 'accounts-tenancy/20261116_sync_board_from_source.sql']) {
    assert.ok(!/bingo_prize_claims/.test(sql(f)), f)
  }
})

test('AC-15: scoring still reads only slots 0..24, so a prize placement scores nothing', () => {
  assert.match(sql('scoreboard/20261006_event_scoreboard_v2.sql'), /bc\.slot between 0 and 24/)
  assert.match(sql('accounts-tenancy/bingo_events.sql'), /bc\.slot between 0 and 24/)
})

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

test('fix 5: the projector mounts the prize band only for a board that has a prize placement', () => {
  assert.match(src('pages/BingoDashProjector.tsx'), /boardCards\.some\(bc => bc\.section_id === activeSectionId && !isGridSlot\(bc\.slot\)\) && \(\s*<ProjectorPrizeBandLive/)
})

test('fix 4: unlock-chain candidates skip prize placements', () => {
  assert.match(src('pages/BingoDashParticipant.tsx'), /select\('task_id, slot'\)[\s\S]{0,200}isGridSlot/)
})

test('fix 1: the picker refuses a second placement of the same prize card on a board', () => {
  const a = src('pages/BingoDashAdmin.tsx')
  assert.equal((a.match(/canAddPrize\(boardCards, currentSectionId/g) ?? []).length, 2)
})

test('sandbox-setup.sql carries the same migration under its header', () => {
  const all = readFileSync(new URL('../../../sandbox-setup.sql', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  assert.match(all, /-- ===== supabase\/prize-card\/20261117_prize_card\.sql =====/)
  assert.ok(all.includes(mig.trim()))
})
