import { Card, Col, Row, Spin, Statistic } from 'antd'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getErrorMessage, getOverview } from '../api/client'
import type { PlayerOverviewView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { FilterPanel } from '../components/FilterPanel'
import { WinRateTrendChart } from '../components/charts/WinRateTrendChart'
import { useAppStore } from '../store/useAppStore'

export function OverviewPage() {
  const { profileId } = useParams()
  const { filters } = useAppStore()
  const [data, setData] = useState<PlayerOverviewView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const id = Number(profileId)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void getOverview(id, filters)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, filters])

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />
  if (!data) return <EmptyState />

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <FilterPanel />
      </Col>
      <Col xs={24} sm={8}>
        <Card><Statistic title="總場次" value={data.totalGames} /></Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card><Statistic title="勝率" value={data.winRate * 100} precision={1} suffix="%" /></Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card><Statistic title="最常用文明" value={data.mostPlayedCiv ?? '—'} /></Card>
      </Col>
      <Col span={24}>
        <Card title="近期勝負">
          {data.recentTrend.length > 0 ? <WinRateTrendChart trend={data.recentTrend} /> : <EmptyState description="尚無近期對戰" />}
        </Card>
      </Col>
    </Row>
  )
}
