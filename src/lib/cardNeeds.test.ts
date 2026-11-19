import test from 'node:test'
import assert from 'node:assert/strict'
import { peopleLabel, hasNeeds } from './cardNeeds.ts'

const n = (o: object) => ({ players_min: null, players_max: null, players_whole_team: false, play_location: null, ...o })

test('people label: exact, range, whole team, none', () => {
  assert.equal(peopleLabel(n({ players_min: 2 })), '2')
  assert.equal(peopleLabel(n({ players_min: 2, players_max: 4 })), '2–4')
  assert.equal(peopleLabel(n({ players_min: 3, players_max: 3 })), '3')
  assert.equal(peopleLabel(n({ players_whole_team: true, players_min: 2 })), 'Whole team')
  assert.equal(peopleLabel(n({})), null)
  assert.equal(peopleLabel(n({ players_max: 4 })), null)
})

test('hasNeeds: true for people or a non-blank place, false otherwise', () => {
  assert.equal(hasNeeds(n({})), false)
  assert.equal(hasNeeds(n({ play_location: '   ' })), false)
  assert.equal(hasNeeds(n({ play_location: 'Lobby' })), true)
  assert.equal(hasNeeds(n({ players_whole_team: true })), true)
})
