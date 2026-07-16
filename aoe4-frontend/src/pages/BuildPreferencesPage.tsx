import { Card, Col, Row, Slider, Spin } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getBuildPreferences, getErrorMessage } from '../api/client'
import type { BuildPreferencesView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { FilterPanel } from '../components/FilterPanel'
import { useAppStore } from '../store/useAppStore'

export function BuildPreferencesPage() {
  const { profileId } = useParams()
  const { filters } = useAppStore()
  const [minuteRange, setMinuteRange] = useState<[number, number]>([8, 12])
  const [data, setData] = useState<BuildPreferencesView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const id = Number(profileId)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void getBuildPreferences(id, {
      ...filters,
      minuteFrom: minuteRange[0],
      minuteTo: minuteRange[1],
    })
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, filters, minuteRange])

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />

  const topItems = data?.items.slice(0, 15) ?? []

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}><FilterPanel /></Col>
      <Col span={24}>
        <Card title={`建造偏好（${minuteRange[0]}–${minuteRange[1]} 分鐘）`}>
          <Slider
            range
            min={0}
            max={30}
            value={minuteRange}
            onChange={(v) => setMinuteRange(v as [number, number])}
          />
          {topItems.length > 0 ? (
            <ReactECharts
              style={{ height: 400 }}
              option={{
                tooltip: { trigger: 'axis' },
                grid: { left: 160, right: 24, top: 24, bottom: 48 },
                xAxis: { type: 'value' },
                yAxis: {
                  type: 'category',
                  data: topItems.map((i) => i.displayName).reverse(),
                },
                series: [
                  {
                    type: 'bar',
                    data: topItems.map((i) => i.count).reverse(),
                  },
                ],
              }}
            />
          ) : (
            <EmptyState description="尚無建造事件資料" />
          )}
        </Card>
      </Col>
    </Row>
  )
}
