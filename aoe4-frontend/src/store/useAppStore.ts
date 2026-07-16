import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AnalyticsFilters, FavoritePlayer, MetaFiltersView, PlayerView } from '../api/types'

interface AppState {
  player: PlayerView | null
  meta: MetaFiltersView | null
  filters: AnalyticsFilters
  recentProfileIds: number[]
  favoritePlayers: FavoritePlayer[]
  setPlayer: (player: PlayerView | null) => void
  setMeta: (meta: MetaFiltersView | null) => void
  setFilters: (filters: AnalyticsFilters) => void
  addRecentProfileId: (profileId: number) => void
  isFavorite: (profileId: number) => boolean
  toggleFavorite: (player: FavoritePlayer) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      player: null,
      meta: null,
      filters: {},
      recentProfileIds: [],
      favoritePlayers: [],
      setPlayer: (player) => set({ player }),
      setMeta: (meta) => set({ meta }),
      setFilters: (filters) => set({ filters: { ...get().filters, ...filters } }),
      addRecentProfileId: (profileId) => {
        const recent = [profileId, ...get().recentProfileIds.filter((id) => id !== profileId)].slice(0, 8)
        set({ recentProfileIds: recent })
      },
      isFavorite: (profileId) => get().favoritePlayers.some((p) => p.profileId === profileId),
      toggleFavorite: (player) => {
        const exists = get().favoritePlayers.some((p) => p.profileId === player.profileId)
        const favoritePlayers = exists
          ? get().favoritePlayers.filter((p) => p.profileId !== player.profileId)
          : [{ ...player }, ...get().favoritePlayers].slice(0, 12)
        set({ favoritePlayers })
      },
    }),
    {
      name: 'aoe4-app',
      partialize: (state) => ({
        recentProfileIds: state.recentProfileIds,
        favoritePlayers: state.favoritePlayers,
        filters: state.filters,
      }),
    },
  ),
)
