import { ParticleBackground } from './ParticleBackground'
import type { PlayerTheme } from '../lib/playerThemes'

/**
 * Full-screen backdrop for the player screens. The Grab art is two images:
 * a portrait one for phones and a landscape one for laptops. Both keep their
 * middle clear, so the board and cards sit on the calm centre and the athletes
 * frame the edges. Fixed, so it does not scroll away behind a tall board.
 */
export function PlayerBackdrop({ theme }: { theme: PlayerTheme }) {
  if (theme !== 'grab') return <ParticleBackground />
  return (
    <div aria-hidden className="fixed inset-0 z-0 pointer-events-none bg-[#0b3d22]">
      <picture>
        <source media="(min-aspect-ratio: 1/1)" srcSet="/grab/arena-laptop.webp" />
        <img
          src="/grab/arena-phone.webp"
          alt=""
          className="w-full h-full object-cover object-center"
          draggable={false}
        />
      </picture>
      {/* Scrim: the art is bright at the top and bottom edges, which is where
          the header and legend sit. Darken just those bands. */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgba(2,24,12,0.82) 0, rgba(2,24,12,0.55) 140px, rgba(2,24,12,0) 320px, rgba(2,24,12,0) calc(100% - 200px), rgba(2,24,12,0.7) 100%)' }}
      />
    </div>
  )
}
