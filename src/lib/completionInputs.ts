// What a card asks a team for, and when that adds up to "done".
//
// A card can collect any mix of a photo, a clip and a typed answer, each marked
// compulsory or optional. Marshal is deliberately not in the set — a password
// is a person vouching for the whole card, not one input among several — and
// nor are the cards with their own flow (sign_splice, breakout_hunt).

export const INPUT_KINDS = ['photo', 'video', 'answer'] as const
export type InputKind = (typeof INPUT_KINDS)[number]

export type InputRule = 'required' | 'optional'
export type CompletionInputs = Partial<Record<InputKind, InputRule>>

export const INPUT_LABELS: Record<InputKind, { label: string; emoji: string }> = {
  photo: { label: 'Photo', emoji: '📸' },
  video: { label: 'Video', emoji: '🎬' },
  answer: { label: 'Text', emoji: '✏️' },
}

/** Read the column, ignoring anything that isn't a kind the app knows. */
export function parseInputs(raw: unknown): CompletionInputs {
  if (!raw || typeof raw !== 'object') return {}
  const out: CompletionInputs = {}
  for (const kind of INPUT_KINDS) {
    const rule = (raw as Record<string, unknown>)[kind]
    if (rule === 'required' || rule === 'optional') out[kind] = rule
  }
  return out
}

/**
 * What a card collects, falling back to its task_type.
 *
 * A card that predates the combination model — or one whose column was never
 * backfilled — still has an empty map, and must keep behaving exactly as its
 * old exclusive type did.
 */
export function effectiveInputs(taskType: string | null | undefined, raw: unknown): CompletionInputs {
  const parsed = parseInputs(raw)
  if (inputKinds(parsed).length > 0) return parsed
  switch (taskType) {
    case 'photo':  return { photo: 'required' }
    case 'video':  return { video: 'required' }
    case 'answer': return { answer: 'required' }
    // 'media' was "a photo or a clip" — both offered, either one enough.
    case 'media':  return { photo: 'optional', video: 'optional' }
    default:       return {}
  }
}

export function inputKinds(inputs: CompletionInputs): InputKind[] {
  return INPUT_KINDS.filter(k => inputs[k])
}

/** True once a card has been moved onto the combination model. */
export function usesInputs(inputs: CompletionInputs): boolean {
  return inputKinds(inputs).length > 0
}

/** Whether the card collects files at all, and of which sort. */
export function fileAccept(inputs: CompletionInputs): string | null {
  const photo = !!inputs.photo
  const video = !!inputs.video
  if (photo && video) return 'image/*,video/*'
  if (video) return 'video/*'
  if (photo) return 'image/*'
  return null
}

export function fileNoun(inputs: CompletionInputs, plural = false): string {
  const photo = !!inputs.photo
  const video = !!inputs.video
  if (photo && video) return plural ? 'files' : 'photo or video'
  if (video) return plural ? 'videos' : 'video'
  return plural ? 'photos' : 'photo'
}

export function fileEmoji(inputs: CompletionInputs): string {
  if (inputs.photo && inputs.video) return '🎞️'
  return inputs.video ? '🎥' : '📷'
}

export function fileHeading(inputs: CompletionInputs): string {
  if (inputs.photo && inputs.video) return '🎞️ Submit Your Files'
  return inputs.video ? '🎬 Submit Your Video' : '📸 Submit Your Photo'
}

/** What the team has actually done so far. */
export type InputProgress = {
  /** An approved photo submission exists. */
  photo?: boolean
  /** An approved video submission exists. */
  video?: boolean
  /** The typed answer has been accepted. */
  answer?: boolean
}

/**
 * Whether the card is finished.
 *
 * Every compulsory input must be satisfied, and at least one input must be —
 * so a card whose inputs are all optional ("a photo or a clip, either is fine")
 * is not complete the moment it is opened.
 */
export function isComplete(inputs: CompletionInputs, done: InputProgress): boolean {
  const kinds = inputKinds(inputs)
  if (kinds.length === 0) return false
  const required = kinds.filter(k => inputs[k] === 'required')
  if (!required.every(k => done[k])) return false
  return kinds.some(k => done[k])
}

/** What is still outstanding, for a one-line nudge on the card. */
export function missingLabels(inputs: CompletionInputs, done: InputProgress): string[] {
  const kinds = inputKinds(inputs)
  const required = kinds.filter(k => inputs[k] === 'required' && !done[k])
  if (required.length > 0) return required.map(k => INPUT_LABELS[k].label)
  // Nothing compulsory outstanding: the card still needs one of something.
  if (!kinds.some(k => done[k])) return kinds.map(k => INPUT_LABELS[k].label)
  return []
}
