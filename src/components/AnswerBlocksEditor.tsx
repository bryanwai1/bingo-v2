import { newBlock, type AnswerBlock, type AnswerBlockKind } from '../lib/answerBlocks'

/**
 * Admin editor for a card's typed-answer questions. Each block is a Question
 * plus either an exact Answer or a Minimum number; "+ Add question" appends
 * another. The card passes when every block is answered correctly.
 */
export function AnswerBlocksEditor({
  blocks, onChange,
}: {
  blocks: AnswerBlock[]
  onChange: (next: AnswerBlock[]) => void
}) {
  const update = (id: string, patch: Partial<AnswerBlock>) =>
    onChange(blocks.map(b => (b.id === id ? { ...b, ...patch } : b)))
  const remove = (id: string) => onChange(blocks.filter(b => b.id !== id))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  const kinds: { value: AnswerBlockKind; label: string }[] = [
    { value: 'text', label: 'Text answer' },
    { value: 'number', label: 'Minimum number' },
  ]
  const field = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500'

  return (
    <div className="flex flex-col gap-3 mb-5">
      {blocks.length === 0 && (
        <p className="text-xs text-gray-500 rounded-lg bg-gray-50 border border-dashed border-gray-300 px-3 py-4 text-center">
          No questions yet. With none, the team writes free text that you approve like a photo.
        </p>
      )}

      {blocks.map((b, i) => (
        <div key={b.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-violet-600">Question {i + 1}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                className="w-7 h-7 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Move down"
                className="w-7 h-7 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30">↓</button>
              <button type="button" onClick={() => remove(b.id)} aria-label={`Remove question ${i + 1}`}
                className="w-7 h-7 rounded text-red-400 hover:bg-red-50 font-bold">✕</button>
            </div>
          </div>

          <label className="block text-xs font-semibold text-gray-600 mb-1">Question</label>
          <input
            type="text" value={b.question}
            onChange={e => update(b.id, { question: e.target.value })}
            placeholder="e.g. What are Grab's 4H values?"
            className={`${field} mb-3`}
          />

          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden mb-3" role="group" aria-label="Answer type">
            {kinds.map(k => (
              <button
                key={k.value} type="button"
                onClick={() => update(b.id, { kind: k.value })}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                  b.kind === k.value ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {b.kind === 'text' ? (
            <>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Answer</label>
              <input
                type="text" value={b.answer}
                onChange={e => update(b.id, { answer: e.target.value })}
                placeholder="The exact answer (capitals and spaces are ignored)"
                className={field}
              />
            </>
          ) : (
            <>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Minimum number</label>
              <input
                type="number" min={0} value={b.min ?? ''}
                onChange={e => update(b.id, { min: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })}
                placeholder="e.g. 18000 - passes when the team's number is at least this"
                className={field}
              />
            </>
          )}
        </div>
      ))}

      <button
        type="button" onClick={() => onChange([...blocks, newBlock()])}
        className="w-full py-2.5 rounded-xl border-2 border-dashed border-violet-300 text-violet-600 text-sm font-bold hover:bg-violet-50 transition-colors"
      >
        + Add question
      </button>
    </div>
  )
}
