import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHelp, telHref, waHref, tidyHelp, hasHelp, usableContacts, MAX_CONTACTS, MAX_PIN } from './helpInfo.ts'

test('normalize survives junk and bounds the data', () => {
  assert.deepEqual(normalizeHelp(null).contacts, [])
  const h = normalizeHelp({ contacts: Array.from({ length: 9 }, () => ({ name: 'A', phone: '012' })), pin: 'x'.repeat(999) })
  assert.equal(h.contacts.length, MAX_CONTACTS)
  assert.equal(h.pin.length, MAX_PIN)
  assert.equal(normalizeHelp({ show: false }).show, false)
})

test('phone links', () => {
  assert.equal(telHref('012-345 6789'), 'tel:0123456789')
  assert.equal(telHref('+60 12-345 6789'), 'tel:+60123456789')
  assert.equal(waHref('012-345 6789'), 'https://wa.me/60123456789')
  assert.equal(waHref('+65 9123 4567'), 'https://wa.me/6591234567')
  assert.equal(waHref('0123456789', 'Help'), 'https://wa.me/60123456789?text=Help')
})

test('hasHelp needs a pin or a usable number, and show on', () => {
  assert.equal(hasHelp(normalizeHelp({})), false)
  assert.equal(hasHelp(normalizeHelp({ pin: 'Meet at 3' })), true)
  assert.equal(hasHelp(normalizeHelp({ contacts: [{ name: 'A', phone: '12' }] })), false)
  assert.equal(usableContacts(normalizeHelp({ contacts: [{ name: 'A', phone: '0123456789' }] })).length, 1)
  assert.equal(hasHelp(normalizeHelp({ pin: 'x', show: false })), false)
})

test('tidy drops empties', () => {
  assert.equal(tidyHelp(normalizeHelp({ contacts: [{ name: '', phone: '' }] })), null)
  assert.equal(tidyHelp(normalizeHelp({ pin: 'hi' }))?.pin, 'hi')
})
