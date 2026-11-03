// QA addition for PRD-005 AC-5 / AC-10: renders the real Icon Matching View to HTML (react-dom/server) and
// checks what each role is shown. No new dependency: typescript and react-dom are already installed.
// The .tsx file is transpiled to a sibling temp .mjs (node cannot strip JSX), imported, then deleted.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { createIconMatching, type IconState } from './iconMatchingLogic.ts'

const srcUrl = new URL('./iconMatching.tsx', import.meta.url)
const tmpUrl = new URL('./.qa-iconMatching.gen.mjs', import.meta.url)
const js = ts.transpileModule(readFileSync(srcUrl, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
writeFileSync(tmpUrl, js)
const mod = await import(tmpUrl.href)
rmSync(tmpUrl)
const View = mod.iconMatching.View as (p: Record<string, unknown>) => unknown

const p = createIconMatching()
const render = (state: IconState, props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(View as never, { state, dispatch: () => {}, ...props }))

const s0 = p.initState()
const a = 0
const b = s0.cards.findIndex((c, i) => i > 0 && c !== s0.cards[0])
const m = s0.cards.findIndex((c, i) => i > 0 && c === s0.cards[0])
const states: Record<string, IconState> = {
  facedown: s0,
  oneFlipped: p.reduce(s0, { type: 'flip', index: a }),
  missFlipped: p.reduce(p.reduce(s0, { type: 'flip', index: a }), { type: 'flip', index: b }),
  matched: p.reduce(p.reduce(s0, { type: 'flip', index: a }), { type: 'flip', index: m }),
}

test('AC-5 (rendered): the player never gets an icon image or icon id, in any state or while busy', () => {
  for (const [name, st] of Object.entries(states)) {
    for (const canAct of [true, false]) {
      const html = render(st, { isPlayer: true, canAct })
      assert.ok(!/<img/i.test(html), `${name}/canAct=${canAct}: player screen has an <img>`)
      assert.ok(!/icon-\d\d/.test(html), `${name}/canAct=${canAct}: player screen mentions an icon id`)
    }
  }
})

test('AC-5 (fail closed): without the isPlayer prop, a busy screen still shows no icon', () => {
  assert.ok(!/<img/i.test(render(states.missFlipped, { canAct: false })))
})

test('AC-4 (rendered): observers see the icon and position label of flipped and matched cards only', () => {
  const miss = render(states.missFlipped, { isPlayer: false, canAct: false })
  const imgs = miss.match(/<img[^>]*src="([^"]+)"/g) ?? []
  assert.equal(imgs.length, 2)
  assert.ok(miss.includes(`/grab/icons/${s0.cards[a]}.png`) && miss.includes(`/grab/icons/${s0.cards[b]}.png`))
  assert.ok(miss.includes('aria-label="A1, flipped"'))
  assert.equal((render(states.facedown, { isPlayer: false, canAct: false }).match(/<img/g) ?? []).length, 0)
  assert.equal((render(states.matched, { isPlayer: false, canAct: false }).match(/<img/g) ?? []).length, 2)
})

test('AC-6/7 (rendered): the player is told match / no match in words', () => {
  assert.ok(render(states.matched, { isPlayer: true, canAct: true }).includes('It is a match!'))
  assert.ok(render(states.missFlipped, { isPlayer: true, canAct: true }).includes('No match'))
})

test('AC-3 (solve): a 2x2 board is solved only when both pairs are matched', () => {
  const q = createIconMatching({ rows: 2, cols: 2 })
  let s = q.initState()
  const pair = (icon: string) => s.cards.map((c, i) => [c, i] as const).filter(([c]) => c === icon).map(([, i]) => i)
  assert.ok(!q.isSolved(s))
  const [i1] = [...new Set(s.cards)]
  const [x, y] = pair(i1)
  s = q.reduce(q.reduce(s, { type: 'flip', index: x }), { type: 'flip', index: y })
  assert.ok(!q.isSolved(s), 'one of two pairs is not solved')
  const rest = s.cards.map((_, i) => i).filter(i => !s.matched.includes(i))
  s = q.reduce(q.reduce(s, { type: 'flip', index: rest[0] }), { type: 'flip', index: rest[1] })
  assert.ok(q.isSolved(s))
})
