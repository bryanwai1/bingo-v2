import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBingoAuth } from '../hooks/useBingoAuth'
import { ParticleBackground } from '../components/ParticleBackground'

/**
 * Crew join page — `/bingo-dash/join-crew/:code`.
 *
 * The event-day front door for facilitators. They open the link, type their
 * name and the PIN, and land in the admin working on the HOST'S boards:
 * same teams, same scans, same scoreboard the organiser sees.
 *
 * No email, no password, no approval queue. The login is an anonymous Supabase
 * user attached to the host tenant via `facilitator_host`, expiring with the
 * pass (see supabase/accounts-tenancy/20260729_facilitator_sessions.sql).
 */

interface SessionInfo {
  label: string | null
  host_label: string | null
  expires_at: string | null
  state: 'ok' | 'not_found' | 'expired' | 'revoked' | 'full'
}

const BLOCKED_COPY: Record<string, { emoji: string; title: string; body: string }> = {
  not_found: {
    emoji: '🔍', title: 'Link not recognised',
    body: 'Double-check the link with the organiser — it may have a typo, or the session may have been deleted.',
  },
  expired: {
    emoji: '⌛', title: 'This session has ended',
    body: 'The pass has expired. Ask the organiser for a fresh link if the event is still running.',
  },
  revoked: {
    emoji: '🚫', title: 'This session was closed',
    body: 'The organiser ended this session. Ask them for a new link if you still need access.',
  },
  full: {
    emoji: '🎫', title: 'All seats taken',
    body: 'This session has reached its facilitator limit. Ask the organiser to add more seats.',
  },
}

/** Postgres RAISE EXCEPTION codes → what a facilitator should actually read. */
const REDEEM_ERRORS: Record<string, string> = {
  BAD_PIN: 'That PIN is not right — check it with the organiser.',
  INVALID_CODE: 'This link is not valid any more.',
  EXPIRED: 'This session has already ended.',
  REVOKED: 'The organiser closed this session.',
  FULL: 'All facilitator seats for this session are taken.',
  OWNER_CANNOT_JOIN: "You're signed in as the main account — you already have full access.",
  ALREADY_TENANT: 'This device is signed in to its own admin account. Sign out first, then open the link again.',
  NOT_SIGNED_IN: 'Could not start your session. Please try again.',
  NO_ACCOUNT: 'Could not start your session. Please try again.',
}

function friendlyError(message: string): string {
  for (const [code, copy] of Object.entries(REDEEM_ERRORS)) {
    if (message.includes(code)) return copy
  }
  if (/anonymous/i.test(message)) {
    return 'Guest logins are switched off for this site. The organiser needs to enable Anonymous sign-ins in Supabase.'
  }
  return message
}

export function BingoDashJoinCrew() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { session, account, loading: authLoading, isOwner, signInAnonymously, refreshAccount, signOut } = useBingoAuth()

  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error: rpcError } = await supabase.rpc('facilitator_session_info', { p_code: code })
      if (!active) return
      if (rpcError) {
        setError(rpcError.message)
      } else {
        // The function returns a single-row table.
        const row = Array.isArray(data) ? data[0] : data
        setInfo((row as SessionInfo) ?? { label: null, host_label: null, expires_at: null, state: 'not_found' })
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [code])

  const join = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      // A helper arriving fresh has no session at all; one returning mid-event
      // still has their anonymous login, so reuse it rather than stacking up
      // a second throwaway account.
      if (!session) await signInAnonymously()
      const { error: rpcError } = await supabase.rpc('redeem_facilitator_session', {
        p_code: code,
        p_pin: pin.trim(),
        p_name: name.trim() || null,
      })
      if (rpcError) throw new Error(rpcError.message)
      await refreshAccount()
      navigate('/bingo-dash/admin', { replace: true })
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'Could not join'))
      setBusy(false)
    }
  }, [session, signInAnonymously, code, pin, name, refreshAccount, navigate])

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center relative overflow-hidden px-4">
      <ParticleBackground />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  )

  if (loading || authLoading) {
    return (
      <Shell>
        <p className="text-gray-400 text-center font-bold animate-pulse">Loading session…</p>
      </Shell>
    )
  }

  if (info && info.state !== 'ok') {
    const copy = BLOCKED_COPY[info.state] ?? BLOCKED_COPY.not_found
    return (
      <Shell>
        <div className="text-center">
          <div className="text-5xl mb-4">{copy.emoji}</div>
          <h1 className="text-white text-2xl font-black mb-2">{copy.title}</h1>
          <p className="text-gray-400 text-sm">{copy.body}</p>
        </div>
      </Shell>
    )
  }

  // The organiser opening their own crew link would only confuse things —
  // send them straight to the admin instead of offering to demote themselves.
  if (isOwner) {
    return (
      <Shell>
        <div className="text-center">
          <div className="text-5xl mb-4">👑</div>
          <h1 className="text-white text-2xl font-black mb-2">You're the organiser</h1>
          <p className="text-gray-400 text-sm mb-6">
            This link is for your facilitators. You already have full access.
          </p>
          <button onClick={() => navigate('/bingo-dash/admin')}
            className="px-5 py-3 rounded-2xl text-white font-black uppercase tracking-wider text-sm bg-purple-600 hover:bg-purple-500 active:scale-95 transition-all">
            Go to admin
          </button>
        </div>
      </Shell>
    )
  }

  // Someone already on this pass just gets waved through — reopening the link
  // after locking their phone is the most common thing that happens all day.
  const alreadyIn = !!account?.facilitator_host && !!account.access_expires_at &&
    new Date(account.access_expires_at).getTime() > Date.now()

  return (
    <Shell>
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">🎪</div>
        <h1 className="text-white text-3xl font-black tracking-tight leading-tight">
          {info?.label ?? 'Event session'}
        </h1>
        <p className="text-gray-400 text-sm mt-2">
          Facilitator access {info?.host_label ? <>for <b className="text-gray-300">{info.host_label}</b></> : null}
        </p>
        {info?.expires_at && (
          <p className="text-gray-500 text-xs mt-1">
            Access ends {new Date(info.expires_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        {alreadyIn && (
          <>
            <button onClick={() => navigate('/bingo-dash/admin')}
              className="w-full py-3.5 rounded-2xl font-black uppercase tracking-wider text-sm bg-green-500 text-gray-900 hover:bg-green-400 active:scale-95 transition-all">
              Continue as {account?.display_name || 'facilitator'}
            </button>
            <div className="flex items-center gap-3 my-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-gray-500 text-xs font-bold uppercase tracking-widest">or join again</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
          </>
        )}

        <form onSubmit={join} className="flex flex-col gap-3">
          <input
            type="text" required value={name} maxLength={40} autoComplete="name"
            onChange={e => setName(e.target.value)} placeholder="Your name"
            className="w-full px-4 py-3 rounded-2xl bg-black/30 border-2 border-white/15 text-white placeholder-white/30 focus:border-purple-500 outline-none transition-colors"
          />
          <input
            type="text" required value={pin}
            inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="one-time-code"
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="4-digit PIN"
            className="w-full px-4 py-3 rounded-2xl bg-black/30 border-2 border-white/15 text-white placeholder-white/30 focus:border-purple-500 outline-none transition-colors tracking-[0.5em] text-center font-black"
          />
          {error && <p className="text-red-400 text-sm font-bold text-center">{error}</p>}
          <button
            type="submit" disabled={busy || pin.length < 4}
            className="w-full py-3.5 rounded-2xl text-white font-black uppercase tracking-wider bg-purple-600 hover:bg-purple-500 active:scale-95 transition-all disabled:opacity-50"
          >
            {busy ? 'Joining…' : 'Join as facilitator'}
          </button>
        </form>

        {session && !alreadyIn && (
          <button onClick={() => signOut()}
            className="w-full text-center text-xs text-gray-500 hover:text-white mt-4 transition-colors">
            Not you? Sign out first
          </button>
        )}
      </div>

      <p className="text-gray-600 text-xs text-center mt-4 px-4">
        You'll be able to score teams, run the games and see the live scoreboard.
      </p>
    </Shell>
  )
}
