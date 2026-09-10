export interface Task {
  id: string
  color: string
  hex_code: string
  title: string
  sort_order: number
  points: number
  is_live: boolean
  owner_id: string | null
  created_at: string
}

export interface TaskPage {
  id: string
  task_id: string
  page_order: number
  media_url: string | null
  media_type: 'image' | 'video' | null
  pointer_1: string | null
  pointer_2: string | null
  pointer_3: string | null
  pointer_4: string | null
  pointer_5: string | null
  pointer_6: string | null
  example_1: string | null
  example_2: string | null
  example_3: string | null
  example_4: string | null
  example_5: string | null
  example_6: string | null
  icon_1: string | null
  icon_2: string | null
  icon_3: string | null
  icon_4: string | null
  icon_5: string | null
  icon_6: string | null
  created_at: string
}

export interface TaskPhoto {
  id: string
  task_id: string
  photo_url: string
  photo_order: number
  position_x: number
  position_y: number
  caption: string | null
  created_at: string
}

export interface TaskLink {
  id: string
  task_id: string
  label: string
  url: string
  sort_order: number
  created_at: string
}

export interface Team {
  id: string
  name: string
  password: string
  owner_id: string | null
  created_at: string
}

export interface TeamScan {
  id: string
  team_id: string
  task_id: string
  scanned_at: string
  completed: boolean
  completed_at: string | null
}

// ── Bingo Dash ────────────────────────────────────────────────

// Per-board timer + time's-up alarm fields (subset of BingoSection).
export interface BoardTimer {
  timer_seconds: number
  /** The duration last configured (via Set / +/- while stopped, or a live
   *  extension), kept separate from timer_seconds so Reset can hand back
   *  the length the admin actually set instead of the paused remainder. */
  timer_duration_seconds: number
  timer_end_at: string | null
  time_up_message: string
  time_up_label: string
  time_up_maps_url: string
}

export interface BingoSection extends BoardTimer {
  /** Cube faces in play: 1, 2 or 6. See src/lib/cubeFaces.ts */
  face_count?: number | null
  /** midnight | arena | daylight — see src/lib/scoreboardThemes.ts */
  scoreboard_theme?: string | null
  id: string
  name: string
  slug: string
  sort_order: number
  game_started: boolean
  board_note: string
  board_note_every: number
  marshal_password: string
  photo_submissions_enabled: boolean
  // How the 5×5 tiles render for players: 'icon' (category icon) or 'words'
  // (category + shortened title). See components/BingoTileFace.tsx.
  tile_display: 'icon' | 'words'
  /** Demo only: grid slots the presenter has lit up, shared with every viewer. */
  glow_slots?: number[] | null
  owner_id: string | null
  created_at: string
}

export interface BingoChallengeSection {
  id: string
  game_section_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface BingoCategory {
  id: string
  section_id: string
  challenge_section_id: string | null
  name: string
  sort_order: number
  created_at: string
}

export interface BingoTask {
  /** One tile holding a set of activities — see bingo_bundle_items. */
  is_bundle?: boolean
  /** Set only when this object represents one specific box on a board (via
   *  fetchBoardTasks / an equivalent board-cards join), not the bare card
   *  row — the bingo_board_cards.id of that placement. A card can sit in
   *  several boxes on one board, so this is what lets each box track its
   *  own completion instead of all of them sharing the card's status. */
  placement_id?: string
  id: string
  section_id: string
  title: string
  color: string
  hex_code: string
  sort_order: number
  in_grid: boolean
  category: string
  points: number
  task_type: 'standard' | 'answer' | 'photo' | 'video' | 'media' | 'sign_splice' | 'breakout_hunt'
  answer_question: string | null
  answer_text: string | null
  completion_warning: string | null
  require_marshal: boolean
  // Contest ("contending") mode: played as a duel between two teams rather than
  // solo. contest_game keys come from lib/contestGames.ts; contest_bonus is the
  // extra the winner banks on top of the challenger's normal tile points.
  is_contest: boolean
  led?: string | null
  // AI Team Building cards only: per-card override of the speed-bonus clock.
  // enabled=false hides the bonus bar; minutes=null keeps the activity's own
  // duration. See supabase/020_aitb_card_timer.sql.
  aitb_timer_enabled?: boolean
  aitb_timer_minutes?: number | null
  // Sign Splice cards only: whether Screen 4 asks for the shop name / lot
  // number, and whether it insists. See supabase/021_sign_splice_shop_entry.sql.
  sign_splice_shop_input?: 'hidden' | 'optional' | 'compulsory'
  sign_splice_lot_input?: 'hidden' | 'optional' | 'compulsory'
  // Title rules and the OCR bar, per card. See 021_sign_splice_settings.sql.
  sign_splice_min_letters?: number
  sign_splice_max_letters?: number
  sign_splice_allow_spaces?: boolean
  sign_splice_allow_numbers?: boolean
  sign_splice_min_confidence?: number
  // How many items this card deals to each team from its own bank.
  // 0 = no draw. See supabase/025_card_draws.sql.
  /** Photo and video cards: let a team send more than one file. */
  photo_multiple?: boolean
  /** Which inputs the card collects, and whether each is compulsory.
   *  See src/lib/completionInputs.ts. Empty means the card still runs on
   *  task_type alone. */
  completion_inputs?: Record<string, string>
  draw_count?: number
  /** How the draw is presented; null means the card has no draw. */
  draw_style?: 'pick' | 'spin' | 'deal' | 'gamepick' | 'list' | null
  draw_spins?: number
  draw_images?: boolean
  contest_game: string
  contest_bonus: number
  maps_url: string | null
  maps_label: string | null
  owner_id: string | null
  cloned_from: string | null
  created_at: string
}

// A card placed on a board's 5x5 grid. Cards are universal: the same task
// can be placed on any number of boards via one placement row per board.
export interface BingoBoardCard {
  id: string
  section_id: string
  task_id: string
  slot: number
  created_at: string
}

export interface BingoSettings {
  id: string
  timer_seconds: number
  timer_end_at: string | null
  active_section_id: string | null
  template_section_id: string | null
  marshal_password: string
  game_started: boolean
  photo_submissions_enabled: boolean
  time_up_message: string
  time_up_label: string
  time_up_maps_url: string
  created_at: string
}

// Same shape as TaskPage — uses bingo_task_pages table
export type BingoTaskPage = TaskPage

export interface BingoTeam {
  id: string
  section_id: string
  name: string
  password: string
  photo_url: string | null
  bonus_points: number
  // Itemised breakdown of the bonus total: one entry per activity the marshal
  // awarded points for. bonus_points stays the authoritative sum of these.
  bonus_breakdown: BonusItem[]
  created_at: string
}

// One line in a team's bonus popup — an activity name and the points for it.
export interface BonusItem {
  label: string
  points: number
}

export interface BingoAwardConfig {
  id: string
  section_id: string
  total_points: number
  image_url: string | null
  consolation_count: number
  consolation_group_count: number
  third_count: number
  second_count: number
  first_count: number
  slide_order: string[]
  slide_points: Record<string, number>
  holding_title: string | null
  main_title: string | null
  main_subtitle: string | null
  main_tagline: string | null
  created_at: string
}

export interface BingoScan {
  id: string
  team_id: string
  task_id: string
  /** Which board box this scan belongs to (bingo_board_cards.id), when the
   *  card was opened from a specific board rather than a bare task link.
   *  NULL on scans recorded before this column existed, and on any future
   *  scan not tied to one placement — those still apply to every box
   *  showing the card, matching the old (pre-fix) behavior. Lets a card
   *  placed in several boxes on one board be completed independently
   *  instead of one completion ticking all of them. See
   *  supabase/migrations/20260910_scan_board_card_id.sql. */
  board_card_id: string | null
  scanned_at: string
  completed: boolean
  completed_at: string | null
  // AI Team Building cards only: the result slots this team drew or typed
  // (roulette genre/topic, dealt cards, animals, the 7 pitch words). Empty for
  // every other card type. See lib/aitbCards.ts.
  words: string[]
  // AI Team Building cards only: indexes of ticked mission steps.
  steps_done: number[]
  /** Cards collecting a typed answer: whether this team's answer was accepted.
   *  The answer used to complete the tile outright, so it needed nowhere to
   *  live; alongside other inputs it does. */
  answer_ok?: boolean
}

// A head-to-head duel on a contest card. The challenger scans the defender's QR
// to create it; both phones then follow this row live.
export interface BingoDuel {
  id: string
  section_id: string
  task_id: string
  challenger_team_id: string
  defender_team_id: string
  game_key: string
  status: 'pending' | 'active' | 'done' | 'declined' | 'cancelled'
  // Drawn once by the challenger so both phones show the identical setup.
  payload: { imageUrl?: string; imageLabel?: string }
  winner_team_id: string | null
  // Bonus awarded to the winner only. The challenger's tile points are separate
  // and come from the normal cross-off.
  bonus_points: number
  code: string
  created_at: string
  started_at: string | null
  resolved_at: string | null
}

export interface BingoMember {
  id: string
  team_id: string
  section_id: string
  name: string
  password: string
  role: 'member' | 'observer'
  created_at: string
}

export interface BingoPhotoSubmission {
  id: string
  team_id: string
  task_id: string
  scan_id: string | null
  photo_url: string
  /** Whether photo_url points at a picture or a video clip. */
  media_type?: 'image' | 'video'
  status: 'pending' | 'approved' | 'rejected'
  // Breakout Hunt sets only: what the photo should show, and which puzzle it
  // answers. See supabase/023_breakout_review.sql.
  label?: string | null
  puzzle_id?: string | null
  created_at: string
}

// Authenticated admin account (Supabase Auth user + approval profile).
// owner = main holder with full access; sub = approved collaborator.
export interface BingoAccount {
  // Rental plan fields (007_renter_accounts.sql). Owner-set; a renter can
  // read them on /bingo-dash/account but only set_account_plan() writes them.
  company_name?: string | null
  contact_name?: string | null
  phone?: string | null
  plan?: string | null
  max_boards?: number | null
  max_teams_per_board?: number | null
  plan_expires_at?: string | null
  owner_notes?: string | null
  id: string
  email: string | null
  role: 'owner' | 'sub'
  status: 'pending' | 'approved' | 'rejected'
  can_bingo: boolean
  can_flag: boolean
  active_section_id: string | null
  /** Set = temporary facilitator working ON this host account's tenant. */
  facilitator_host: string | null
  /** NULL = access never expires. */
  access_expires_at: string | null
  /** Name the helper typed on the join page — anonymous logins have no email. */
  display_name: string | null
  /** Which event pass this facilitator joined through (NULL = not from a pass). */
  facilitator_session_id: string | null
  created_at: string
}

/** A shareable event pass: one link + PIN that turns helpers into facilitators. */
export interface BingoFacilitatorSession {
  id: string
  code: string
  pin: string
  host_id: string
  label: string
  expires_at: string
  /** NULL = unlimited seats. */
  max_uses: number | null
  uses: number
  revoked: boolean
  created_by: string | null
  created_at: string
}

// ── Snake and Ladder ──────────────────────────────────────────

export interface SnakeGame {
  id: string
  name: string
  snakes: Record<string, number>   // head -> tail
  ladders: Record<string, number>  // bottom -> top
  created_at: string
}

export interface SnakeTile {
  id: string
  game_id: string
  tile_number: number
  task_id: string | null
  created_at: string
}

export interface SnakeTeam {
  id: string
  game_id: string
  name: string
  hex_code: string
  emoji: string | null
  position: number
  sort_order: number
  points: number
  created_at: string
}

// ── Photo Voting ──────────────────────────────────────────────

export interface VotePoll {
  id: string
  title: string
  max_votes_per_voter: number
  is_open: boolean
  media_type: 'photo' | 'video'
  created_at: string
}

export interface VotePhoto {
  id: string
  poll_id: string
  photo_url: string
  label: string | null
  sort_order: number
  created_at: string
}

export interface VoteBallot {
  id: string
  poll_id: string
  photo_id: string
  voter_id: string
  created_at: string
}

/* ---------- AI Team Building ---------- */

export interface AitbSettings {
  id: number
  admin_password: string
  game_ends_at: string | null
  updated_at: string
}

export interface AitbTeam {
  id: string
  name: string
  color: string
  sort_order: number
  adjust: number
  created_at: string
}

export interface AitbProgress {
  id: string
  team_id: string
  activity_id: number
  scanned_at: string | null
  steps_done: number[]
  completed_at: string | null
  bonus: number
  words: string[]
  created_at: string
}

// One word/photo option in an interactive module's draw pool (e.g. Nerf
// Prompt Cups' Character pool, Roulette's Genre pool) — admin-editable from
// the Card Library, keyed by AitbPoolKey (see lib/aitbActivities.ts).
export interface AitbPoolItem {
  id: string
  pool_key: string
  label: string
  photo_url: string | null
  sort_order: number
  created_at: string
}
