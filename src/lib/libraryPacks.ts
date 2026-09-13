// The starter packs an admin can copy cards from.
//
// This was two database tables that nothing ever wrote to — there is no UI for
// adding a pack or editing a library card, so the rows only ever changed when
// someone authored them by hand. As a constant it is version-controlled,
// reviewable in a diff, and costs no round trip when the panel opens.
//
// Adding a pack now means editing this file and deploying, which is the same
// effort as writing the SQL was, and one fewer thing to keep in sync.

/** One card a pack will create on the board it is imported into. */
export type LibraryCard = {
  title: string
  category: string
  /** Display group on the board (the card's colour band). */
  color: string
  hexCode: string
  points: number
  taskType: 'standard' | 'answer' | 'photo' | 'video' | 'media'
  isContest?: boolean
  contestBonus?: number
  contestGame?: string
}

export type LibraryPack = {
  id: string
  name: string
  description: string
  emoji: string
  cards: LibraryCard[]
}

export const LIBRARY_PACKS: LibraryPack[] = [
  {
    id: "7017814a-07dc-4ce6-be85-75e76bae9923",
    name: "AI Team Building",
    description: "Ten AI-led activities for corporate teams — prompting, generation and judgement under time pressure.",
    emoji: "🤖",
    cards: [
      { title: "Speed Edit Showdown", category: "AI Team Building", color: "AI", hexCode: "#dc2626", points: 100, taskType: "standard", isContest: true, contestBonus: 150, contestGame: "speed-edit" },
      { title: "Prompt Relay", category: "AI Team Building", color: "AI", hexCode: "#7c3aed", points: 75, taskType: "standard" },
      { title: "AI Portrait Studio", category: "AI Team Building", color: "AI", hexCode: "#ec4899", points: 75, taskType: "standard" },
      { title: "Caption This", category: "AI Team Building", color: "AI", hexCode: "#f59e0b", points: 50, taskType: "standard" },
      { title: "Style Transfer Race", category: "AI Team Building", color: "AI", hexCode: "#06b6d4", points: 75, taskType: "standard", isContest: true, contestBonus: 100, contestGame: "speed-edit" },
      { title: "The Brief Builder", category: "AI Team Building", color: "AI", hexCode: "#10b981", points: 100, taskType: "standard" },
      { title: "Hallucination Hunt", category: "AI Team Building", color: "AI", hexCode: "#ef4444", points: 75, taskType: "standard" },
      { title: "One-Word Prompt", category: "AI Team Building", color: "AI", hexCode: "#8b5cf6", points: 50, taskType: "standard" },
      { title: "Team Mascot Design", category: "AI Team Building", color: "AI", hexCode: "#3b82f6", points: 75, taskType: "standard" },
      { title: "Pitch It With AI", category: "AI Team Building", color: "AI", hexCode: "#f97316", points: 100, taskType: "standard" },
    ],
  },
]
