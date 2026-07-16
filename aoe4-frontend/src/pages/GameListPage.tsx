import { Card, Spin, Table, Tag } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getErrorMessage, listGames } from '../api/client'
import type { GamePageView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { ExportCsvButton } from '../components/ExportCsvButton'
import { downloadUrl, getGamesExportUrl } from '../utils/export'

export function GameListPage() {
  const { profileId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<GamePageView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const id = Number(profileId)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void listGames(id, page, 20)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, page])

  if (loading && !data) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />
  if (!data || data.games.length === 0) return <EmptyState description="尚無對戰紀錄" />

  return (
    <Card
      title="對戰列表"
      extra={
        <ExportCsvButton onExport={() => downloadUrl(getGamesExportUrl(id), `games-${id}.csv`)} />
      }
    >
      <Table
        rowKey="gameId"
        dataSource={data.games}
        loading={loading}
        pagination={{
          current: page + 1,
          pageSize: data.size,
          total: data.totalElements,
          onChange: (p) => setPage(p - 1),
        }}
        onRow={(record) => ({
          onClick: () => navigate(`/player/${id}/games/${record.gameId}`),
          style: { cursor: 'pointer' },
        })}
        columns={[
          {
            title: '日期',
            dataIndex: 'startedAt',
            render: (v: string | null) => (v ? new Date(v).toLocaleString() : '—'),
          },
          {
            title: '我方',
            render: (_, row) => {
              const me = row.players.find((p) => p.profileId === id)
              return me?.civilization ?? '—'
            },
          },
          {
            title: '對手',
            render: (_, row) => {
              const opp = row.players.find((p) => p.profileId !== id)
              return opp ? `${opp.playerName ?? opp.profileId} (${opp.civilization ?? '?'})` : '—'
            },
          },
          {
            title: '結果',
            render: (_, row) => {
              const me = row.players.find((p) => p.profileId === id)
              const color = me?.result === 'win' ? 'green' : me?.result === 'loss' ? 'red' : 'default'
              return <Tag color={color}>{me?.result ?? '—'}</Tag>
            },
          },
          { title: '地圖', dataIndex: 'mapName' },
          { title: '模式', dataIndex: 'leaderboardCode' },
        ]}
      />
    </Card>
  )
}
