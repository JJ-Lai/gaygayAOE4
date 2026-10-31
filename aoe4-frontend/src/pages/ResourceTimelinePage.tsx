import { Alert, Card, Checkbox, Col, Row, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getErrorMessage, getResourceTimeline } from '../api/client'
import type { ResourceTimelineView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { FilterPanel } from '../components/FilterPanel'
import { ResourceTimelineChart } from '../components/charts/ResourceTimelineChart'
import { useAppStore } from '../store/useAppStore'

const DEFAULT_RESOURCES = ['wood', 'gold', 'food', 'stone']

export function ResourceTimelinePage() {
  const { profileId } = useParams()
  const { filters } = useAppStore()
  const [data, setData] = useState<ResourceTimelineView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>(DEFAULT_RESOURCES)

  const id = Number(profileId)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void getResourceTimeline(id, { ...filters, resources: selected })
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, filters, selected])

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}><FilterPanel /></Col>
      <Col span={24}>
        <Alert type="info" showIcon message="資源為多場對戰的平均累積估算值，需有 Summary 資料。" />
      </Col>
      <Col span={24}>
        <Card
          title="資源時間曲線"
          extra={
            <Checkbox.Group
              options={DEFAULT_RESOURCES}
              value={selected}
              onChange={(vals) => setSelected(vals as string[])}
            />
          }
        >
          {data && data.points.length > 0 ? (
            <ResourceTimelineChart points={data.points} selectedResources={selected} />
          ) : (
            <EmptyState description="尚無 Summary 資源資料，請先同步對戰 Summary" />
          )}
        </Card>
      </Col>
    </Row>
  )
}
