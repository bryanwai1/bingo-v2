export interface SavedCoopMember { id: string; role: string; team_id: string; section_id: string }

/** Only try saved identities, preferring the current board's identity. Never adopt another teammate. */
export async function resolveSavedMember(
  candidates: (string | null)[], teamId: string, sectionId: string,
  read: (id: string) => Promise<SavedCoopMember | null>,
): Promise<SavedCoopMember | null> {
  for (const id of new Set(candidates.filter((id): id is string => !!id))) {
    const member = await read(id)
    if (member?.team_id === teamId && member.section_id === sectionId) return member
  }
  return null
}
