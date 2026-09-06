import { useState, useEffect, useRef } from 'react'
import type { TribeResult } from '../hooks/useCurrentTeam'
import { T, useT } from './T'
import { LanguageToggle } from './LanguageToggle'

interface TeamRegistrationProps {
  onCreateTribe: (tribeName: string, memberName: string, password: string) => Promise<unknown>
  onJoinTribe: (teamId: string, memberName: string, password: string) => Promise<unknown>
  onSearchTribes: (query: string) => Promise<TribeResult[]>
  hexCode: string
  taskTitle: string
}

type Step =
  | 'list'             // pick a tribe
  | 'enter-name'       // type your name
  | 'reveal-password'  // show tribe code to memorise → auto-joins on confirm
  | 'create-tribe'     // (settings path) name a new tribe
  | 'created'          // show generated code → auto-creates

export function TeamRegistration({
  onCreateTribe,
  onJoinTribe,
  onSearchTribes,
  hexCode,
  taskTitle,
}: TeamRegistrationProps) {
  const [step, setStep] = useState<Step>('list')
  const [tribeName, setTribeName] = useState('')
  const [createdPassword, setCreatedPassword] = useState('')
  const [selectedTribe, setSelectedTribe] = useState<TribeResult | null>(null)
  const [memberNameInput, setMemberNameInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [tribes, setTribes] = useState<TribeResult[]>([])
  const [tribesLoading, setTribesLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [tribeNameTaken, setTribeNameTaken] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tribeNamePlaceholder = useT('Tribe name...')
  const searchTribesPlaceholder = useT('Search tribes...')
  const tribeFullMsg = useT('That tribe is already full. Pick another one.')
  const joinFailedMsg = useT('Failed to join tribe')

  // Load all tribes on enter list step
  useEffect(() => {
    if (step === 'list') {
      setTribesLoading(true)
      onSearchTribes('').then((results) => {
        setTribes(results)
        setTribesLoading(false)
      })
    }
  }, [step])

  // Debounced search
  useEffect(() => {
    if (step !== 'list') return
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setTribesLoading(true)
      onSearchTribes(searchQuery).then((results) => {
        setTribes(results)
        setTribesLoading(false)
      })
    }, 300)
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [searchQuery])

  // ── Join: pick tribe → enter password → enter name ───────────────
  const handleSelectTribe = (tribe: TribeResult) => {
    setSelectedTribe(tribe)
    setMemberNameInput('')
    setError('')
    setStep('enter-name')
  }

  // Auto-join using the tribe's own password — participant never types it.
  const handleEnterGame = async () => {
    if (!selectedTribe) return
    setSubmitting(true)
    setError('')
    try {
      await onJoinTribe(selectedTribe.id, memberNameInput.trim(), selectedTribe.password)
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'TRIBE_FULL') {
        setError(tribeFullMsg)
        setStep('list')
      } else {
        setError(err instanceof Error ? err.message : joinFailedMsg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Create (settings path): tribe name → code → your name ────────
  const handleCheckTribeName = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tribeName.trim()) return
    const password = String(Math.floor(1000 + Math.random() * 9000))
    setCreatedPassword(password)
    setTribeNameTaken(false)
    setError('')
    setStep('created')
  }

  // Confirming the generated code auto-creates the tribe with an empty creator
  // name — the hook auto-fills "Member 1" for the creator.
  const handleConfirmCreatedCode = async () => {
    setSubmitting(true)
    setError('')
    try {
      await onCreateTribe(tribeName.trim(), '', createdPassword)
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'TRIBE_NAME_TAKEN') {
        setTribeNameTaken(true)
        setStep('create-tribe')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create tribe')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Step: tribe list (default) ───────────────────────────────────
  if (step === 'list') {
    return (
      <Wrapper hexCode={hexCode}>
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full animate-bounce-in flex flex-col" style={{ maxHeight: '85vh' }}>
          <Flag hexCode={hexCode} />
          <p className="text-xs font-bold text-center uppercase tracking-widest mb-1" style={{ color: hexCode }}>
            <T>{taskTitle}</T>
          </p>
          <h1 className="text-2xl font-black text-center text-gray-900 mb-1"><T>Pick your tribe</T></h1>
          <p className="text-gray-400 text-center text-sm mb-5"><T>Find your tribe, then enter the code to join</T></p>

          {/* Search */}
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchTribesPlaceholder}
              className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 font-medium focus:outline-none transition-colors"
              style={{ borderColor: searchQuery ? hexCode : '#e5e7eb' }}
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center mb-3">{error}</p>}

          {/* Tribe list */}
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {tribesLoading ? (
              <p className="text-center text-gray-400 py-8 animate-pulse"><T>Searching...</T></p>
            ) : tribes.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 font-medium"><T>No tribes found</T></p>
                <p className="text-gray-300 text-sm mt-1">
                  <T>{searchQuery ? 'Try a different search' : 'Ask your facilitator, or start one in settings below.'}</T>
                </p>
              </div>
            ) : (
              tribes.map((tribe) => (
                <button
                  key={tribe.id}
                  onClick={() => handleSelectTribe(tribe)}
                  disabled={submitting}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 border-gray-100 hover:border-current transition-colors text-left disabled:opacity-50"
                  style={{ color: hexCode }}
                >
                  <div>
                    <p className="font-bold text-gray-800">{tribe.name}</p>
                    <p className="text-xs text-gray-400">
                      {tribe.memberCount} <T>members</T>
                    </p>
                  </div>
                  <span
                    className="px-4 py-2 rounded-xl a-text text-sm font-black shrink-0"
                    style={{ backgroundColor: hexCode }}
                  >
                    <T>Join</T>
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Settings: start a new tribe — kept available but de-emphasised so
              participants aren't tempted to create their own when tribes are
              already pre-set by the admin. */}
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => { setTribeName(''); setTribeNameTaken(false); setError(''); setStep('create-tribe') }}
              className="text-[11px] text-gray-300 hover:text-gray-500 transition-colors py-1 px-2"
            >
              <T>Start a new tribe</T>
            </button>
          </div>
        </div>
      </Wrapper>
    )
  }

  // ── Step: enter name (join flow) ────────────────────────────────
  if (step === 'enter-name') {
    return (
      <Wrapper hexCode={hexCode}>
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full animate-bounce-in">
          <Flag hexCode={hexCode} />
          <h1 className="text-2xl font-black text-center text-gray-900 mb-1"><T>What's your name?</T></h1>
          <p className="font-bold text-center text-lg mb-5" style={{ color: hexCode }}>{selectedTribe?.name}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!memberNameInput.trim()) return
              setError('')
              setStep('reveal-password')
            }}
            className="flex flex-col gap-4"
          >
            <input
              type="text"
              value={memberNameInput}
              onChange={(e) => setMemberNameInput(e.target.value)}
              placeholder="Your name"
              className="w-full px-5 py-4 rounded-2xl border-2 text-xl font-medium focus:outline-none transition-colors text-center"
              style={{ borderColor: memberNameInput.trim() ? hexCode : '#e5e7eb' }}
              autoFocus
              maxLength={40}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <PrimaryButton hexCode={hexCode} disabled={!memberNameInput.trim()}>
              <T>Next →</T>
            </PrimaryButton>
          </form>
          <BackButton onClick={() => { setStep('list'); setMemberNameInput('') }} />
        </div>
      </Wrapper>
    )
  }

  // ── Step: reveal password ────────────────────────────────────────
  if (step === 'reveal-password') {
    const pw = selectedTribe?.password ?? ''
    return (
      <Wrapper hexCode={hexCode}>
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full animate-bounce-in">
          <Flag hexCode={hexCode} />
          <h1 className="text-2xl font-black text-center text-gray-900 mb-1"><T>Your Tribe Code</T></h1>
          <p className="font-bold text-center text-lg mb-5" style={{ color: hexCode }}>{selectedTribe?.name}</p>

          {/* Big code digits */}
          <div className="flex justify-center gap-3 mb-5">
            {pw.split('').map((digit, i) => (
              <div
                key={i}
                className="w-16 h-20 rounded-2xl flex items-center justify-center text-4xl font-black a-text select-all"
                style={{ backgroundColor: hexCode, boxShadow: `0 6px 20px ${hexCode}55` }}
              >
                {digit}
              </div>
            ))}
          </div>

          {/* Remember banner */}
          <div
            className="flex items-start gap-3 rounded-2xl px-4 py-4 mb-6"
            style={{ backgroundColor: `${hexCode}15` }}
          >
            <span className="text-2xl leading-none">⚠️</span>
            <div>
              <p className="font-black text-gray-900 text-sm uppercase tracking-wide mb-1">
                <T>Remember this code!</T>
              </p>
              <p className="text-gray-500 text-sm leading-snug">
                <T>You'll need it to log back in if you open this page on a new device.</T>
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-center justify-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
              <span>🚫</span>
              <p className="text-red-600 font-bold text-sm">{error}</p>
            </div>
          )}

          <PrimaryButton hexCode={hexCode} onClick={handleEnterGame} loading={submitting}>
            <T>{submitting ? 'Joining...' : "I've noted it — Enter Game 🏴"}</T>
          </PrimaryButton>
          <BackButton onClick={() => { setStep('enter-name'); setError('') }} />
        </div>
      </Wrapper>
    )
  }

  // ── Step: name the tribe (create flow) ───────────────────────────
  if (step === 'create-tribe') {
    return (
      <Wrapper hexCode={hexCode}>
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full animate-bounce-in">
          <Flag hexCode={hexCode} />
          <h1 className="text-2xl font-black text-center text-gray-900 mb-1"><T>Name your tribe</T></h1>
          <p className="text-gray-400 text-center text-sm mb-7">
            <T>You'll be the creator. Others can join with the code.</T>
          </p>
          <form onSubmit={handleCheckTribeName} className="flex flex-col gap-4">
            <input
              type="text"
              value={tribeName}
              onChange={(e) => { setTribeName(e.target.value); setTribeNameTaken(false) }}
              placeholder={tribeNamePlaceholder}
              className="w-full px-5 py-4 rounded-2xl border-2 text-xl font-medium focus:outline-none transition-colors text-center"
              style={{
                borderColor: tribeNameTaken ? '#ef4444' : tribeName ? hexCode : '#e5e7eb',
                backgroundColor: tribeNameTaken ? '#fef2f2' : undefined,
              }}
              autoFocus
              maxLength={40}
            />
            {tribeNameTaken && (
              <div className="flex items-center justify-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <span>🚫</span>
                <div>
                  <p className="text-red-600 font-bold text-sm leading-tight">"{tribeName}" <T>is already taken</T></p>
                  <p className="text-red-400 text-xs"><T>Try a different tribe name</T></p>
                </div>
              </div>
            )}
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <PrimaryButton hexCode={hexCode} disabled={!tribeName.trim()}>
              <T>Next →</T>
            </PrimaryButton>
          </form>
          <BackButton onClick={() => setStep('list')} />
        </div>
      </Wrapper>
    )
  }

  // ── Step: show generated tribe code ──────────────────────────────
  if (step === 'created') {
    return (
      <Wrapper hexCode={hexCode}>
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full animate-bounce-in">
          <Flag hexCode={hexCode} />
          <h1 className="text-2xl font-black text-center text-gray-900 mb-1"><T>Tribe Code Ready!</T> 🔐</h1>
          <p className="font-bold text-center text-lg mb-1" style={{ color: hexCode }}>{tribeName}</p>
          <p className="text-gray-400 text-center text-sm mb-6">
            <T>Share this code with your teammates so they can join</T>
          </p>

          <div className="flex justify-center gap-3 mb-6">
            {createdPassword.split('').map((digit, i) => (
              <div
                key={i}
                className="w-14 h-16 rounded-2xl flex items-center justify-center text-3xl font-black a-text select-all"
                style={{ backgroundColor: hexCode, boxShadow: `0 6px 16px ${hexCode}44` }}
              >
                {digit}
              </div>
            ))}
          </div>

          <div
            className="text-center text-xs font-bold uppercase tracking-wider mb-6 py-2 px-4 rounded-xl"
            style={{ backgroundColor: `${hexCode}15`, color: hexCode }}
          >
            <T>Members need this code to join</T>
          </div>

          {error && <p className="text-red-500 text-sm text-center mb-3">{error}</p>}

          <PrimaryButton hexCode={hexCode} onClick={handleConfirmCreatedCode} loading={submitting}>
            <T>{submitting ? 'Creating...' : 'Create Tribe & Start →'}</T>
          </PrimaryButton>
          <BackButton onClick={() => setStep('create-tribe')} />
        </div>
      </Wrapper>
    )
  }

  return null
}

// ── Shared sub-components ────────────────────────────────────────────

function Wrapper({ hexCode, children }: { hexCode: string; children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{ background: `linear-gradient(135deg, ${hexCode}22, ${hexCode}44)` }}
    >
      <div className="absolute top-4 right-4 z-20">
        <LanguageToggle variant="light" />
      </div>
      {children}
    </div>
  )
}

function Flag({ hexCode }: { hexCode: string }) {
  return (
    <div
      className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center animate-wiggle"
      style={{ backgroundColor: hexCode, boxShadow: `0 8px 24px ${hexCode}44` }}
    >
      <span className="text-2xl">🚩</span>
    </div>
  )
}

function PrimaryButton({
  hexCode,
  disabled,
  loading,
  children,
  onClick,
}: {
  hexCode: string
  disabled?: boolean
  loading?: boolean
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      disabled={disabled || loading}
      onClick={onClick}
      className="w-full py-4 rounded-2xl a-text font-black text-xl transition-all duration-200 disabled:opacity-40 hover:scale-105 active:scale-95"
      style={{ backgroundColor: hexCode, boxShadow: `0 8px 24px ${hexCode}44` }}
    >
      {children}
    </button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
    >
      ← <T>Back</T>
    </button>
  )
}
