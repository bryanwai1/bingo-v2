// Worked samples a team can look at before they start.
//
// Several Mall Hunt cards are camera tricks: the instructions say what to do,
// but a team only really understands "clip 1 tosses it out of frame, clip 2
// catches it somewhere else" once they have seen the two frames play. These
// storyboards are drawn from a handful of primitives rather than photographed,
// so they cost no assets and stay sharp on a projector.
//
// A sample is data. Adding one is a few lines here, not a new component.

/** A thing drawn inside a storyboard frame. */
export type Mark =
  /** A person. `at` is a percentage across the frame; `size` scales them. */
  | { kind: 'figure'; at: number; size?: number; tint?: string; flip?: boolean }
  /** Any glyph — a prop, a plant, a light. */
  | { kind: 'prop'; glyph: string; at: number; y?: number; size?: number; anim?: Anim }
  /** A short line of text pinned inside the frame. */
  | { kind: 'note'; text: string; at?: number; y?: number }
  /** Direction of travel, drawn as a dashed arrow. */
  | { kind: 'arrow'; from: number; to: number; y?: number; label?: string }

/** How a mark moves while its frame is on screen. */
export type Anim = 'rise' | 'fall' | 'driftRight' | 'zoomIn' | 'pulse'

export type Frame = {
  /** Shown under the frame, e.g. "Clip 1 · the toss". */
  caption: string
  /** Drawn back to front. */
  marks: Mark[]
  /** A tint behind the frame, for an overhead view or a night shot. */
  wash?: string
}

/** One side of a before/after pair. */
export type Panel = {
  /** File under public/mall-hunt/samples/. */
  img: string
  /** What this panel is, e.g. "Shopfront in your assigned colour". */
  caption: string
  /** Marks the panel as a clip: a play badge and a running time. */
  video?: string
  /** Drawn over the image — used where the sample is a card of text. */
  overlay?: string[]
  /** Shape of the frame. Defaults to 4/3; a poster wants its own. */
  ratio?: string
  /** 'contain' shows the whole image letterboxed, for artwork that must not
   *  be cropped. Defaults to filling the frame. */
  fit?: 'cover' | 'contain'
}

/** A row of the thing the team is meant to produce. */
export type ArtefactRow = { left: string; right?: string; note?: string }

/**
 * A finished document, drawn rather than photographed.
 *
 * Budget tables, meal plans and game plans are mostly small text, and AI image
 * generation renders small text as gibberish — so these are built from data and
 * laid out in CSS, the same reasoning as Menu Remix's worked example.
 */
export type Artefact = {
  title: string
  sections: { heading?: string; rows: ArtefactRow[] }[]
  /** An emphasised closing row — a budget total, say. */
  total?: ArtefactRow
}

/**
 * A working page the team can open and play with.
 *
 * Some cards ask a team to *build* something. Showing a picture of a tool
 * teaches less than handing them one that runs: the sample is served from
 * public/ and is also the shape of the link they will submit.
 */
export type Tool = {
  /** A path under public/. */
  src: string
  /** Button text, e.g. "Open the sample tool". */
  label: string
}

/** A real clip of the finished thing, played in the card. */
export type Clip = {
  /** A path under public/. */
  src: string
  caption: string
}

export type CardSample = {
  /** Matches bingo_tasks.title. */
  card: string
  /** One line above the sample — the thing to get right. */
  headline: string
  /** A camera move, shown as frames that play in turn. */
  frames?: Frame[]
  /** A finished submission. `before` is optional: some cards only need the
   *  thing being sent, not what it started as. */
  pair?: { before?: Panel; after: Panel }
  /** A document the team produces, drawn from its own data. */
  artefact?: Artefact
  /** A live page, embedded and openable. */
  tool?: Tool
  /** A worked clip — the move, actually filmed. */
  clip?: Clip
  /** Optional closing line, for a rule that is easy to miss. */
  footnote?: string
}

const S = '/mall-hunt/samples'

export const CARD_SAMPLES: CardSample[] = [
  {
    card: 'Colour Hunt',
    headline: 'A storefront in your colour, with the team in the shot',
    pair: {
      after: {
        img: `${S}/colour-hunt-after.webp`,
        caption: 'A shopfront or display in one of your assigned colours, with at least 2 team members in frame',
      },
    },
    footnote: 'Two photos per colour, eight in total. Photo only — never touch stock or step into a display.',
  },
  {
    card: 'AI Virtual Fitting',
    headline: 'A window outfit, worn by a team member — without going in',
    pair: {
      before: { img: `${S}/ai-virtual-fitting-before.webp`, caption: 'The outfit and shopfront, photographed from the walkway' },
      after: { img: `${S}/ai-virtual-fitting-after.webp`, caption: 'AI image putting that outfit on a team member' },
    },
    footnote: 'Stay outside the shop, and note the shop name in your submission as proof.',
  },
  {
    card: 'Book of Clues',
    headline: 'Book titles that read as a line of your plot',
    pair: {
      after: {
        img: `${S}/book-of-clues-sample.webp`, ratio: '16 / 9',
        caption: 'One member holding the books stacked in order, every title readable',
      },
    },
    footnote: 'Browse only — nothing is bought, and the aisle stays clear for staff and shoppers.',
  },
  {
    card: 'Product Props',
    headline: 'An everyday product, filmed as something else',
    pair: {
      before: { img: `${S}/product-props-before.webp`, caption: 'The product where you found it — an umbrella on a rack' },
      after: { img: `${S}/product-props-after.webp`, video: '0:08', caption: 'The same object played as a prop — the umbrella as a sword' },
    },
    footnote: 'Five products, five clips. Nothing is opened or bought, and shelves stay untouched.',
  },
  {
    card: 'Escape the Mall',
    headline: 'Solve the riddle, then film the moment you crack it',
    pair: {
      after: {
        img: `${S}/escape-the-mall-riddle.webp`, ratio: '4 / 5', fit: 'contain',
        caption: 'The riddle your team draws in the app — type the answer until it is right',
      },
    },
    clip: {
      src: `${S}/escape-the-mall-video.mp4`,
      caption: 'Then the “we cracked it” reaction, filmed at the place the riddle points to',
    },
    footnote: 'Your riddle will be a different one — this is only the shape of the answer.',
  },
  {
    card: 'Shop Hero Poster',
    headline: 'The shop decides the hero — sports becomes Speed',
    pair: {
      before: { img: `${S}/shop-hero-poster-before.webp`, caption: 'A team member outside their assigned storefront' },
      after: { img: `${S}/shop-hero-poster-after.webp`, caption: 'That photo turned into a hero poster, named and tagged' },
    },
    footnote: 'One poster per team member, each tagged with the shop that inspired them.',
  },
  {
    card: 'Comic Creator',
    headline: 'One cast photo, turned into a comic with your title on it',
    pair: {
      before: {
        img: `${S}/comic-creator-before.webp`, ratio: '4 / 5', fit: 'contain',
        caption: 'One group “cast” photo, somewhere bright in the mall',
      },
      after: {
        img: `${S}/comic-creator-after.webp`, ratio: '4 / 5', fit: 'contain',
        caption: 'The same four, drawn as a short comic with your title across the top',
      },
    },
    footnote: 'Clear and fun enough for a children’s audience. Check the title is spelled correctly before you send it — that is the part teams get wrong.',
  },
  {
    card: 'Menu Remix',
    headline: 'Every item, in all three languages, on one clean page',
    pair: {
      before: {
        img: `${S}/menu-remix-before.webp`, ratio: '4 / 5', fit: 'contain',
        caption: 'Any menu or price board in the mall, photographed whole and readable',
      },
      after: {
        img: `${S}/menu-remix-after.webp`, ratio: '4 / 5', fit: 'contain',
        caption: 'Rebuilt in Malay, English and Chinese — same layout, prices unchanged',
      },
    },
    footnote: 'Every single item, not a sample of them. Prices stay as they are — RM8 is RM8 in all three languages.',
  },
  {
    card: 'AI Movie Poster',
    headline: 'Your team, inside the poster’s own world',
    pair: {
      before: {
        img: `${S}/ai-movie-poster-before.webp`, ratio: '4 / 5', fit: 'contain',
        caption: 'A poster on display at the cinema, photographed straight on',
      },
      after: {
        img: `${S}/ai-movie-poster-after.webp`, ratio: '4 / 5', fit: 'contain',
        caption: 'Two team members edited in — same palette, same lighting, same framing',
      },
    },
    footnote: 'Match the poster’s own colours and light. Five posters, five edits — tell a little story in each one.',
  },
  {
    card: 'Route Master',
    headline: 'One map: the mall, every checkpoint, its lot number, and the route',
    pair: {
      after: {
        img: `${S}/route-master-map.webp`, ratio: '1000 / 860', fit: 'contain',
        caption: 'Mall named at the top, each checkpoint with its shop name and lot number, route drawn in order',
      },
    },
    footnote: 'Detailed enough that a stranger could follow it. Find the lot numbers on the shopfronts or the directory.',
  },
  {
    card: 'B-Roll',
    headline: 'Five ambient shots, nobody in them',
    clip: {
      src: `${S}/broll-video.mp4`,
      caption: 'Reflections, escalators, plants and lights — 3–5 seconds each, cut together',
    },
    footnote: 'No team members needed. Stay out of walkways while you film.',
  },
  {
    card: 'AI Ops Manager',
    headline: 'One plan: who does what, and in which order',
    artefact: {
      title: 'Crew & Mission Plan',
      sections: [
        {
          heading: 'Roles',
          rows: [
            { left: 'Director', right: 'Aisyah', note: 'Calls the shot, keeps the clock' },
            { left: 'Camera', right: 'Wei Jie', note: 'Films every clip' },
            { left: 'Props & talent', right: 'Kumar', note: 'Finds objects, wrangles the cast' },
            { left: 'AI operator', right: 'Mei Ling', note: 'Runs the prompts and edits' },
          ],
        },
        {
          heading: 'Mission order — fastest route',
          rows: [
            { left: '1 · Colour Hunt', right: 'Ground floor', note: 'Same wing as the entrance' },
            { left: '2 · Book of Clues', right: 'L1 bookstore', note: 'On the way to the food court' },
            { left: '3 · Craft Services', right: 'Food court', note: 'Do it while queuing' },
            { left: '4 · Hero Walk', right: 'Centre court', note: 'Wide and bright after lunch' },
          ],
        },
      ],
    },
    footnote: 'Submit it as a link — a doc, a slide or a chat share. Check it opens for someone who is not signed in as you.',
  },
  {
    card: 'Mission Control Budget',
    headline: 'A tool that splits RM500 and totals it for you — try this one',
    tool: { src: `${S}/budget-tool.html`, label: 'Open the sample tool' },
    footnote: 'Drag a slider and watch the total follow. Yours can look completely different — it just has to split the budget and add up on its own. The money is fictional, and the link you submit must open for anyone.',
  },
  {
    card: 'Craft Services',
    headline: 'A feast that exists in this food court, inside the budget',
    pair: {
      after: {
        img: `${S}/craft-services-sample.webp`, ratio: '4 / 5', fit: 'contain',
        caption: 'Items, prices and quantities from the boards, totalled against your budget',
      },
    },
    footnote: 'Read the boards only — nothing is bought. Every item has to be really on sale in this food court, and the total has to fit the budget you set.',
  },
  {
    card: 'Match Cut',
    headline: 'One motion, two places — the object never stops moving',
    clip: {
      src: `${S}/match-cut-video.mp4`,
      caption: 'Two clips, cut on the motion — watch where one ends and the next begins',
    },
    footnote: 'Match the speed and the direction, and cut while the object is out of shot in both clips. Keep the toss low, safe and clear of other shoppers.',
  },
  {
    card: 'Stunt Double',
    headline: 'The punch misses by metres — only the camera angle hides it',
    frames: [
      {
        caption: 'From above · the real gap',
        wash: 'rgba(255,255,255,0.06)',
        marks: [
          { kind: 'figure', at: 26, size: 0.8 },
          { kind: 'figure', at: 72, size: 0.8, flip: true },
          { kind: 'arrow', from: 34, to: 64, y: 60, label: '3–4 metres apart' },
          { kind: 'prop', glyph: '🎥', at: 50, y: 84, size: 22 },
        ],
      },
      {
        caption: 'From the camera · the hit lands',
        marks: [
          { kind: 'figure', at: 38, size: 1.15 },
          { kind: 'figure', at: 60, size: 0.75, flip: true },
          { kind: 'prop', glyph: '💥', at: 50, y: 40, size: 28, anim: 'pulse' },
          { kind: 'note', text: 'One near the lens, one further back', y: 90 },
        ],
      },
    ],
    footnote: 'Never make contact. Film the swing and the reaction in one take.',
  },
  {
    card: 'Hero Walk',
    headline: 'One line, shoulder to shoulder, straight at a low camera',
    frames: [
      {
        caption: 'Line up wide — nobody ahead of anybody',
        marks: [
          { kind: 'figure', at: 26, size: 0.75 },
          { kind: 'figure', at: 42, size: 0.75 },
          { kind: 'figure', at: 58, size: 0.75 },
          { kind: 'figure', at: 74, size: 0.75 },
          { kind: 'prop', glyph: '🎥', at: 50, y: 86, size: 22 },
        ],
      },
      {
        caption: 'Walk forward together, no smiling',
        marks: [
          { kind: 'figure', at: 24, size: 1.15 },
          { kind: 'figure', at: 41, size: 1.15 },
          { kind: 'figure', at: 59, size: 1.15 },
          { kind: 'figure', at: 76, size: 1.15 },
          { kind: 'note', text: 'Film from low down so the team fills the frame', y: 92 },
        ],
      },
    ],
    footnote: 'Slow and steady — if one person drifts ahead, the line breaks and so does the shot.',
  },
]

export function sampleFor(cardTitle: string | null | undefined): CardSample | null {
  if (!cardTitle) return null
  // A board's own copy is titled "Match Cut (Mall Hunt)"; the sample is the
  // same, so the bracketed board tag is ignored.
  const base = cardTitle.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return CARD_SAMPLES.find(s => s.card === base) ?? null
}
