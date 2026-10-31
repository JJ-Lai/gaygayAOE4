import { Button, AutoComplete, Input, Space, Tag, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getErrorMessage, getPlayer, getSyncStatus, searchPlayers, syncPlayer } from '../api/client'
import type { PlayerSearchHitView } from '../api/types'
import { useAppStore } from '../store/useAppStore'
import { ErrorAlert } from './ErrorAlert'
import { SyncProgressBar } from './SyncProgressBar'

const defaultProfileId = import.meta.env.VITE_DEFAULT_PROFILE_ID ?? ''

export function ProfileSearchBar({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const { recentProfileIds, setPlayer, addRecentProfileId } = useAppStore()
  const [value, setValue] = useState(defaultProfileId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<Awaited<ReturnType<typeof getSyncStatus>> | null>(null)
  const [searchHits, setSearchHits] = useState<PlayerSearchHitView[]>([])

  useEffect(() => {
    const query = value.trim()
    if (!query || /^\d+$/.test(query)) {
      setSearchHits([])
      return
    }
    const timer = setTimeout(() => {
      void searchPlayers(query, 8).then((res) => setSearchHits(res.players)).catch(() => setSearchHits([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [value])

  const options = useMemo(
    () =>
      searchHits.map((hit) => ({
        value: String(hit.profileId),
        label: (
          <Space>
            <span>{hit.name}</span>
            <Typography.Text type="secondary">#{hit.profileId}</Typography.Text>
            {hit.country && <Tag>{hit.country.toUpperCase()}</Tag>}
          </Space>
        ),
      })),
    [searchHits],
  )

  const runSearch = async (raw?: string) => {
    const profileId = Number((raw ?? value).trim())
    if (!Number.isFinite(profileId) || profileId <= 0) {
      setError('請輸入有效的 Profile ID（正整數）或從名稱搜尋結果選取玩家')
      return
    }

    setValue(String(profileId))
    setLoading(true)
    setError(null)
    setSyncStatus(null)

    try {
      const player = await getPlayer(profileId)
      setPlayer(player)
      addRecentProfileId(profileId)

      const status = await getSyncStatus(profileId)
      if (status.totalGames === 0) {
        await syncPlayer(profileId)
      }

      let current = await getSyncStatus(profileId)
      setSyncStatus(current)

      if (current.summariesPending > 0) {
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 1500))
          current = await getSyncStatus(profileId)
          setSyncStatus(current)
          if (current.summariesPending === 0) break
        }
      }

      navigate(`/player/${profileId}`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Space direction="vertical" style={{ width: compact ? 360 : '100%' }} size="middle">
      <Space.Compact style={{ width: '100%' }}>
        <AutoComplete
          style={{ flex: 1 }}
          options={options}
          value={value}
          onChange={setValue}
          onSelect={(selected) => void runSearch(selected)}
          disabled={loading}
        >
          <Input
            placeholder="輸入 Profile ID 或玩家名稱"
            onPressEnter={() => void runSearch()}
            size={compact ? 'middle' : 'large'}
          />
        </AutoComplete>
        <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => void runSearch()}>
          搜尋
        </Button>
      </Space.Compact>

      {!compact && recentProfileIds.length > 0 && (
        <Space wrap>
          <Typography.Text type="secondary">最近搜尋：</Typography.Text>
          {recentProfileIds.map((id) => (
            <Tag key={id} style={{ cursor: 'pointer' }} onClick={() => setValue(String(id))}>
              {id}
            </Tag>
          ))}
        </Space>
      )}

      {syncStatus && loading && <SyncProgressBar status={syncStatus} />}
      {error && <ErrorAlert message={error} onRetry={() => void runSearch()} />}
    </Space>
  )
}
