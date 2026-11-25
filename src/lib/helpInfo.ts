/** Emergency contacts and a pinned message, shown at the top of the help chat. */

export type HelpContact = { label: string; name: string; phone: string; whatsapp: boolean }
export type HelpInfo = { show: boolean; contacts: HelpContact[]; pin: string; pinAt: string | null }

export const MAX_CONTACTS = 3
export const MAX_PIN = 300

export const EMPTY_HELP: HelpInfo = { show: true, contacts: [], pin: '', pinAt: null }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Accept whatever the database holds and always return a safe, bounded value. */
export function normalizeHelp(raw: unknown): HelpInfo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const contacts = (Array.isArray(r.contacts) ? r.contacts : []).slice(0, MAX_CONTACTS).map(c => {
    const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
    return { label: str(o.label, 30), name: str(o.name, 60), phone: str(o.phone, 30), whatsapp: o.whatsapp === true }
  })
  return {
    show: r.show !== false,
    contacts,
    pin: str(r.pin, MAX_PIN),
    pinAt: typeof r.pinAt === 'string' ? r.pinAt : null,
  }
}

/** Contacts a player can actually use (a number is required). */
export const usableContacts = (h: HelpInfo) => h.contacts.filter(c => digits(c.phone).length >= 6)

/** True when the chat has something to show above the messages. */
export const hasHelp = (h: HelpInfo) => h.show && (!!h.pin || usableContacts(h).length > 0)

const digits = (p: string) => p.replace(/\D/g, '')

/** tel: link. Keeps a leading + so international numbers dial correctly. */
export function telHref(phone: string): string {
  const d = digits(phone)
  return `tel:${phone.trim().startsWith('+') ? '+' : ''}${d}`
}

/** wa.me link. A local Malaysian number (leading 0) becomes +60. */
export function waHref(phone: string, text?: string): string {
  let d = digits(phone)
  if (!phone.trim().startsWith('+') && d.startsWith('0')) d = '60' + d.slice(1)
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/** What gets saved: null when there is nothing to keep. */
export function tidyHelp(h: HelpInfo): HelpInfo | null {
  const n = normalizeHelp(h)
  n.contacts = n.contacts.filter(c => c.name || c.phone || c.label)
  return n.contacts.length || n.pin ? n : null
}
