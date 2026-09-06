import type { ReactNode } from 'react'
import { useBingoAuth } from '../hooks/useBingoAuth'
import { BingoDashLogin } from '../pages/BingoDashLogin'

function Gate({ emoji, title, body, email, onSignOut }: {
  emoji: string; title: string; body: string; email?: string | null; onSignOut: () => void
}) {
  return (
    <div className="min-h-screen a-bg flex flex-col items-center justify-center text-center px-6">
      <div className="max-w-sm">
        <div className="text-5xl mb-4">{emoji}</div>
        <h2 className="a-text text-2xl font-black mb-2">{title}</h2>
        <p className="text-gray-400 text-sm mb-2">{body}</p>
        {email && <p className="text-gray-500 text-xs mb-6">Signed in as {email}</p>}
        <button
          onClick={onSignOut}
          className="px-5 py-2.5 rounded-2xl a-text font-bold text-sm border border-white/20 hover:a-surface-2 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

/** Gates a route behind an approved account, optionally for a specific game. */
export function RequireBingoAdmin({ children, ownerOnly = false, game }: {
  children: ReactNode
  ownerOnly?: boolean
  game?: 'bingo' | 'flag'
}) {
  const { session, account, loading, isOwner, isExpired, signOut } = useBingoAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center a-bg">
        <div className="text-gray-400 text-xl font-bold animate-pulse">Loading…</div>
      </div>
    )
  }

  if (!session) return <BingoDashLogin />

  if (!account || account.status === 'pending') {
    return <Gate
      emoji="⏳" title="Waiting for approval"
      body="Your account was created. An admin needs to approve your access before you can manage boards."
      email={session.user.email} onSignOut={signOut}
    />
  }

  if (isExpired) {
    return <Gate
      emoji="⌛" title="Access expired"
      body="Your temporary access has ended. Ask the event organizer to extend it if you still need to help out."
      email={session.user.email} onSignOut={signOut}
    />
  }

  if (account.status === 'rejected') {
    return <Gate
      emoji="🚫" title="Access not granted"
      body="Your account isn't approved for admin access. Contact the main account holder if you think this is a mistake."
      email={session.user.email} onSignOut={signOut}
    />
  }

  if (ownerOnly && !isOwner) {
    return <Gate
      emoji="🔒" title="Owner only"
      body="This area is limited to the main account holder."
      email={session.user.email} onSignOut={signOut}
    />
  }

  if (game && !isOwner && !(game === 'bingo' ? account.can_bingo : account.can_flag)) {
    return <Gate
      emoji="🎟️" title="No access to this game"
      body={`Your account isn't enabled for ${game === 'bingo' ? 'Bingo Dash' : 'Flag Retrieval'}. Contact the main account holder to switch it on.`}
      email={session.user.email} onSignOut={signOut}
    />
  }

  return <>{children}</>
}
