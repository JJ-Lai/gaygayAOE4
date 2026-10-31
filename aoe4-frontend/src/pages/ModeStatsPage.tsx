import { Card, Col, Row, Spin, Table } from 'antd'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getErrorMessage, getModeStats } from '../api/client'
import type { ModeStatsView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { FilterPanel } from '../components/FilterPanel'
import { WinRateBarChart } from '../components/charts/WinRateBarChart'
import { useAppStore } from '../store/useAppStore'

export function ModeStatsPage() {
  const { profileId } = useParams()
  const { filters } = useAppStore()
  const [data, setData] = useState<ModeStatsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const id = Number(profileId)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void getModeStats(id, filters)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, filters])

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />
  if (!data || data.modes.length === 0) {
    return (
      <>
        <FilterPanel />
        <EmptyState description="尚無模式資料（rm_1v1、qm_2v2 等）" />
      </>
    )
  }

  const chartItems = data.modes.map((m) => ({
    label: m.modeName,
    winRate: m.winRate,
    games: m.games,
  }))

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <FilterPanel />
      </Col>
      <Col span={24}>
        <Card title="各模式勝率">
          <WinRateBarChart items={chartItems} />
        </Card>
      </Col>
      <Col span={24}>
        <Card title="模式明細">
          <Table
            rowKey="modeCode"
            dataSource={data.modes}
            pagination={false}
            columns={[
              { title: '模式', dataIndex: 'modeName' },
              { title: '代碼', dataIndex: 'modeCode' },
              { title: '場次', dataIndex: 'games' },
              { title: '勝', dataIndex: 'wins' },
              { title: '負', dataIndex: 'losses' },
              {
                title: '勝率',
                dataIndex: 'winRate',
                render: (v: number) => `${(v * 100).toFixed(1)}%`,
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  )
}
