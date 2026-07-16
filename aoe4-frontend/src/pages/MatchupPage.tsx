import { Card, Col, Row, Space, Spin, Table } from 'antd'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getErrorMessage, getMatchupMatrix } from '../api/client'
import type { MatchupMatrixView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { FilterPanel } from '../components/FilterPanel'
import { MatchupHeatmap } from '../components/charts/MatchupHeatmap'
import { ExportCsvButton } from '../components/ExportCsvButton'
import { useAppStore } from '../store/useAppStore'
import { downloadUrl, getMatchupExportJsonUrl, getMatchupExportUrl } from '../utils/export'

export function MatchupPage() {
  const { profileId } = useParams()
  const { filters } = useAppStore()
  const [data, setData] = useState<MatchupMatrixView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const id = Number(profileId)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void getMatchupMatrix(id, filters)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, filters])

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />
  if (!data || data.matchups.length === 0) return <><FilterPanel /><EmptyState /></>

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}><FilterPanel /></Col>
      <Col span={24}>
        <Card title="文明 Matchup 熱力圖">
          <MatchupHeatmap matchups={data.matchups} />
        </Card>
      </Col>
      <Col span={24}>
        <Card
          title="對戰明細"
          extra={
            <Space>
              <ExportCsvButton
                onExport={() => downloadUrl(getMatchupExportUrl(id, filters), `matchup-${id}.csv`)}
              />
              <ExportCsvButton
                label="匯出 JSON"
                onExport={() => downloadUrl(getMatchupExportJsonUrl(id, filters), `matchup-${id}.json`)}
              />
            </Space>
          }
        >
          <Table
            rowKey={(r) => `${r.playerCiv}-${r.opponentCiv}`}
            dataSource={data.matchups}
            pagination={{ pageSize: 15 }}
            columns={[
              { title: '我方文明', dataIndex: 'playerCiv' },
              { title: '對手文明', dataIndex: 'opponentCiv' },
              { title: '勝', dataIndex: 'wins' },
              { title: '負', dataIndex: 'losses' },
              {
                title: '勝率',
                dataIndex: 'winRate',
                render: (v: number) => `${(v * 100).toFixed(1)}%`,
              },
              {
                title: '軍事分差',
                dataIndex: 'avgMilitaryDiff',
                render: (v: number | null) => (v != null ? v.toFixed(0) : '—'),
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  )
}
