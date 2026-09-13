# Versus answer input — plan (implemented)

Battle cards (Longest Breathe, Paper Scissors Rock!, Tongue Twister) without a
marshal. Versus is a fifth answer input (photo / video / link / text / versus):
the challenging team picks who it battled and whether it won, and that claim is
a submission the admin approves or rejects like a photo. A card ticked
Photo + Versus completes when both are approved. No opponent confirmation, no
new table.

## How it plays

1. Team A opens the card, picks **opponent** (Team B) and **result** (We won /
   We lost).
2. Team A takes **one photo of both teams together** and taps Submit.
3. The submission lands in the admin's Photos tab tagged `⚔ vs Team B · won`.
4. Admin approves → Team A's tile turns green (same cascade as any photo card).
   Rejects → Team A can resubmit.
5. Tokens stay physical — the result is recorded for the admin only.

Rules kept from the original cards:

- Only the challenging team completes the card (the opponent's tile is untouched).
- No rematch: a second submission between the same two teams on the same card
  is blocked on the phone before it is sent (any direction, unless the first
  was rejected).

## Changes

### 1. Database — `supabase/media-photos/043_versus_submissions.sql`

```sql
-- media_type gains 'versus'; two nullable columns on the submission row
alter table public.bingo_photo_submissions
  add column if not exists opponent_id uuid references public.bingo_teams(id) on delete set null,
  add column if not exists versus_won  boolean;
```

All nullable / default false — every existing card and submission behaves as
before.

### 2. Types — `src/types/database.ts`

- `BingoTask.versus?: boolean`
- `BingoPhotoSubmission.opponent_id?: string | null`, `versus_won?: boolean | null`

### 3. Card editor — `src/pages/BingoDashTaskEdit.tsx`

- Toggle **"Versus — team picks opponent and result"** shown when the photo
  input is on. Saves `versus`.

### 4. Participant card — `src/pages/BingoDashParticipant.tsx`

When `task.versus`:

- Above the photo tray: **Opponent** dropdown (teams on this board, minus own)
  and **Result** (We won / We lost) buttons.
- Submit stays disabled until both are chosen.
- Rematch guard: before upload, query `bingo_photo_submissions` for this task
  where `(team_id, opponent_id)` matches either direction and
  `status <> 'rejected'`; if found, show "You've already battled Team B on this
  card" and stop.
- The submission insert carries `opponent_id` and `versus_won`.

### 5. Admin Photos tab — `src/pages/BingoDashAdmin.tsx`

- Each submission card shows `⚔ vs <opponent name> · won/lost` when
  `opponent_id` is set. Approve / Reject unchanged.

### 6. Demo — `src/pages/BingoDashSample.tsx`

- Same opponent + result fields using the sample teams; "Approve as marshal
  (demo)" completes it as now.

### 7. Card content (mall-hunt copies)

Set `task_type = photo`, `completion_inputs = {photo: required}`,
`versus = true`, `require_marshal = false`, and rewrite the six steps, e.g.
Paper Scissors Rock!:

1. Challenge a player from another team.
2. Best of 3 - first to win 2 rounds wins.
3. Winner takes 1 token from the loser.
4. In the app, pick the team you battled and whether you won or lost.
5. Add one photo of both teams together and submit.
6. Admin approves it. Only the team that started the challenge submits.

### 8. Verification

- Browser as a team: submit with opponent + result → row has both fields.
- Same pair again → blocked. Different opponent → allowed.
- Admin tab shows the versus tag (needs an admin login).
- Demo flow end to end.

## Estimate

| | |
|---|---|
| Wall-clock | ~1–1.5 h |
| Tokens | ~150–250k |
| Migrations to run | 1 (`043_versus.sql`) |
| Files touched | 6 |
