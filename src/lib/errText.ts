/**
 * Readable text from a thrown value.
 *
 * Supabase returns a PostgrestError — a PLAIN OBJECT, not an Error instance —
 * so the common `err instanceof Error ? err.message : 'Something failed'`
 * pattern silently discards the real reason and leaves only a generic string.
 *
 * That is not a cosmetic problem. It hid two live faults in this app: a crew
 * pass that could not be created because `create_facilitator_session` was
 * never applied to the database, and "Give default board" failing because
 * `admin_clone_template_for` was missing. Both looked like dead buttons.
 *
 * PostgREST puts useful detail in `details` and `hint` (including the
 * "reload the schema cache" advice for a missing function) and an error class
 * in `code`, so all of them are surfaced rather than just `message`.
 */
export function errText(err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string; code?: string }
    const parts = [e.message, e.details, e.hint].filter(Boolean)
    if (parts.length) return `${parts.join(' — ')}${e.code ? ` (${e.code})` : ''}`
  }
  return 'Unknown error'
}
