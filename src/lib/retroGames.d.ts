// Types for the ported vanilla-JS arcade games in retroGames.js.

/** Handle returned by each game — call stop() to end the loop and unbind keys. */
export type ArcadeHandle = { stop: () => void }

/** Starts a game on the given canvas, writing score into hudEl and the control
 *  hint into keysEl. */
export type ArcadeGame = (
  canvas: HTMLCanvasElement,
  hudEl: HTMLElement,
  keysEl: HTMLElement,
) => ArcadeHandle

export const gameJump: ArcadeGame
export const gameChomp: ArcadeGame
export const gameBarrel: ArcadeGame
