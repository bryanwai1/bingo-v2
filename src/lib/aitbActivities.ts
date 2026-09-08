// AI Team Building — the 10 activities and their scoring, ported from the
// company app. Kept byte-faithful on the numbers so a team's score here means
// the same thing it did there.
//
// Scoring, for reference:
//   +100  check-in (scan)
//   +100  per step ticked (5 steps = 500)
//   +200 / 350 / 500  completion, by Easy / Normal / Hard
//   +speed bonus from the activity's own tier ladder, multiplied by
//    difficulty (Easy 1x, Normal 1.4x, Hard 1.8x)

export type AitbDifficulty = 'Easy' | 'Normal' | 'Hard'

/** The interactive module an activity's mission page renders, if any. */
export type AitbModule = 'cups' | 'roulette' | 'cards' | 'retro'

export type AitbActivity = {
  id: number
  act: string
  emoji: string
  color: string
  name: string
  outType: string
  tagline: string
  steps: string[]
  stepEmojis: string[]
  apps: string[]
  mins: number
  difficulty: AitbDifficulty
  props: string[]
  /** Ascending minutes from check-in: finish within uptoMin -> earn pts. */
  bonusTiers: { uptoMin: number; pts: number }[]
  /** Interactive module rendered on the mission page, if this activity has one. */
  module?: AitbModule
  /** Longer brief shown on the mission page under the tagline — what the
   *  activity actually involves, in 2-3 sentences. */
  description: string
  /** The "why this activity" line — the soft skills/dynamics it's designed
   *  to surface, shown in caps under the description. */
  skillTag: string
}

export const AITB_ACTIVITIES: AitbActivity[] = [
  { id: 1, act: '01', emoji: '🎯', color: '#fb7185', name: 'Nerf Prompt Cups',
    outType: 'AI Image', tagline: 'Shoot cups, reveal secret words, turn them into a wild AI picture!',
    steps: ['Shoot 1 red, 1 blue and 1 yellow cup.','Shout the cup numbers to the host!','Watch the big screen — your secret words appear!','Put the 3 words together — that\u2019s your prompt!','Ask AI to make the picture and score points!'],
    stepEmojis: ['🔫','📢','📺','🧩','🎨'],
    apps: ['Arena','ChatGPT','Gemini','Copilot','Ideogram'], mins: 10, difficulty: 'Easy',
    props: ['Nerf blaster + darts','Red / blue / yellow cup sets (numbered)','Secret word slips inside each cup','Table to line up the cups'],
    bonusTiers: [{uptoMin:2.5,pts:1000},{uptoMin:5,pts:800},{uptoMin:7.5,pts:600},{uptoMin:10,pts:400},{uptoMin:12.5,pts:200}],
    module: 'cups',
    description: 'Shoot 3 numbered Nerf cups — red, blue, yellow — each hiding a secret word. Draw the 3 words on the spot, chain them into one AI image prompt, and see what the model paints.',
    skillTag: '🎯 QUICK DECISION-MAKING, PHYSICAL PLAY, AND CREATIVE PROMPT-BUILDING.' },

  { id: 2, act: '02', emoji: '🕹️', color: '#22d3ee', name: 'Retro Game Speed Build',
    outType: '3 Playable Browser Games', tagline: 'Fastest team to build 3 working retro games with AI wins!',
    steps: ['Pick 1 builder for each game + 1 tester.','Ask AI to build Mario, Pac-Man and Donkey Kong.','You have 15 minutes — go go go!','Test every game — it must really play!','Other team tries your games. Best games win!'],
    stepEmojis: ['🙋','🤖','⏱️','🎮','🏆'],
    apps: ['AI Studio','Canva AI','Antigravity','Kimi'], mins: 15, difficulty: 'Hard', props: [],
    bonusTiers: [{uptoMin:4,pts:1000},{uptoMin:8,pts:800},{uptoMin:11,pts:600},{uptoMin:15,pts:400},{uptoMin:19,pts:200}],
    module: 'retro',
    description: 'Split into 3 builder pairs and race the clock to get Mario, Pac-Man and Donkey Kong all playable in 15 minutes flat. The other team then tries your games live on the big screen.',
    skillTag: '🎯 PARALLEL WORK UNDER PRESSURE, DELEGATION, AND RAPID PROTOTYPING.' },

  { id: 3, act: '03', emoji: '🏰', color: '#a78bfa', name: 'Rubber Band Castle',
    outType: 'AI Castle + Team Composite', tagline: 'Stack ALL the cups into a castle — no hands, only strings!',
    steps: ['Everyone holds ONE string on the rubber band.','Pull together to grab cups — NO hands!','Stack ALL the cups into one castle.','Take a photo of your cup castle.','AI turns it into a REAL castle — with your team on top!'],
    stepEmojis: ['🪢','🙌','🏗️','📸','🏰'],
    apps: ['Arena','ChatGPT','Gemini','Copilot','Nano Banana'], mins: 12, difficulty: 'Normal',
    props: ['Rubber band with 6–8 strings tied on','Stack of cups (8–10) for the castle'],
    bonusTiers: [{uptoMin:3,pts:1000},{uptoMin:6,pts:800},{uptoMin:9,pts:600},{uptoMin:12,pts:400},{uptoMin:15,pts:200}],
    description: 'One rubber band, six to eight strings tied on, zero hands allowed — the whole team pulls together to stack a cup castle, then AI turns the photo into a real fortress with your team standing on top.',
    skillTag: '🎯 FINE-MOTOR COORDINATION, PATIENCE, AND SHARED PHYSICAL CONTROL.' },

  { id: 4, act: '04', emoji: '🌳', color: '#34d399', name: 'Resort Tree App Sprint',
    outType: 'Interactive Web App', tagline: 'Photograph 6 trees, then build a real tree app with AI!',
    steps: ['Find any 6 different trees around the vicinity.','Split up and snap photos of each tree.','Run back and build a tree app with AI.','Add fun facts + 1 mini game or quiz.','Share your app with a QR code!'],
    stepEmojis: ['🔍','📷','💻','🧠','📲'],
    apps: ['Canva AI','AI Studio','Antigravity','Kimi','Claude'], mins: 20, difficulty: 'Hard', props: [],
    bonusTiers: [{uptoMin:5,pts:1000},{uptoMin:10,pts:800},{uptoMin:15,pts:600},{uptoMin:20,pts:400},{uptoMin:25,pts:200}],
    description: 'Photograph 6 real trees around the venue, then build a working web app about them — facts, a mini-game or quiz, and a QR code so anyone can open it.',
    skillTag: '🎯 RAPID APP-BUILDING, DIVISION OF LABOUR, AND REAL-WORLD RESEARCH.' },

  { id: 5, act: '05', emoji: '🎶', color: '#f472b6', name: 'Roulette Jingle & Dance Off',
    outType: 'AI Song + Live Dance', tagline: 'Spin the wheels, make an AI song, dance it live!',
    steps: ['Spin both wheels — keep what you get!','Write a song about your two words.','Make the song with AI (60 seconds).','Invent a dance — EVERYONE joins in.','Perform it live for the crowd!'],
    stepEmojis: ['🎡','✍️','🎵','💃','🎤'],
    apps: ['Suno','ChatGPT','Claude'], mins: 15, difficulty: 'Normal',
    props: ['Portable speaker (play the AI song for the dance)'],
    bonusTiers: [{uptoMin:4,pts:1000},{uptoMin:8,pts:800},{uptoMin:11,pts:600},{uptoMin:15,pts:400},{uptoMin:19,pts:200}],
    module: 'roulette',
    description: 'Two roulette wheels: one picks the genre (K-pop, dangdut, Bollywood...), one picks the mandatory topic (nasi lemak, KPI targets, the boss). Team writes lyrics, generates the song in Suno, then choreographs a live team dance.',
    skillTag: '🎯 CREATIVE NEGOTIATION, VULNERABILITY UNLOCK, AND SHARED PHYSICAL EXPRESSION.' },

  { id: 6, act: '06', emoji: '🎬', color: '#fbbf24', name: 'Random Card Cinematic',
    outType: 'Cinematic Video', tagline: '4 surprise cards become one epic AI movie scene!',
    steps: ['Tap DRAW — no swaps, keep all 4 cards!','Pick 2 teammates to star as your actors.','Mix the cards + your actors into one movie idea.','Ask AI to make your movie scene.','Watch it together on the big screen!'],
    stepEmojis: ['🃏','🎭','💡','🤖','🍿'],
    apps: ['Arena','Kling','Veo (Flow)','Higgsfield'], mins: 15, difficulty: 'Normal', props: [],
    bonusTiers: [{uptoMin:4,pts:1000},{uptoMin:8,pts:800},{uptoMin:11,pts:600},{uptoMin:15,pts:400},{uptoMin:19,pts:200}],
    module: 'cards',
    description: 'A digital random card app deals 4 wildcards to each team — Country/Civilization, Character, Scene, Cinematic Style. No re-draws. Two teammates must star in the scene as the actors, so the team photographs them and works their faces into the shot. Team assembles the four elements into a cinematic prompt and generates a short historical epic movie scene.',
    skillTag: '🎯 COLLECTIVE DECISION-MAKING, NEGOTIATION, AND CREATIVE RECONCILIATION OF RANDOM CONSTRAINTS.' },

  { id: 7, act: '07', emoji: '🏓', color: '#60a5fa', name: 'Ping Pong Alphabet Pitch',
    outType: 'AI Ad Campaign + Pitch', tagline: 'Bounce balls into letter cups, make 7 words, pitch a crazy AI ad!',
    steps: ['Bounce balls into the letter cups — 90 seconds!','Collect at least 7 different letters.','Make 7 words using ALL your letters.','Give the words to AI — it makes a crazy ad!','Pitch your ad like a TV star!'],
    stepEmojis: ['🏓','🔤','📝','🤖','🌟'],
    apps: ['Arena','ChatGPT','Gemini','Copilot','Claude'], mins: 12, difficulty: 'Normal',
    props: ['26 cups labelled A–Z','Ping pong balls (6+)','Table for the cup grid'],
    bonusTiers: [{uptoMin:3,pts:1000},{uptoMin:6,pts:800},{uptoMin:9,pts:600},{uptoMin:12,pts:400},{uptoMin:15,pts:200}],
    description: 'Bounce ping-pong balls into a lettered cup grid to bank at least 7 letters, spell 7 words from what you land, then hand the words to AI to write a crazy ad you pitch live like a TV star.',
    skillTag: '🎯 IMPROVISED PITCHING, WORDPLAY UNDER PRESSURE, AND PUBLIC PERFORMANCE.' },

  { id: 8, act: '08', emoji: '👁️', color: '#f59e0b', name: 'Speed Edit Showdown',
    outType: 'Image Recreation', tagline: 'Relay-race to recreate the picture on the big screen with AI!',
    steps: ['Pick a target picture from the gallery below.','Take turns — each member writes the next prompt!','Keep regenerating until it matches.','Show the marshal your picture AND your prompt!','Faster ✅ from the marshal = more points!'],
    stepEmojis: ['👀','🔁','🎨','🙋','⚡'],
    apps: ['Arena','ChatGPT','Gemini','Copilot','Nano Banana'], mins: 12, difficulty: 'Easy', props: [],
    bonusTiers: [{uptoMin:3,pts:1000},{uptoMin:6,pts:800},{uptoMin:9,pts:600},{uptoMin:12,pts:400},{uptoMin:15,pts:200}],
    description: 'A relay race to recreate a target picture on the big screen — each teammate writes the next prompt, refining together until AI’s output actually matches.',
    skillTag: '🎯 SEQUENTIAL COLLABORATION, VISUAL PRECISION, AND HANDOFF DISCIPLINE.' },

  { id: 9, act: '09', emoji: '🐘', color: '#2dd4bf', name: 'Found Object Animals',
    outType: 'Animated Interaction Video', tagline: 'Draw 2 surprise animals — build them, then bring them to life with AI!',
    steps: ['Tap DRAW to get your 2 surprise animals!','Build each from found items (indoors/outdoors) — or draw them!','Finish both animal shapes and snap a photo.','Photo it — AI makes them REAL animals!','AI animates your 2 animals playing together.'],
    stepEmojis: ['🎲','🧺','🖼️','📸','🎬'],
    apps: ['Arena','Nano Banana','Gemini','Kling','Higgsfield'], mins: 15, difficulty: 'Hard',
    props: ['Collection basket for found objects','Paper + markers (for teams who prefer to draw)'],
    bonusTiers: [{uptoMin:4,pts:1000},{uptoMin:8,pts:800},{uptoMin:11,pts:600},{uptoMin:15,pts:400},{uptoMin:19,pts:200}],
    description: 'Draw 2 surprise animals, then build them from whatever you can find lying around — indoors, outdoors, or just drawn on paper. AI turns the photo into real creatures and animates the pair playing together.',
    skillTag: '🎯 IMPROVISED CRAFTING, RESOURCEFULNESS, AND PLAYFUL AMBIGUITY.' },

  { id: 10, act: '10', emoji: '🧭', color: '#c084fc', name: 'Resort Character Journey',
    outType: '10-Scene Travelogue', tagline: 'One mascot, 10 real resort spots — tell A Day in the Life!',
    steps: ['Create ONE cartoon mascot character.','Photo 10 real spots — pool, lobby, spa...','AI puts your mascot in every photo.','Same mascot in all 10 — don\u2019t change it!','Tell the story: A Day in the Life!'],
    stepEmojis: ['🎨','📷','🤖','🔒','📖'],
    apps: ['Arena','ChatGPT','Gemini','Copilot','Nano Banana'], mins: 20, difficulty: 'Hard', props: [],
    bonusTiers: [{uptoMin:5,pts:1000},{uptoMin:10,pts:800},{uptoMin:15,pts:600},{uptoMin:20,pts:400},{uptoMin:25,pts:200}],
    description: 'Create one cartoon mascot, then photograph 10 real resort spots — pool, lobby, spa and more. AI drops the same mascot into every shot to tell one continuous "Day in the Life" travelogue.',
    skillTag: '🎯 VISUAL CONSISTENCY, STORYTELLING, AND VENUE EXPLORATION.' },
]

export const AITB_POINTS = { scan: 100, step: 100, complete: 300 } as const
export const AITB_COMPLETE:   Record<AitbDifficulty, number> = { Easy: 200, Normal: 350, Hard: 500 }
export const AITB_BONUS_MULT: Record<AitbDifficulty, number> = { Easy: 1, Normal: 1.4, Hard: 1.8 }

export function aitbActivity(id: number) {
  return AITB_ACTIVITIES.find(a => a.id === id)
}

/** Match an imported bingo card to its activity by title. */
export function aitbByName(name: string) {
  const n = name.trim().toLowerCase()
  return AITB_ACTIVITIES.find(a => a.name.toLowerCase() === n)
}

/** Speed bonus for finishing in `elapsedMs`, scaled by difficulty. */
export function aitbSpeedBonus(elapsedMs: number, a: Pick<AitbActivity,'bonusTiers'|'difficulty'>): number {
  const mins = elapsedMs / 60_000
  const mult = AITB_BONUS_MULT[a.difficulty] ?? 1
  for (const t of a.bonusTiers) if (mins <= t.uptoMin) return Math.round(t.pts * mult)
  return 0
}

/**
 * Apply a card's timer override to an activity.
 *
 * Passing a minute count rescales the whole bonus ladder proportionally, so a
 * 20-minute activity run in 10 keeps the same shape of ladder — just twice as
 * tight. null leaves the activity untouched.
 */
export function aitbWithTimer(a: AitbActivity, minutes?: number | null): AitbActivity {
  if (!minutes || minutes <= 0 || minutes === a.mins || !a.mins) return a
  const factor = minutes / a.mins
  return {
    ...a,
    mins: minutes,
    bonusTiers: a.bonusTiers.map(t => ({
      ...t,
      uptoMin: Math.max(0.5, Math.round(t.uptoMin * factor * 10) / 10),
    })),
  }
}

/** Best possible score: check-in + every step + completion + top bonus. */
export function aitbMaxPoints(a: AitbActivity): number {
  return AITB_POINTS.scan + a.steps.length * AITB_POINTS.step
    + AITB_COMPLETE[a.difficulty]
    + Math.round((a.bonusTiers[0]?.pts ?? 0) * AITB_BONUS_MULT[a.difficulty])
}

// ── Interactive-module data (cups / roulette / cards) ─────────────────────
// Word pools a slot draws or picks from. Kept separate from the module/slot
// tables below so a pool (e.g. genre) can be reused by more than one module.

export type AitbPoolKey = 'cupCharacter' | 'cupAction' | 'cupScene' | 'genre' | 'topic' | 'country' | 'cardChar' | 'cardScene' | 'style'

export const AITB_POOLS: Record<AitbPoolKey, string[]> = {
  // Nerf Prompt Cups: one word from each of 3 pools chains into a full AI
  // image prompt — "A ninja penguin" + "breakdancing" + "on the moon".
  cupCharacter: ['A grumpy astronaut','A disco unicorn','A samurai chef','A robot grandma','A ninja penguin','A wizard toddler','A pirate librarian','A cyborg cat','A viking ballerina','A detective sloth','A superhero janitor','A vampire barista'],
  cupAction: ['riding a rocket','breakdancing','brewing potions','surfing on lava','juggling planets','escaping a maze','taming a dragon','stealing a giant cookie','arm-wrestling a bear','painting the sky','deep-sea diving','racing a cheetah'],
  cupScene: ['in a neon jungle','on the moon','inside a volcano','in a candy kingdom','in an underwater city','in a haunted mansion','atop a skyscraper','in a desert oasis','in a cyberpunk market','in an ancient temple','on a floating island','in a frozen tundra'],
  // Restored to the original word set — real reel art exists for exactly
  // these words (public/aitb/reels/{genre,topic}/*.webp), slugified to match.
  genre: ['70s Disco','Acoustic Café','Bollywood','Broadway Musical','Country Ballad','Dangdut','EDM Anthem','Hip-Hop','Joget','K-Pop','Lo-fi Chill','Nursery Rhyme','Opera','Reggae','Smooth Jazz'],
  topic: ['Annual Leave','Endless Zoom Calls','Impossible Deadlines','KPI Targets','Monday Mornings','Nasi Lemak','Teh Tarik','The Boss','The Broken Printer','The Company Canteen','The Office Coffee','The Team WhatsApp Group','Traffic Jams','Working Overtime'],
  // Random Card Cinematic: real reel art exists for exactly these words
  // (public/aitb/reels/{country,cardChar,cardScene,style}/*.webp).
  country: ['Ancient Egypt','Ancient Greece','Babylon','Feudal Japan','Ming Dynasty China','Mughal India','The Aztec Empire','The Inca Empire','The Mali Empire','The Ottoman Empire','The Roman Empire','Viking Norse'],
  cardChar: ['A Blind Prophet','A Court Jester','A Fallen Knight','A High Priestess','A Masked Assassin','A Pirate Captain','A Rogue General','A Street Orphan','A Wandering Monk','A Warrior Queen','A Young Blacksmith','An Exiled Prince'],
  cardScene: ['A Burning City','A Crowded Market Chase','A Desert Ambush','A Duel at Dawn','A Frozen Mountain Pass','A Grand Feast Betrayal','A Royal Coronation','A Sacred Temple Ritual','A Secret Tunnel Escape','A Stormy Sea Battle'],
  style: ['Cartoon Animated','Horror Movie','Old School Black & White','Slow-Motion Epic'],
}

/** One wheel / reel / cup on a card. `pool` is the key its options are
 *  looked up under — a shared house pool or the card's own list. */
export type AitbModuleSlot = { emoji: string; label: string; pool: string; count: number; inPrompt: boolean }



/** The pie-wheel (roulette) and card-deal modules render their own art via
 *  ResultRevealCard / reel images directly, not through the slot-machine
 *  image variants below — so this stays false for every module; it's kept
 *  only so those slot-machine components have somewhere to resolve from if
 *  they're ever used again. */


/** The 3 games a Retro Game Speed Build team races to finish, ported from
 *  the activity's own steps ("Mario, Pac-Man and Donkey Kong"). */
export const AITB_RETRO_GAMES = ['Mario', 'Pac-Man', 'Donkey Kong'] as const

/** Official homepage for an AI tool chip, so "Your AI tools" can be tapped
 *  to open — only listed where the tool's real public URL is unambiguous;
 *  anything else (internal/codename tools like "Nano Banana", "Antigravity")
 *  is left out and renders as a plain (non-link) chip. */
const AITB_TOOL_URLS: Record<string, string> = {
  'ChatGPT': 'https://chat.openai.com',
  'Claude': 'https://claude.ai',
  'Gemini': 'https://gemini.google.com',
  'Copilot': 'https://copilot.microsoft.com',
  'Suno': 'https://suno.com',
  'AI Studio': 'https://aistudio.google.com',
  'Canva AI': 'https://www.canva.com',
  'Ideogram': 'https://ideogram.ai',
  'Kling': 'https://klingai.com',
  'Veo (Flow)': 'https://labs.google/flow',
  'Higgsfield': 'https://higgsfield.ai',
  'Kimi': 'https://kimi.com',
  'Arena': 'https://lmarena.ai',
}

export function aitbToolUrl(name: string): string | undefined {
  return AITB_TOOL_URLS[name]
}

/** Optional one-line caption shown under a tool chip, for the tools where a
 *  short hint actually helps (which mode to pick, how long it takes). */
const AITB_TOOL_CAPTIONS: Record<string, string> = {
  'Arena': 'Battle mode → Image or Video',
  'Suno': 'AI song in ~60 seconds',
}

export function aitbToolCaption(name: string): string | undefined {
  return AITB_TOOL_CAPTIONS[name]
}
