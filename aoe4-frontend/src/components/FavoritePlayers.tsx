import { StarFilled, StarOutlined } from '@ant-design/icons'
import { Button, Space, Tag, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'

interface FavoriteToggleProps {
  profileId: number
  playerName?: string | null
}

export function FavoriteToggle({ profileId, playerName }: FavoriteToggleProps) {
  const { isFavorite, toggleFavorite } = useAppStore()
  const favorite = isFavorite(profileId)

  return (
    <Button
      type="text"
      icon={favorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
      onClick={() => toggleFavorite({ profileId, name: playerName ?? null })}
      aria-label={favorite ? '移除最愛' : '加入最愛'}
    />
  )
}

export function FavoriteList({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const { favoritePlayers } = useAppStore()

  if (favoritePlayers.length === 0) return null

  return (
    <Space wrap>
      <Typography.Text type="secondary">{compact ? '最愛' : '我的最愛'}：</Typography.Text>
      {favoritePlayers.map((player) => (
        <Tag
          key={player.profileId}
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(`/player/${player.profileId}`)}
        >
          {player.name ?? `#${player.profileId}`}
        </Tag>
      ))}
    </Space>
  )
}
