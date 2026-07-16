import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getPlayer } from '../api/client'
import { useAppStore } from '../store/useAppStore'
import { AppLayout } from './AppLayout'
import { useFilterUrlSync } from '../hooks/useFilterUrlSync'

export function PlayerShell() {
  const { profileId } = useParams()
  const { setPlayer } = useAppStore()
  useFilterUrlSync()

  useEffect(() => {
    const id = Number(profileId)
    if (!Number.isFinite(id) || id <= 0) return
    void getPlayer(id).then(setPlayer).catch(() => setPlayer(null))
  }, [profileId, setPlayer])

  return <AppLayout showSidebar />
}
