import { Alert, Card, Col, Row, Spin, Table } from 'antd'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getErrorMessage, getMilitaryLossRatio } from '../api/client'
import type { MilitaryLossRatioView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { FilterPanel } from '../components/FilterPanel'
import { MilitaryDiffChart } from '../components/charts/MilitaryDiffChart'
import { useAppStore } from '../store/useAppStore'

export function MilitaryPage() {
  const { profileId } = useParams()
  const { filters } = useAppStore()
  const [data, setData] = useState<MilitaryLossRatioView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const id = Number(profileId)
  const playerCiv = filters.civ

  useEffect(() => {
    if (!id || !playerCiv) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    void getMilitaryLossRatio(id, playerCiv, filters)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, playerCiv, filters])

  if (!playerCiv) {
    return (
      <>
        <FilterPanel />
        <Alert
          type="info"
          showIcon
          message="請在篩選條件中選擇「文明」以查看該文明的軍事分差分析"
          style={{ marginTop: 16 }}
        />
      </>
    )
  }

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />
  if (!data || data.byOpponentCiv.length === 0) {
    return (
      <>
        <FilterPanel />
        <EmptyState description="此文明尚無軍事分數資料" />
      </>
    )
  }

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <FilterPanel />
      </Col>
      <Col span={24}>
        <Card>
          <MilitaryDiffChart rows={data.byOpponentCiv} playerCiv={data.playerCiv} />
        </Card>
      </Col>
      <Col span={24}>
        <Card title="對手文明明細">
          <Table
            rowKey="opponentCiv"
            dataSource={data.byOpponentCiv}
            pagination={{ pageSize: 15 }}
            columns={[
              { title: '對手文明', dataIndex: 'opponentCiv' },
              { title: '場次', dataIndex: 'games' },
              { title: '勝', dataIndex: 'wins' },
              {
                title: '勝率',
                dataIndex: 'winRate',
                render: (v: number) => `${(v * 100).toFixed(1)}%`,
              },
              {
                title: '平均軍事分差',
                dataIndex: 'avgMilitaryDiff',
                render: (v: number | null) => (v != null ? v.toFixed(0) : '—'),
                sorter: (a, b) => (a.avgMilitaryDiff ?? 0) - (b.avgMilitaryDiff ?? 0),
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  )
}
