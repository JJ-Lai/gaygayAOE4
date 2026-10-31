import { Card, Col, Row, Space, Spin, Table } from 'antd'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getErrorMessage, getUnitLossStats } from '../api/client'
import type { UnitLossStatsView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { ExportCsvButton } from '../components/ExportCsvButton'
import { FilterPanel } from '../components/FilterPanel'
import { useAppStore } from '../store/useAppStore'
import {
  downloadUrl,
  getUnitLossStatsExportJsonUrl,
  getUnitLossStatsExportUrl,
} from '../utils/export'

export function UnitLossPage() {
  const { profileId } = useParams()
  const { filters } = useAppStore()
  const [data, setData] = useState<UnitLossStatsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const id = Number(profileId)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void getUnitLossStats(id, filters)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, filters])

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />
  if (!data || data.units.length === 0) {
    return (
      <>
        <FilterPanel />
        <EmptyState description="尚無單位損失資料（需 Summary buildOrder.destroyed；歷史資料請重新同步）" />
      </>
    )
  }

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <FilterPanel />
      </Col>
      <Col span={24}>
        <Card
          title="單位/建築損失統計（來自 buildOrder.destroyed）"
          extra={
            <Space>
              <ExportCsvButton
                onExport={() => downloadUrl(getUnitLossStatsExportUrl(id, filters), `unit-loss-stats-${id}.csv`)}
              />
              <ExportCsvButton
                label="匯出 JSON"
                onExport={() =>
                  downloadUrl(getUnitLossStatsExportJsonUrl(id, filters), `unit-loss-stats-${id}.json`)
                }
              />
            </Space>
          }
        >
          <Table
            rowKey={(r) => `${r.entityType}-${r.pbgid}`}
            dataSource={data.units}
            pagination={{ pageSize: 20 }}
            columns={[
              { title: '類型', dataIndex: 'entityType' },
              { title: '名稱', dataIndex: 'displayName' },
              { title: 'PBGID', dataIndex: 'pbgid' },
              {
                title: '損失次數',
                dataIndex: 'lossCount',
                sorter: (a, b) => a.lossCount - b.lossCount,
                defaultSortOrder: 'descend',
              },
              { title: '出現場次', dataIndex: 'gameCount' },
            ]}
          />
        </Card>
      </Col>
    </Row>
  )
}
