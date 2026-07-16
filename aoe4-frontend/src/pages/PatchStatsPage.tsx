import { Card, Col, Row, Space, Spin, Table } from 'antd'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getErrorMessage, getPatchStats } from '../api/client'
import type { PatchStatsView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { ExportCsvButton } from '../components/ExportCsvButton'
import { FilterPanel } from '../components/FilterPanel'
import { WinRateBarChart } from '../components/charts/WinRateBarChart'
import { useAppStore } from '../store/useAppStore'
import {
  downloadUrl,
  getPatchStatsExportJsonUrl,
  getPatchStatsExportUrl,
} from '../utils/export'

export function PatchStatsPage() {
  const { profileId } = useParams()
  const { filters } = useAppStore()
  const [data, setData] = useState<PatchStatsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const id = Number(profileId)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void getPatchStats(id, filters)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, filters])

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />
  if (!data || data.patches.length === 0) {
    return (
      <>
        <FilterPanel />
        <EmptyState />
      </>
    )
  }

  const chartItems = data.patches.map((p) => ({
    label: p.patchLabel,
    winRate: p.winRate,
    games: p.games,
  }))

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <FilterPanel />
      </Col>
      <Col span={24}>
        <Card title="各補丁版本勝率">
          <WinRateBarChart items={chartItems} />
        </Card>
      </Col>
      <Col span={24}>
        <Card
          title="補丁明細"
          extra={
            <Space>
              <ExportCsvButton
                onExport={() => downloadUrl(getPatchStatsExportUrl(id, filters), `patch-stats-${id}.csv`)}
              />
              <ExportCsvButton
                label="匯出 JSON"
                onExport={() => downloadUrl(getPatchStatsExportJsonUrl(id, filters), `patch-stats-${id}.json`)}
              />
            </Space>
          }
        >
          <Table
            rowKey={(r) => r.patchCode}
            dataSource={data.patches}
            pagination={{ pageSize: 15 }}
            columns={[
              { title: '補丁', dataIndex: 'patchLabel' },
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
