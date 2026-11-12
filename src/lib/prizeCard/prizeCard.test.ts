// PRD-008 prize card: client logic. Run: npm test.
// The server rules (AC-3, AC-4, AC-8, AC-11, AC-12 on the real database) are in
// supabase/prize-card/prize_card.test.sql; prizeSql.test.ts checks the migration text.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PRIZE_SLOT_MIN, isGridSlot, nextPrizeSlot, completedGridCount, stripState, parseClaimResult,
  tooLateText, claimedByText, bandState, POPUP_MS, type Claim,
  canAddPrize, prizeFlagLocked, safeMapsUrl, clampThreshold, mapsUrlError, cleanPrizeSecrets,
} from './logic.ts'

const place = (id: string, task_id: string, slot: number) => ({ id, task_id, slot })
const scan = (task_id: string, board_card_id: string | null, completed: boolean) => ({ task_id, board_card_id, completed })
const claim = (over: Partial<Claim> = {}): Claim => ({
  id: 'c1', board_card_id: 'bc-prize', team_id: 'tA', team_name: 'Team Pelandok', claimed_at: '2026-11-12T10:00:00Z', ...over,
})

test('AC-1: below the threshold the strip is locked and shows n / threshold', () => {
  assert.deepEqual(stripState({ count: 12, threshold: 20, claim: null, teamId: 'tA', role: 'player' }),
    { kind: 'locked', count: 12, threshold: 20 })
})

test('AC-2: at or above the threshold and unclaimed, a player can claim', () => {
  assert.deepEqual(stripState({ count: 20, threshold: 20, claim: null, teamId: 'tA', role: 'player' }), { kind: 'claimable', canClaim: true })
  assert.deepEqual(stripState({ count: 25, threshold: 20, claim: null, teamId: 'tA', role: 'player' }), { kind: 'claimable', canClaim: true })
})

test('AC-9: an observer sees the claimable strip but cannot claim', () => {
  assert.deepEqual(stripState({ count: 20, threshold: 20, claim: null, teamId: 'tA', role: 'observer' }), { kind: 'claimable', canClaim: false })
})

test('AC-5: once another team has claimed, the strip says who and cannot be opened', () => {
  const s = stripState({ count: 3, threshold: 20, claim: claim({ team_id: 'tB', team_name: 'Team Kancil' }), teamId: 'tA', role: 'player' })
  assert.deepEqual(s, { kind: 'lost', winner: 'Team Kancil' })
  assert.equal(claimedByText('Team Kancil'), 'Team Kancil has claimed this card')
})

test('AC-6/AC-9: the winning team (player or observer) gets the won strip', () => {
  for (const role of ['player', 'observer'] as const) {
    assert.deepEqual(stripState({ count: 20, threshold: 20, claim: claim(), teamId: 'tA', role }), { kind: 'won', winner: 'Team Pelandok' })
  }
})

test('AC-11: after Reset claim (claim gone) each team returns to locked or claimable by its own count', () => {
  assert.equal(stripState({ count: 5, threshold: 20, claim: null, teamId: 'tB', role: 'player' }).kind, 'locked')
  assert.equal(stripState({ count: 21, threshold: 20, claim: null, teamId: 'tA', role: 'player' }).kind, 'claimable')
})

test('AC-3/AC-4: a lost race and a refused stale claim read the same, without an error', () => {
  assert.equal(tooLateText('Team Kancil'), 'Too late, Team Kancil got it first')
  assert.deepEqual(parseClaimResult({ ok: false, reason: 'taken', winner: 'Team Kancil' }), { ok: false, winner: 'Team Kancil' })
  assert.deepEqual(parseClaimResult({ ok: false, reason: 'not_eligible' }), { ok: false, winner: null })
  assert.equal(tooLateText(null), 'Too late, another group got it first')
  assert.deepEqual(parseClaimResult({ ok: true }), { ok: true })
})

test('AC-3: an unreadable server reply is not treated as a win', () => {
  assert.deepEqual(parseClaimResult(null), { ok: false, winner: null })
  assert.deepEqual(parseClaimResult('boom'), { ok: false, winner: null })
})

test('AC-8: only completed grid placements count; pending, submitted and the prize itself do not', () => {
  const placements = [place('p0', 't0', 0), place('p1', 't1', 1), place('p2', 't2', 2), place('p3', 't3', 3), place('px', 'tp', 200)]
  const scans = [
    scan('t0', 'p0', true),   // completed
    scan('t1', 'p1', false),  // submitted / pending / awaiting approval
    scan('t2', null, true),   // legacy scan with no box, matches by card
    scan('tp', 'px', true),   // the prize card itself
  ]
  assert.equal(completedGridCount(placements, scans), 2)
})

test('AC-8: a card in two boxes counts once per completed box, not per scan', () => {
  const placements = [place('p0', 'tA', 0), place('p1', 'tA', 1)]
  assert.equal(completedGridCount(placements, [scan('tA', 'p0', true), scan('tA', 'p0', true)]), 1)
})

test('AC-15: prize placements live on reserved slots and are never grid slots', () => {
  assert.equal(PRIZE_SLOT_MIN, 200)
  assert.equal(isGridSlot(24), true)
  assert.equal(isGridSlot(149), true)
  assert.equal(isGridSlot(200), false)
  assert.equal(isGridSlot(209), false)
})

test('AC-12/AC-13: each prize card takes the first free reserved slot; ten at most', () => {
  assert.equal(nextPrizeSlot([]), 200)
  assert.equal(nextPrizeSlot([200, 202]), 201)
  assert.equal(nextPrizeSlot([0, 1, 200]), 201)
  assert.equal(nextPrizeSlot([200, 201, 202, 203, 204, 205, 206, 207, 208, 209]), null)
})

test('AC-13: two prize cards keep separate claims by placement id', () => {
  const c = claim({ board_card_id: 'bc-2', team_id: 'tB', team_name: 'Team Kancil' })
  assert.equal(stripState({ count: 20, threshold: 20, claim: undefined, teamId: 'tA', role: 'player' }).kind, 'claimable')
  assert.equal(stripState({ count: 20, threshold: 20, claim: c, teamId: 'tA', role: 'player' }).kind, 'lost')
})

// ---- AC-14: projector popup then persistent line ------------------------------

test('AC-14: before any claim the band shows nothing', () => {
  assert.deepEqual(bandState([], {}, 0), { popup: null, lines: [] })
})

test('AC-14: a claim seen now is a popup for 5 s, then a persistent line', () => {
  const c = claim()
  assert.equal(POPUP_MS, 5000)
  assert.deepEqual(bandState([c], { c1: 1000 }, 1000), { popup: c, lines: [] })
  assert.deepEqual(bandState([c], { c1: 1000 }, 5999), { popup: c, lines: [] })
  assert.deepEqual(bandState([c], { c1: 1000 }, 6000), { popup: null, lines: [c] })
  assert.deepEqual(bandState([c], { c1: 1000 }, 3_600_000), { popup: null, lines: [c] })
})

test('AC-14: a claim already there when the projector opened is a line at once, with no popup', () => {
  const c = claim()
  assert.deepEqual(bandState([c], { c1: null }, 10), { popup: null, lines: [c] })
})

test('AC-14: two claims within 5 s pop up one after the other, never both at once', () => {
  const a = claim({ id: 'a', team_name: 'A', claimed_at: '2026-11-12T10:00:00Z' })
  const b = claim({ id: 'b', team_name: 'B', claimed_at: '2026-11-12T10:00:02Z' })
  const seen = { a: 0, b: 2000 }
  assert.deepEqual(bandState([a, b], seen, 3000), { popup: a, lines: [] })
  // b waits for a's popup to finish (5000), then shows 5000..10000
  assert.deepEqual(bandState([a, b], seen, 5000), { popup: b, lines: [a] })
  assert.deepEqual(bandState([a, b], seen, 10000), { popup: null, lines: [a, b] })
})

test('AC-14: Reset claim removes the line', () => {
  assert.deepEqual(bandState([], { c1: null }, 99), { popup: null, lines: [] })
})

// ---- Fix round 1 -----------------------------------------------------------------

test('fix 1: the same prize card cannot be placed twice on one board (other boards are fine)', () => {
  const cards = [{ section_id: 's1', task_id: 'tp', slot: 200 }, { section_id: 's1', task_id: 'g', slot: 0 }]
  assert.equal(canAddPrize(cards, 's1', ['tp']), false)
  assert.equal(canAddPrize(cards, 's2', ['tp']), true)
  assert.equal(canAddPrize(cards, 's1', ['other']), true)
  assert.equal(canAddPrize(cards, 's1', ['copy', 'tp']), false, 'either the card or its board copy counts')
})

test('fix 1: the Prize card checkbox is locked only while the card is on a board; remove unlocks it', () => {
  assert.equal(prizeFlagLocked(1), true)
  assert.equal(prizeFlagLocked(0), false)
  assert.equal(prizeFlagLocked(null), false)
})

test('fix 2: the Maps button only ever opens http or https', () => {
  assert.equal(safeMapsUrl('maps.app.goo.gl/abc'), 'https://maps.app.goo.gl/abc')
  assert.equal(safeMapsUrl('http://x.test/a'), 'http://x.test/a')
  assert.equal(safeMapsUrl('javascript:alert(1)'), null)
  assert.equal(safeMapsUrl('data:text/html,hi'), null)
  assert.equal(safeMapsUrl('  '), null)
})

test('AC-10: admin fields: threshold is a whole number of at least 1, Maps URL is validated, empty text is stored as null', () => {
  assert.equal(clampThreshold('25'), 25)
  assert.equal(clampThreshold('0'), 1)
  assert.equal(clampThreshold('abc'), 1)
  assert.equal(clampThreshold('7.9'), 7)
  assert.equal(mapsUrlError('https://maps.app.goo.gl/abc'), '')
  assert.equal(mapsUrlError(''), '')
  assert.match(mapsUrlError('javascript:alert(1)'), /link/)
  assert.match(mapsUrlError('not a link'), /link/)
  assert.deepEqual(cleanPrizeSecrets({ message: ' Well done ', marshal_name: '', location_text: ' ', maps_url: 'https://x.test', maps_label: '' }),
    { message: 'Well done', marshal_name: null, location_text: null, maps_url: 'https://x.test', maps_label: null })
})

test('fix 3: a team that already holds the claim is never told "Too late, <own team>"', () => {
  assert.deepEqual(parseClaimResult({ ok: true }), { ok: true })
  assert.equal(stripState({ count: 20, threshold: 20, claim: claim(), teamId: 'tA', role: 'player' }).kind, 'won')
})

test('AC-14: the message reads "<Group> claimed the prize"', async () => {
  const { projectorText } = await import('./logic.ts')
  assert.equal(projectorText('Team Pelandok'), 'Team Pelandok claimed the prize')
})
