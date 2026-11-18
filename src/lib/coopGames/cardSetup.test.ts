import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveInputs, hasOwnMechanism, isComplete } from '../completionInputs.ts'
import { resolveSavedMember, type SavedCoopMember } from './memberIdentity.ts'

test('None survives save/reload and suppresses legacy answer inputs without completing the card', () => {
  const saved = JSON.parse(JSON.stringify({ none: 'required' }))
  assert.equal(hasOwnMechanism(saved), true)
  for (const type of ['standard', 'answer', 'photo', 'video', 'media']) {
    const inputs = effectiveInputs(type, saved)
    assert.deepEqual(inputs, {})
    assert.equal(isComplete(inputs, {}), false)
  }
  assert.deepEqual(effectiveInputs('answer', {}), { answer: 'required' })
  assert.deepEqual(effectiveInputs('photo', { video: 'auto' }), { video: 'auto' })
})

const member = (id: string, team_id: string, section_id = 'board'): SavedCoopMember => ({ id, team_id, section_id, role: 'player' })
test('restoring a board uses its own saved player instead of another board global player', async () => {
  const rows = [member('local', 'current'), member('global', 'other', 'other-board')]
  const found = await resolveSavedMember(['local', 'global'], 'current', 'board', async id => rows.find(m => m.id === id) ?? null)
  assert.equal(found?.id, 'local')
})
test('a stale global player never enters another team lobby and no other teammate is adopted', async () => {
  const rows = [member('global', 'other'), member('teammate', 'current')]
  const calls: string[] = []
  const found = await resolveSavedMember([null, 'global', 'global'], 'current', 'board', async id => { calls.push(id); return rows.find(m => m.id === id) ?? null })
  assert.equal(found, null)
  assert.deepEqual(calls, ['global'])
})
