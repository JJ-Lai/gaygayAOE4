import { Card, Col, Row, Space, Spin, Table } from 'antd'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getErrorMessage, getMapStats } from '../api/client'
import type { MapStatsView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { ExportCsvButton } from '../components/ExportCsvButton'
import { FilterPanel } from '../components/FilterPanel'
import { WinRateBarChart } from '../components/charts/WinRateBarChart'
import { useAppStore } from '../store/useAppStore'
import {
  downloadUrl,
  getMapStatsExportJsonUrl,
  getMapStatsExportUrl,
} from '../utils/export'

export function MapStatsPage() {
  const { profileId } = useParams()
  const { filters } = useAppStore()
  const [data, setData] = useState<MapStatsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const id = Number(profileId)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void getMapStats(id, filters)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, filters])

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />
  if (!data || data.maps.length === 0) {
    return (
      <>
        <FilterPanel />
        <EmptyState />
      </>
    )
  }

  const chartItems = data.maps.map((m) => ({
    label: m.mapName,
    winRate: m.winRate,
    games: m.games,
  }))

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <FilterPanel />
      </Col>
      <Col span={24}>
        <Card title="各地圖勝率（前 15 名場次）">
          <WinRateBarChart items={chartItems} />
        </Card>
      </Col>
      <Col span={24}>
        <Card
          title="地圖明細"
          extra={
            <Space>
              <ExportCsvButton
                onExport={() => downloadUrl(getMapStatsExportUrl(id, filters), `map-stats-${id}.csv`)}
              />
              <ExportCsvButton
                label="匯出 JSON"
                onExport={() => downloadUrl(getMapStatsExportJsonUrl(id, filters), `map-stats-${id}.json`)}
              />
            </Space>
          }
        >
          <Table
            rowKey={(r) => `${r.mapCode}-${r.mapName}`}
            dataSource={data.maps}
            pagination={{ pageSize: 15 }}
            columns={[
              { title: '地圖', dataIndex: 'mapName' },
              { title: '場次', dataIndex: 'games', sorter: (a, b) => a.games - b.games },
              { title: '勝', dataIndex: 'wins' },
              { title: '負', dataIndex: 'losses' },
              {
                title: '勝率',
                dataIndex: 'winRate',
                render: (v: number) => `${(v * 100).toFixed(1)}%`,
                sorter: (a, b) => a.winRate - b.winRate,
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  )
}
