import { lazy, Suspense } from 'react'
import { Spin } from 'antd'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { PlayerShell } from './components/PlayerShell'

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })))
const ComparePage = lazy(() => import('./pages/ComparePage').then((m) => ({ default: m.ComparePage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })))
const OpsPage = lazy(() => import('./pages/OpsPage').then((m) => ({ default: m.OpsPage })))
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const ResourceTimelinePage = lazy(() =>
  import('./pages/ResourceTimelinePage').then((m) => ({ default: m.ResourceTimelinePage })),
)
const MatchupPage = lazy(() => import('./pages/MatchupPage').then((m) => ({ default: m.MatchupPage })))
const MapStatsPage = lazy(() => import('./pages/MapStatsPage').then((m) => ({ default: m.MapStatsPage })))
const PatchStatsPage = lazy(() => import('./pages/PatchStatsPage').then((m) => ({ default: m.PatchStatsPage })))
const ModeStatsPage = lazy(() => import('./pages/ModeStatsPage').then((m) => ({ default: m.ModeStatsPage })))
const MilitaryPage = lazy(() => import('./pages/MilitaryPage').then((m) => ({ default: m.MilitaryPage })))
const CombatStatsPage = lazy(() => import('./pages/CombatStatsPage').then((m) => ({ default: m.CombatStatsPage })))
const UnitLossPage = lazy(() => import('./pages/UnitLossPage').then((m) => ({ default: m.UnitLossPage })))
const GameListPage = lazy(() => import('./pages/GameListPage').then((m) => ({ default: m.GameListPage })))
const GameDetailPage = lazy(() => import('./pages/GameDetailPage').then((m) => ({ default: m.GameDetailPage })))
const BuildPreferencesPage = lazy(() =>
  import('./pages/BuildPreferencesPage').then((m) => ({ default: m.BuildPreferencesPage })),
)
const SimulatePage = lazy(() => import('./pages/SimulatePage').then((m) => ({ default: m.SimulatePage })))

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <Spin size="large" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/simulate" element={<SimulatePage />} />
            <Route path="/ops" element={<OpsPage />} />
          </Route>
          <Route path="/player/:profileId" element={<PlayerShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="resources" element={<ResourceTimelinePage />} />
            <Route path="matchups" element={<MatchupPage />} />
            <Route path="maps" element={<MapStatsPage />} />
            <Route path="patches" element={<PatchStatsPage />} />
            <Route path="modes" element={<ModeStatsPage />} />
            <Route path="military" element={<MilitaryPage />} />
            <Route path="combat" element={<CombatStatsPage />} />
            <Route path="unit-losses" element={<UnitLossPage />} />
            <Route path="games" element={<GameListPage />} />
            <Route path="games/:gameId" element={<GameDetailPage />} />
            <Route path="builds" element={<BuildPreferencesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
