# Scoring v2 — flat line bonus + per-card time bonus (PLAN ONLY, nothing built yet)

## Context
Today a team's score = tile points, where every box inside a completed line is paid *through the line* at a ×1.2…×2.0 multiplier, plus a hidden per-team `tiebreak` fraction, with a per-board "whole numbers / decimals" switch. Only AI Team Building cards have a time bonus (own ladders in `aitbActivities.ts`). We want one simple, predictable system for the whole ~2 hour game:

1. Bingo lines pay a **flat, growing bonus** (no multiplier).
2. **Every card** gets an editable timer that rewards finishing fast.
3. One scoring format — **whole numbers only**; the decimal option and tiebreak fraction go away.

## Rule 1 — Bingo line bonus (replaces ×multiplier)
- Every completed tile always pays **its own points** (time-adjusted, see Rule 2). Lines no longer re-pay or multiply tiles.
- Lines are counted in the order they were completed (existing replay logic stays):
  line 1 = **+100**, line 2 = **+200**, line 3 = **+300**, line 4 = **+400**, line 5 = **+500**. Max +1,500.
- 6th line onward adds **0** (same 5-line cap as today, `MAX_SCORING_LINES`).
- A box on a crossing point still counts for both lines for *line detection*, but tile points are paid once.
- If one box closes two lines at once, they take consecutive numbers (existing BINGO_LINES order decides which is "first").

## Rule 2 — Per-card time bonus
Clock = `completed_at − scanned_at` on the team's scan (opened the card → completed it). Both columns already exist on `bingo_scans`.

**Defaults first, then per-card edits:** the admin sets ONE board-wide default pair (F, T) that applies to every card automatically; any single card can then override it. Cards with no override follow the board default live, so changing the default later updates every non-overridden card at once. Priority: card override → board default (ships as **F=10, T=25**, your example).

Two numbers (board default, overridable per card):
- **Full-bonus minutes** (F) — finish within this and get **150%** of base points.
- **Timer minutes** (T) — at/after this you get **100%** (base only), no bonus.

Between F and T the bonus drops in **visible 10% checkpoints** (not a hidden smooth slide): 150% → 140% → 130% → 120% → 110% → 100%. The span T−F is split into 5 equal steps, so each checkpoint is a clear "hit this time → get this %":

```
elapsed <= F                 → 150%
F  < elapsed <= F + 1·s      → 140%      where s = (T − F) / 5
F+s < elapsed <= F + 2·s     → 130%
F+2s < elapsed <= F + 3·s    → 120%
F+3s < elapsed <  T          → 110%      (last checkpoint ends exactly at T)
elapsed >= T                 → 100%  (base points only, timer run out)
tile points = round(base × %)
```
Worked example (your case, F=10, T=25 → s=3 min, base 100):

| Finish by | Multiplier | Points |
|---|---|---|
| 10:00 | 150% | 150 |
| 13:00 | 140% | 140 |
| 16:00 | 130% | 130 |
| 19:00 | 120% | 120 |
| 22:00 | 110% | 110 |
| 25:00 and after | 100% (base) | 100 |

Never below base: a slow team is never punished, only un-rewarded.

Edge rules to confirm: if a card has no `scanned_at` (old data) → treat as base only; if admin sets T ≤ F → just 150% until T then 100% (no steps); rounding is per tile, so totals are always whole numbers. (Step size/count is fixed at 5×10% for v1; could be made editable later.)

### Countdown visualisation on every card (required)
Each card shows a live bonus countdown from the moment the team opens it (`scanned_at`), so players always see what they'd earn right now. Reuse the look/logic of `src/components/AitbBonusBar.tsx` and generalise it to all card types.
- **Checkpoint timeline bar** at the top of the opened card: one horizontal bar from 0 to T with **6 labelled checkpoints**, drawn like the tier markers in `AitbBonusBar.tsx`:
  `150% ▸ 140% ▸ 130% ▸ 120% ▸ 110% ▸ BASE`, each segment showing its deadline (e.g. `10:00`, `13:00` … `25:00`) and the points it's worth (`150`, `140` … `100`).
  - A moving marker/fill shows where the team is *right now*; segments already passed turn grey with a strike, the current one is highlighted (gold at 150%, shading amber → red as it drops), future ones stay dim.
  - Big live readout next to it: current % and points, plus the time left in the current checkpoint — e.g. `⚡ 140% · 130 → in 01:12 drops to 130%`.
  - **When the timer runs out (T)**: bar fully greyed, readout `⏱ Time's up · base points only · 100 pts`.
- **Live points preview**: the card's point badge updates in real time to the points the team would get if they finished now.
- **Frozen on completion**: once completed, the bar stops and highlights the checkpoint hit (`✅ Done in 11:42 · 140% · 140 pts`), same idea as `bankedBonus` in AitbBonusBar.
- **Grid tile hint** (opened-but-unfinished tiles only): a thin ring/underline on the tile that drains with the countdown, so a team can see at a glance which in-progress cards are still in the bonus window. Tiles not yet opened show no timer.
- **Admin/projector view**: optional small "in progress · mm:ss" on the marshal list; not required for v1.
- Clock source is the team's own `scanned_at`, so it is per-team and survives refresh; display ticks client-side (1s), but the **final points are computed from `completed_at − scanned_at`**, so the display can never disagree with the stored score.

### Defaults and editing (admin)
1. **Board default** (new "Bonus timer" panel in board settings, next to the old scoring-format panel): two inputs, "Full bonus within __ min" (default 10) and "Bonus ends at __ min" (default 25). Saved on `bingo_sections`. Applies to all cards immediately.
2. **Per-card override** (card editor, mirrors the AI-card timer UI ~line 3904): two optional fields pre-showing the board default as placeholder; blank = follow default; a "Reset to board default" link clears the override. Overridden cards get a small badge in the card list so exceptions are easy to spot.
3. Optional later: quick preset buttons (Short 5/12, Standard 10/25, Long 15/40) that fill the board default.

Rationale for 10/25: ~2 h game, 25 boxes, teams work in parallel; your example is the starting point and is easy to tune from one place.

## Rule 3 — One scoring format
- Remove the board's `decimal_points` setting and its admin toggle; `formatScore` always shows whole numbers.
- Remove the hidden `tiebreak` fraction from the score (stop adding it; column can stay unused/ignored). Ranking ties already fall back to: most bingo lines → most boxes → earliest `reachedAt` → name — keep that.
- Duel bonus and facilitator manual bonus stay unchanged (added on top, whole numbers).

## Files to change (high level)
- `src/lib/bingoLines.ts` — rewrite `scoreWithBingoLines`: keep the replay that finds line order, drop `bingoLineMultiplier`/`BINGO_LINE_MULTIPLIER_STEP`; `total = Σ tile points + Σ (100 × n for first 5 lines)`. Tile points now come in already time-adjusted.
- New small helper (e.g. `src/lib/timeBonus.ts`) — `timeBonusMultiplier(elapsedMs, F, T)` + `resolveBonusWindow(task, section)` (card override → board default). Reuse the idea of `aitbSpeedBonus` in `src/lib/aitbActivities.ts`.
- `src/lib/teamScore.ts` — `scoreTeams`: per completed box compute `elapsed` from the team's scan, apply multiplier to `task.points`, pass to `scoreWithBingoLines`; drop `tiebreak`; `formatScore` → integer only.
- `src/types/database.ts` + new Supabase migration — add `bonus_full_minutes`, `bonus_timer_minutes` (nullable = follow board default) on `bingo_tasks`, and the board-wide defaults (`default_bonus_full_minutes` = 10, `default_bonus_timer_minutes` = 25) on `bingo_sections` (follow the pattern of `supabase/aitb/020_aitb_card_timer.sql`); remove `decimal_points` use.
- `src/pages/BingoDashAdmin.tsx` — per-card editor gets the two minute fields + "reset to board default" (mirror the existing AI-card timer UI ~line 3904); new board-default "Bonus timer" panel replacing the decimals toggle (~4227); remove the decimal rounding helper (~2098); the places calling `scoreWithBingoLines` (~4910, ~5707) updated.
- `src/pages/BingoDashSample.tsx` (~2643), `BingoDashProjector.tsx`, `BingoDashAwardSlides.tsx` — drop `decimals` plumbing; use new score. Award ceremony and projector keep sharing `teamScore.ts` so they cannot disagree.
- Player side: generalise `src/components/AitbBonusBar.tsx` into a shared `CardBonusTimer` shown in the opened card (`BingoDashParticipant.tsx`, `BundleMission.tsx`, `BingoDashSample.tsx`), plus the draining ring on in-progress tiles in `BingoTileFace.tsx` / `BingoDashHome.tsx` / `BingoDashJoin.tsx`.

## Open questions for you
1. **AI Team Building cards** currently have their own speed bonus (up to +1000 pts, ×1.0/1.4/1.8 by difficulty, `AITB_POINTS`/`AITB_COMPLETE`). Do they (a) switch to the new 150% model too (simplest, one system), or (b) keep their ladders? Recommendation: (a), so "whole scoring system" is truly one rule.
2. Steps are fixed at 5 checkpoints of −10% (150/140/130/120/110 then base), evenly spaced between F and T. OK, or do you want a different step size / editable checkpoints?
3. Does the timer start when the team **opens/scans** the card (`scanned_at`, recommended), or from game start?
4. Existing finished games: leave history as-is, or re-score with the new rule? (Scores are computed live from scans, so old boards would change retroactively — recommend applying only to new boards or accepting the change.)

## Verification (after we agree and build)
- Unit-style checks of `scoreWithBingoLines` / multiplier: 1 line → +100; 2 lines → +300 total bonus; 6th line → no extra; F/T edge cases (elapsed = F, = T, T ≤ F, no scanned_at).
- In Sample/Admin: complete a 100-pt card at 3 min, 12 min, 17 min, 30 min → 150 / 140 / 120 / 100, and check the checkpoint bar highlights the matching segment.
- Projector and award ceremony show identical whole-number totals for the same board.
- `npx tsc -b` clean; browser check of admin card editor and the player countdown.
