import { Card, Col, Row, Space, Spin, Table } from 'antd'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getCombatStats, getErrorMessage } from '../api/client'
import type { CombatStatsView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { ExportCsvButton } from '../components/ExportCsvButton'
import { FilterPanel } from '../components/FilterPanel'
import { useAppStore } from '../store/useAppStore'
import { downloadUrl, getCombatStatsExportJsonUrl, getCombatStatsExportUrl } from '../utils/export'

export function CombatStatsPage() {
  const { profileId } = useParams()
  const { filters } = useAppStore()
  const [data, setData] = useState<CombatStatsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const id = Number(profileId)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void getCombatStats(id, filters)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, filters])

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />
  if (!data || data.civilizations.length === 0) {
    return (
      <>
        <FilterPanel />
        <EmptyState description="尚無戰鬥統計（需 Summary 含 _stats 欄位）" />
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
          title="各文明平均戰鬥統計（來自 Summary _stats）"
          extra={
            <Space>
              <ExportCsvButton
                onExport={() => downloadUrl(getCombatStatsExportUrl(id, filters), `combat-stats-${id}.csv`)}
              />
              <ExportCsvButton
                label="匯出 JSON"
                onExport={() => downloadUrl(getCombatStatsExportJsonUrl(id, filters), `combat-stats-${id}.json`)}
              />
            </Space>
          }
        >
          <Table
            rowKey="civCode"
            dataSource={data.civilizations}
            pagination={false}
            columns={[
              { title: '文明', dataIndex: 'civName' },
              { title: '場次', dataIndex: 'games' },
              {
                title: '平均建築損失',
                dataIndex: 'avgBuildingsLost',
                render: (v: number) => v.toFixed(1),
              },
              {
                title: '平均單位損失',
                dataIndex: 'avgUnitsLost',
                render: (v: number) => v.toFixed(1),
              },
              {
                title: '平均擊殺',
                dataIndex: 'avgUnitKills',
                render: (v: number) => v.toFixed(1),
              },
              {
                title: '平均編隊擊殺',
                dataIndex: 'avgSquadKills',
                render: (v: number) => v.toFixed(1),
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  )
}
