// Typed-answer questions on a card. Stored in bingo_tasks.answer_blocks and
// checked in Postgres by check_answer_blocks (supabase/core-tables/20261006_answer_blocks.sql).
// A card with no blocks keeps the older single question / answer / minimum.

export type AnswerBlockKind = 'text' | 'number'

export type AnswerBlock = {
  id: string
  question: string
  kind: AnswerBlockKind
  /** kind 'text': the exact answer (case and spaces ignored). */
  answer: string
  /** kind 'number': the team's number must be at least this. */
  min: number | null
}

export function newBlock(kind: AnswerBlockKind = 'text'): AnswerBlock {
  return { id: crypto.randomUUID(), question: '', kind, answer: '', min: null }
}

/** Read the column defensively: anything malformed is dropped. */
export function parseAnswerBlocks(raw: unknown): AnswerBlock[] {
  if (!Array.isArray(raw)) return []
  const out: AnswerBlock[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const kind: AnswerBlockKind = o.kind === 'number' ? 'number' : 'text'
    const min = typeof o.min === 'number' && Number.isFinite(o.min) ? o.min : null
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : crypto.randomUUID(),
      question: typeof o.question === 'string' ? o.question : '',
      kind,
      answer: typeof o.answer === 'string' ? o.answer : '',
      min,
    })
  }
  return out
}

/** A block the server can actually check. */
export function isBlockComplete(b: AnswerBlock): boolean {
  return b.kind === 'number' ? b.min != null : b.answer.trim() !== ''
}

/**
 * What an old single-question card looks like as blocks, so the editor can
 * open it: a minimum number becomes one number block; answer lines become one
 * text block per line, the first carrying the question.
 */
export function blocksFromLegacy(
  question: string | null | undefined, text: string | null | undefined, min: number | null | undefined,
): AnswerBlock[] {
  const q = (question ?? '').trim()
  if (min != null) return [{ ...newBlock('number'), question: q, min }]
  const lines = (text ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  return lines.map((answer, i) => ({ ...newBlock('text'), question: i === 0 ? q : '', answer }))
}
