// PRD-009 phone bottom bar. Run: npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { barTabs, BAR_SPACER_PX } from './boardBar.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('AC-1/AC-5: player with an invite link gets Invite | Board | Scores, others get Board | Scores', () => {
  assert.deepEqual(barTabs(true), ['invite', 'board', 'scores'])
  assert.deepEqual(barTabs(false), ['board', 'scores'])
  assert.equal(barTabs(true)[1], 'board') // Board is the centre tab
})

test('admin can hide Scores: the tab disappears, Invite and Board stay', () => {
  assert.deepEqual(barTabs(true, false), ['invite', 'board'])
  assert.deepEqual(barTabs(false, false), ['board'])
  assert.deepEqual(barTabs(true, true), ['invite', 'board', 'scores'])
})

test('AC-6: the spacer clears the bar, its lift and the gap', () => {
  assert.ok(BAR_SPACER_PX >= 64 + 8 + 10) // bar height + bottom gap + disc lift
})

test('AC-7/AC-9/AC-10: bar is phone only, under overlays, safe-area aware and replaces the header buttons', () => {
  const bar = src('components/BoardBottomBar.tsx')
  assert.match(bar, /md:hidden fixed/)
  assert.match(bar, /z-40/)
  assert.match(bar, /env\(safe-area-inset-bottom\)/)
  assert.match(bar, /aria-label="Bingo board"/)
  assert.match(bar, /\/icon-192\.png/)
  for (const page of ['pages/BingoDashJoin.tsx', 'pages/BingoDashHome.tsx']) {
    const s = src(page)
    assert.match(s, /<BoardBottomBar /, page)
    assert.match(s, /<BoardBarSpacer \/>/, page)
    assert.match(s, /hidden md:block text-xs font-bold text-teal-300/, `${page}: header Scoreboard hidden on phone`)
    assert.match(s, /<div className="hidden md:block">\s*<MyQrButton/, `${page}: header Invite hidden on phone`)
  }
})

test('AC-2: the bar uses the same observer link as the header button', () => {
  const join = src('pages/BingoDashJoin.tsx')
  assert.match(join, /\?mode=observer&team=\$\{team\.id\}/)
  assert.match(join, /memberRole === 'player' && teamPassword \? observerInviteUrl : null/)
})
