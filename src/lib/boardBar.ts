// Which tabs the phone bottom bar shows (DESIGN-009). Order is fixed: Invite | Board (centre) | Scores.
// A player with a team password gets all three; an observer, or a player without a password
// (the Invite button is hidden for them today), gets Board + Scores with Board leading.
export type BarTab = 'invite' | 'board' | 'scores'

export const barTabs = (hasInvite: boolean): BarTab[] => (hasInvite ? ['invite', 'board', 'scores'] : ['board', 'scores'])

/** Space the board page keeps clear at its end so the bar never covers content (px, plus the safe area). */
export const BAR_SPACER_PX = 98
