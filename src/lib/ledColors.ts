// Card lights. One source of truth: the admin picker, the player cube and the
// projector all read this, so a card lit teal is the same teal everywhere.
export const LED_HEX: Record<string, string> = {
  teal: '#14b8a6', amber: '#f59e0b', violet: '#8b5cf6',
  lime: '#84cc16', rose: '#f43f5e', cyan: '#06b6d4',
}
export const LED_KEYS = Object.keys(LED_HEX)
