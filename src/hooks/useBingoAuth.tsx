import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { BingoAccount } from '../types/database'

interface BingoAuthValue {
  session: Session | null
  account: BingoAccount | null
  /** Host account row when this login is a facilitator (facilitator_host set). */
  hostAccount: BingoAccount | null
  loading: boolean
  isOwner: boolean
  isApproved: boolean
  isFacilitator: boolean
  /** access_expires_at has passed — RequireBingoAdmin shows the expired gate. */
  isExpired: boolean
  /**
   * The owner_id value this session reads/writes tenant rows with:
   * owner -> null (house data), facilitator -> the host tenant's value
   * (null when the host is the owner), sub -> own uid.
   */
  workingOwnerValue: string | null
  /**
   * Support mode: the owner is working as this tenant. While set, `account`,
   * `isOwner` and `workingOwnerValue` describe the TENANT, so every admin page
   * shows exactly what they see. The database still knows the real owner.
   */
  supportFor: BingoAccount | null
  /** The signed-in login really is the owner, support mode or not. */
  realIsOwner: boolean
  enterSupport: (tenant: BingoAccount) => void
  exitSupport: () => void
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signInWithGoogle: (redirectTo?: string) => Promise<void>
  /** Event-pass crew logins: no email, no password, no approval queue. */
  signInAnonymously: () => Promise<void>
  signOut: () => Promise<void>
  refreshAccount: () => Promise<void>
}

const BingoAuthContext = createContext<BingoAuthValue | null>(null)
const SUPPORT_KEY = 'bingo-dash-support-tenant'

export function BingoAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [account, setAccount] = useState<BingoAccount | null>(null)
  const [hostAccount, setHostAccount] = useState<BingoAccount | null>(null)
  const [loading, setLoading] = useState(true)
  // Per tab, so a second tab stays on the owner's own boards.
  const [supportTenant, setSupportTenant] = useState<BingoAccount | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(SUPPORT_KEY) ?? 'null') } catch { return null }
  })
  const enterSupport = useCallback((tenant: BingoAccount) => {
    sessionStorage.setItem(SUPPORT_KEY, JSON.stringify(tenant))
    setSupportTenant(tenant)
  }, [])
  const exitSupport = useCallback(() => {
    sessionStorage.removeItem(SUPPORT_KEY)
    setSupportTenant(null)
  }, [])

  const loadAccount = useCallback(async (userId: string | undefined) => {
    if (!userId) { setAccount(null); setHostAccount(null); return }
    const { data } = await supabase
      .from('bingo_accounts')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    const acct = (data as BingoAccount) ?? null
    // Facilitators need the host row before workingOwnerValue is trustworthy,
    // so fetch it here — the initial-load gate keeps loading=true until then.
    if (acct?.facilitator_host) {
      const { data: host } = await supabase
        .from('bingo_accounts')
        .select('*')
        .eq('id', acct.facilitator_host)
        .maybeSingle()
      setHostAccount((host as BingoAccount) ?? null)
    } else {
      setHostAccount(null)
    }
    setAccount(acct)
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      // getSession() can throw a transient Navigator LockManager error when
      // another tab of the app steals the auth-token lock; retry, and always
      // resolve the loading gate so the admin never hangs on "Loading...".
      let initialSession: Session | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data } = await supabase.auth.getSession()
          initialSession = data.session
          break
        } catch {
          await new Promise((r) => setTimeout(r, 500))
        }
      }
      if (!active) return
      setSession(initialSession)
      try {
        await loadAccount(initialSession?.user.id)
      } catch {
        // leave account null; RequireBingoAdmin will show the login gate
      }
      if (active) setLoading(false)
    })()

    // NEVER run supabase queries synchronously inside this callback:
    // auth-js emits events (SIGNED_IN on every tab refocus, TOKEN_REFRESHED)
    // while holding the auth lock and AWAITS subscribers, so a query here
    // waits for the lock the emitter still holds — a permanent deadlock that
    // silently hangs every later request in the tab (create/duplicate/start
    // game all stop working). Defer to a macrotask so the callback returns
    // and the lock is released before loadAccount touches the client.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setTimeout(() => {
        loadAccount(newSession?.user.id).catch(() => {
          // transient fetch failure; keep previous account state
        })
      }, 0)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [loadAccount])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }, [])

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) throw error
    // When email confirmation is ON, Supabase returns a user with no active session.
    return { needsConfirmation: !data.session }
  }, [])

  const signInWithGoogle = useCallback(async (redirectTo?: string) => {
    // Default to the page the login gate rendered on, so Flag Retrieval's
    // /admin comes back to /admin instead of the bingo admin.
    const path = redirectTo ?? window.location.pathname
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${path}` },
    })
    if (error) throw error
  }, [])

  const signInAnonymously = useCallback(async () => {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    // The join page redeems the pass immediately after this resolves, so the
    // account row must exist by then. onAuthStateChange defers loadAccount to
    // a macrotask (see below), which is too late — load it inline instead.
    setSession(data.session)
    await loadAccount(data.session?.user.id)
  }, [loadAccount])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setAccount(null)
    setHostAccount(null)
  }, [])

  const refreshAccount = useCallback(() => loadAccount(session?.user.id), [loadAccount, session])

  const isFacilitator = !!account?.facilitator_host
  const realIsOwner = account?.role === 'owner' && account?.status === 'approved'
  // Only the real owner can be in support mode; a stale value is ignored.
  const supportFor = realIsOwner ? supportTenant : null
  const value: BingoAuthValue = supportFor ? {
    session,
    account: supportFor,
    hostAccount: null,
    loading,
    isOwner: false,
    isApproved: true,
    isFacilitator: false,
    isExpired: false,
    workingOwnerValue: supportFor.id,
    supportFor, realIsOwner, enterSupport, exitSupport,
    signInWithPassword, signUpWithPassword, signInWithGoogle, signInAnonymously, signOut, refreshAccount,
  } : {
    session,
    account,
    hostAccount,
    loading,
    isOwner: realIsOwner,
    isApproved: account?.status === 'approved',
    isFacilitator,
    isExpired: !!account?.access_expires_at && new Date(account.access_expires_at).getTime() <= Date.now(),
    supportFor: null, realIsOwner, enterSupport, exitSupport,
    workingOwnerValue: !account
      ? null
      : account.role === 'owner'
        ? null
        : account.facilitator_host
          ? (hostAccount?.role === 'owner' ? null : account.facilitator_host)
          : account.id,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    signInAnonymously,
    signOut,
    refreshAccount,
  }

  return (
    <BingoAuthContext.Provider value={value}>
      {children}
      {supportFor && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-4 py-2 rounded-2xl bg-amber-400 text-black shadow-lg max-w-[92vw]">
          <span className="text-xs font-black truncate">Support mode: you are editing {supportFor.email ?? 'a client'}'s boards</span>
          <button
            onClick={() => { exitSupport(); window.location.assign('/bingo-dash/accounts') }}
            className="px-3 py-1 rounded-xl text-xs font-black bg-black text-white hover:bg-black/80 flex-shrink-0">
            Exit
          </button>
        </div>
      )}
    </BingoAuthContext.Provider>
  )
}

export function useBingoAuth(): BingoAuthValue {
  const ctx = useContext(BingoAuthContext)
  if (!ctx) throw new Error('useBingoAuth must be used within a BingoAuthProvider')
  return ctx
}
