import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** True when this browser holds a signed-in, approved Bingo Dash admin session. Public pages use it to reveal admin-only controls. */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const uid = data.session?.user.id
        if (!uid) return
        const { data: acct } = await supabase.from('bingo_accounts').select('status').eq('id', uid).maybeSingle()
        if (active && acct?.status === 'approved') setIsAdmin(true)
      } catch { /* stay view-only */ }
    })()
    return () => { active = false }
  }, [])
  return isAdmin
}
