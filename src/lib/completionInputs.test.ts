import test from 'node:test'
import assert from 'node:assert/strict'
import { submittedAt } from './completionInputs.ts'

test('one required photo: stops when it was sent, pending or not', () => {
  assert.equal(submittedAt({ photo: 'required' }, { photo: 1000 }), 1000)
})

test('nothing sent yet: not submitted', () => {
  assert.equal(submittedAt({ photo: 'required' }, {}), null)
})

test('photo + video both required: stops at the LAST one sent', () => {
  assert.equal(submittedAt({ photo: 'required', video: 'required' }, { photo: 1000, video: 5000 }), 5000)
  assert.equal(submittedAt({ photo: 'required', video: 'required' }, { photo: 1000 }), null)
})

test('either-or inputs: stops at the first one sent', () => {
  assert.equal(submittedAt({ photo: 'optional', video: 'optional' }, { video: 7000, photo: 3000 }), 3000)
})

test('an accepted answer (time 0) does not delay a required photo', () => {
  assert.equal(submittedAt({ answer: 'required', photo: 'required' }, { answer: 0, photo: 4000 }), 4000)
})

test('inputs the card does not use are ignored', () => {
  assert.equal(submittedAt({ photo: 'required' }, { link: 100 }), null)
})
