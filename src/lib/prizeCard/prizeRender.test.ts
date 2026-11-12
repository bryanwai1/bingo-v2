// PRD-008 rendered screens (react-dom/server). The .tsx files are transpiled to a
// sibling temp .mjs (node cannot strip JSX), imported, then deleted: the same
// technique as coopGames/iconMatchingRender.test.ts, no new dependency.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

async function load(name: string) {
  const js = ts.transpileModule(readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const tmp = new URL(`./.gen-${name}.mjs`, import.meta.url)
  writeFileSync(tmp, js)
  try { return await import(tmp.href) } finally { rmSync(tmp) }
}
const { PrizeStrip } = await load('PrizeStrip')
const { ProjectorPrizeBand } = await load('ProjectorPrizeBand')
const { PrizeReveal } = await load('PrizeReveal')

const strip = (state: unknown, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(PrizeStrip as never, { state, theme: 'default', busy: false, message: null, onClaim: () => {}, onOpen: () => {}, ...extra }))

test('AC-1: locked strip shows "n / threshold cards" and has no button or link', () => {
  const html = strip({ kind: 'locked', count: 12, threshold: 20 })
  assert.match(html, /12 \/ 20 cards/)
  assert.ok(!/<button/.test(html), 'locked strip must not be tappable')
})

test('AC-2: claimable strip has a CLAIM button; busy disables it', () => {
  const html = strip({ kind: 'claimable', canClaim: true })
  assert.match(html, /<button[^>]*>[\s\S]*CLAIM/)
  assert.match(strip({ kind: 'claimable', canClaim: true }, { busy: true }), /disabled/)
})

test('AC-9: an observer sees no CLAIM button, only a view-only note', () => {
  const html = strip({ kind: 'claimable', canClaim: false })
  assert.ok(!/CLAIM/.test(html.replace(/View only/g, '')))
  assert.match(html, /View only/)
})

test('AC-3/AC-4: the too-late message shows as a status line, not an error', () => {
  const html = strip({ kind: 'claimable', canClaim: true }, { message: 'Too late, Team Kancil got it first' })
  assert.match(html, /role="status"[^>]*>Too late, Team Kancil got it first/)
})

test('AC-5: a lost strip says who claimed it and is not tappable', () => {
  const html = strip({ kind: 'lost', winner: 'Team Kancil' })
  assert.match(html, /Team Kancil has claimed this card/)
  assert.ok(!/<button/.test(html))
})

test('AC-6: the won strip is one button that opens the reveal page', () => {
  const html = strip({ kind: 'won', winner: 'Team Pelandok' })
  assert.match(html, /^<button/)
})

test('AC-13: each strip renders its own title', () => {
  assert.match(strip({ kind: 'locked', count: 1, threshold: 5 }, { title: 'Treasure two' }), /Treasure two/)
})

const reveal = (over: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(PrizeReveal as never, {
  theme: 'default', status: 'ready', onBack: () => {}, onRetry: () => {}, eventEnded: false,
  data: { title: 'Prize', message: 'Well done team', marshal_name: 'Encik Ali', location_text: 'Jonker Walk stall 4', maps_url: 'maps.app.goo.gl/abc', maps_label: 'Open in Google Maps' },
  photos: [{ id: 'p1', photo_url: 'https://x/1.jpg', caption: null, position_x: 50, position_y: 50 }, { id: 'p2', photo_url: 'https://x/2.jpg', caption: null, position_x: 50, position_y: 50 }],
  winner: 'Team Pelandok', claimedAt: '2026-11-12T10:00:00Z', ...over,
}))

test('AC-6: reveal shows hero, Congratulations, text, marshal, location and a Maps button that opens the URL', () => {
  const html = reveal()
  assert.match(html, /Congratulations!/)
  assert.match(html, /Well done team/)
  assert.match(html, /Encik Ali/)
  assert.match(html, /Jonker Walk stall 4/)
  assert.match(html, /<a [^>]*href="https:\/\/maps\.app\.goo\.gl\/abc"[^>]*target="_blank"/)
  assert.match(html, /Open in Google Maps/)
  assert.match(html, /<img [^>]*src="https:\/\/x\/1\.jpg"/)
})

test('fix 2: a javascript: Maps URL gives no button', () => {
  const html = reveal({ data: { title: 'P', message: 'm', marshal_name: 'A', location_text: 'B', maps_url: 'javascript:alert(1)', maps_label: null } })
  assert.ok(!/<a /.test(html) && !/javascript:/.test(html))
})

test('AC-6: with several hero photos the reveal shows one dot per photo; with one, none', () => {
  assert.equal((reveal().match(/data-dot/g) ?? []).length, 2)
  assert.equal((reveal({ photos: [{ id: 'p1', photo_url: 'https://x/1.jpg', caption: null, position_x: 50, position_y: 50 }] }).match(/data-dot/g) ?? []).length, 0)
})

test('AC-7: after the event the reveal still renders, with a one-line note', () => {
  assert.match(reveal({ eventEnded: true }), /event has ended/i)
})

test('Reveal error state offers TRY AGAIN and a way back', () => {
  const html = reveal({ status: 'error', data: null })
  assert.match(html, /TRY AGAIN/)
  assert.match(html, /Back to board/)
})

test('UI: confetti and the halo are CSS-only and switched off by reduced motion', () => {
  const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*prz-confetti/)
})

const claim = (id: string, team_name: string, claimed_at: string) => ({ id, board_card_id: 'b', team_id: id, team_name, claimed_at })
const band = (claims: unknown[], seenAt: Record<string, number | null>, now: number) =>
  renderToStaticMarkup(createElement(ProjectorPrizeBand as never, { claims, seenAt, now, theme: 'default' }))

test('AC-14: before a claim the projector band renders nothing', () => {
  assert.equal(band([], {}, 0), '')
})

test('AC-14: a fresh claim is a 5 s popup, then a persistent line under the scoreboard', () => {
  const c = [claim('a', 'Team Pelandok', '2026-11-12T10:00:00Z')]
  const popup = band(c, { a: 0 }, 1000)
  assert.match(popup, /data-prize-popup/)
  assert.match(popup.replace(/<[^>]+>/g, ''), /Team Pelandok claimed the prize/)
  const line = band(c, { a: 0 }, 5000)
  assert.ok(!/data-prize-popup/.test(line))
  assert.match(line, /data-prize-line/)
  assert.match(line.replace(/<[^>]+>/g, ''), /Team Pelandok claimed the prize/)
})

test('AC-14: the band is in normal flow (never absolute/fixed), so it cannot overlap the scoreboard rows', () => {
  const html = band([claim('a', 'T', '2026-11-12T10:00:00Z')], { a: null }, 0)
  assert.ok(!/position:\s*(absolute|fixed)|\babsolute\b|\bfixed\b/.test(html))
})

test('AC-14: the team name truncates but "claimed the prize" does not', () => {
  const html = band([claim('a', 'A very long team name', '2026-11-12T10:00:00Z')], { a: null }, 0)
  assert.match(html, /truncate[^>]*>A very long team name<\/span><span[^>]*shrink-0[^>]*> claimed the prize/)
})
