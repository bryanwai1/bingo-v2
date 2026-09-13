import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Outlet, Navigate, useParams } from 'react-router-dom'
import { BingoAuthProvider } from './hooks/useBingoAuth'
import { RequireBingoAdmin } from './components/RequireBingoAdmin'

const InstructionsSlide     = lazy(() => import('./pages/InstructionsSlide').then(m => ({ default: m.InstructionsSlide })))
const InstructionsHub       = lazy(() => import('./pages/InstructionsHub').then(m => ({ default: m.InstructionsHub })))
const EventSlide            = lazy(() => import('./pages/EventSlide').then(m => ({ default: m.EventSlide })))
const GroupingSlide         = lazy(() => import('./pages/GroupingSlide').then(m => ({ default: m.GroupingSlide })))
const BingoDashHub          = lazy(() => import('./pages/BingoDashHub').then(m => ({ default: m.BingoDashHub })))
const BingoDashHome         = lazy(() => import('./pages/BingoDashHome').then(m => ({ default: m.BingoDashHome })))
const BingoDashParticipant  = lazy(() => import('./pages/BingoDashParticipant').then(m => ({ default: m.BingoDashParticipant })))
// Keyed on the card id so a chained card's "Go to / Next" button, which
// navigates card -> card inside the app, gets a fresh page rather than the
// previous card's scan record, staged files and answers.
function ParticipantRoute() {
  const { taskId } = useParams<{ taskId: string }>()
  return <BingoDashParticipant key={taskId} />
}
const BingoDashAdmin        = lazy(() => import('./pages/BingoDashAdmin').then(m => ({ default: m.BingoDashAdmin })))
const BingoDashTaskEdit     = lazy(() => import('./pages/BingoDashTaskEdit').then(m => ({ default: m.BingoDashTaskEdit })))
const BingoDashCube         = lazy(() => import('./pages/BingoDashCube').then(m => ({ default: m.BingoDashCube })))
const BingoDashProjector    = lazy(() => import('./pages/BingoDashProjector').then(m => ({ default: m.BingoDashProjector })))
const BingoDashJoin         = lazy(() => import('./pages/BingoDashJoin').then(m => ({ default: m.BingoDashJoin })))
const BingoDashSample       = lazy(() => import('./pages/BingoDashSample').then(m => ({ default: m.BingoDashSample })))
const BingoDashColmarIntro  = lazy(() => import('./pages/BingoDashColmarIntro').then(m => ({ default: m.BingoDashColmarIntro })))
const BingoDashSlidesHub    = lazy(() => import('./pages/BingoDashSlidesHub').then(m => ({ default: m.BingoDashSlidesHub })))
const BingoDashAwardSlides  = lazy(() => import('./pages/BingoDashAwardSlides').then(m => ({ default: m.BingoDashAwardSlides })))
const BingoDashAwardAdmin   = lazy(() => import('./pages/BingoDashAwardAdmin').then(m => ({ default: m.BingoDashAwardAdmin })))
const BingoDashBriefingSlides = lazy(() => import('./pages/BingoDashBriefingSlides').then(m => ({ default: m.BingoDashBriefingSlides })))
const BingoDashTeamMembers  = lazy(() => import('./pages/BingoDashTeamMembers').then(m => ({ default: m.BingoDashTeamMembers })))
const BingoDashAllTeamsMembers = lazy(() => import('./pages/BingoDashAllTeamsMembers').then(m => ({ default: m.BingoDashAllTeamsMembers })))
const BingoDashAccounts     = lazy(() => import('./pages/BingoDashAccounts').then(m => ({ default: m.BingoDashAccounts })))
const BingoDashJoinCrew     = lazy(() => import('./pages/BingoDashJoinCrew').then(m => ({ default: m.BingoDashJoinCrew })))
const BingoDashCrew         = lazy(() => import('./pages/BingoDashCrew').then(m => ({ default: m.BingoDashCrew })))
const BingoDashAccount      = lazy(() => import('./pages/BingoDashAccount').then(m => ({ default: m.BingoDashAccount })))
const BingoDashEvents       = lazy(() => import('./pages/BingoDashEvents').then(m => ({ default: m.BingoDashEvents })))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<BingoDashHub />} />
          <Route path="/instructions" element={<InstructionsHub />} />
          <Route path="/instructions/:deckId" element={<InstructionsSlide />} />
          <Route path="/event" element={<EventSlide />} />
          <Route path="/event/grouping" element={<GroupingSlide />} />

          <Route path="/bingo-dash" element={<BingoDashHome />} />
          <Route path="/bingo-dash/task/:taskId" element={<ParticipantRoute />} />

          {/* Admin subtree — gated behind an approved Bingo Dash account */}
          <Route element={<BingoAuthProvider><Outlet /></BingoAuthProvider>}>
            <Route path="/bingo-dash/admin" element={<RequireBingoAdmin game="bingo"><BingoDashAdmin /></RequireBingoAdmin>} />
            <Route path="/bingo-dash/admin/task/:taskId" element={<RequireBingoAdmin game="bingo"><BingoDashTaskEdit /></RequireBingoAdmin>} />
            <Route path="/bingo-dash/accounts" element={<RequireBingoAdmin ownerOnly><BingoDashAccounts /></RequireBingoAdmin>} />
            <Route path="/bingo-dash/crew" element={<RequireBingoAdmin><BingoDashCrew /></RequireBingoAdmin>} />
            <Route path="/bingo-dash/account" element={<RequireBingoAdmin><BingoDashAccount /></RequireBingoAdmin>} />
            <Route path="/bingo-dash/events" element={<RequireBingoAdmin><BingoDashEvents /></RequireBingoAdmin>} />
            <Route path="/bingo-dash/login" element={<RequireBingoAdmin><Navigate to="/bingo-dash/admin" replace /></RequireBingoAdmin>} />
            {/* Crew pass landing — deliberately NOT gated: helpers arrive
                signed out and the page signs them in itself */}
            <Route path="/bingo-dash/join-crew/:code" element={<BingoDashJoinCrew />} />
          </Route>

          <Route path="/bingo-dash/cube" element={<BingoDashCube />} />
        <Route path="/bingo-dash/cube/:slug" element={<BingoDashCube />} />
        <Route path="/bingo-dash/projector" element={<BingoDashProjector />} />
          <Route path="/bingo-dash/projector/:sectionSlug" element={<BingoDashProjector />} />
          <Route path="/bingo-dash/play/:sectionSlug" element={<BingoDashJoin />} />
          <Route path="/bingo-dash/sample" element={<BingoDashSample />} />
          <Route path="/bingo-dash/colmar-intro" element={<BingoDashColmarIntro />} />
          <Route path="/bingo-dash/slides" element={<BingoDashSlidesHub />} />
          <Route path="/bingo-dash/slides/awards" element={<BingoDashAwardSlides />} />
          <Route path="/bingo-dash/slides/awards/:sectionSlug" element={<BingoDashAwardSlides />} />
          <Route path="/bingo-dash/slides/awards/:sectionSlug/admin" element={<BingoDashAwardAdmin />} />
          <Route path="/bingo-dash/slides/briefing" element={<BingoDashBriefingSlides />} />
          <Route path="/bingo-dash/slides/briefing/:sectionSlug" element={<BingoDashBriefingSlides />} />
          <Route path="/bingo-dash/team/:teamId/members" element={<BingoDashTeamMembers />} />
          <Route path="/bingo-dash/teams/:sectionSlug" element={<BingoDashAllTeamsMembers />} />

          {/* Anything else → the hub */}
          <Route path="*" element={<Navigate to="/bingo-dash" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}