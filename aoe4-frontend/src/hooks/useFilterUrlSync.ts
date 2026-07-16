import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AnalyticsFilters } from '../api/types'
import { useAppStore } from '../store/useAppStore'

const FILTER_KEYS: (keyof AnalyticsFilters)[] = [
  'civ',
  'opponentCiv',
  'leaderboard',
  'patch',
  'ratingMin',
  'ratingMax',
  'dateFrom',
  'dateTo',
]

export function useFilterUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { filters, setFilters } = useAppStore()
  const hydrated = useRef(false)

  useEffect(() => {
    if (hydrated.current) return
    const fromUrl: AnalyticsFilters = {}
    for (const key of FILTER_KEYS) {
      const value = searchParams.get(key)
      if (!value) continue
      if (key === 'patch') {
        fromUrl.patch = Number(value)
      } else if (key === 'ratingMin') {
        fromUrl.ratingMin = Number(value)
      } else if (key === 'ratingMax') {
        fromUrl.ratingMax = Number(value)
      } else if (key === 'civ') {
        fromUrl.civ = value
      } else if (key === 'opponentCiv') {
        fromUrl.opponentCiv = value
      } else if (key === 'leaderboard') {
        fromUrl.leaderboard = value
      } else if (key === 'dateFrom') {
        fromUrl.dateFrom = value
      } else if (key === 'dateTo') {
        fromUrl.dateTo = value
      }
    }
    if (Object.keys(fromUrl).length > 0) {
      setFilters(fromUrl)
    }
    hydrated.current = true
  }, [searchParams, setFilters])

  useEffect(() => {
    if (!hydrated.current) return
    const next = new URLSearchParams()
    for (const key of FILTER_KEYS) {
      const value = filters[key]
      if (value == null || value === '') continue
      next.set(key, String(value))
    }
    const current = searchParams.toString()
    const merged = next.toString()
    if (current !== merged) {
      setSearchParams(next, { replace: true })
    }
  }, [filters, searchParams, setSearchParams])
}
