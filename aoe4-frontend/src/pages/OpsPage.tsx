import { Button, Card, Col, InputNumber, Row, Space, Spin, Statistic, Table, Typography, message, Alert } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  batchSyncPlayers,
  getBatchSyncStatus,
  getErrorMessage,
  getFailedSummaries,
  getQueryPlans,
  getSyncOverview,
  notifyAlerts,
  reparseSummaries,
  retryFailedSummaries,
} from '../api/client'
import type {
  FailedSummariesView,
  PlayerSyncStatusView,
  QueryPlanReportView,
  SyncOverviewView,
} from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { useAppStore } from '../store/useAppStore'

export function OpsPage() {
  const { favoritePlayers, recentProfileIds } = useAppStore()
  const [overview, setOverview] = useState<SyncOverviewView | null>(null)
  const [failures, setFailures] = useState<FailedSummariesView | null>(null)
  const [players, setPlayers] = useState<PlayerSyncStatusView[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [planProfileId, setPlanProfileId] = useState<number | null>(null)
  const [reparseProfileId, setReparseProfileId] = useState<number | null>(null)
  const [queryPlans, setQueryPlans] = useState<QueryPlanReportView | null>(null)
  const [planLoading, setPlanLoading] = useState(false)

  const trackedIds = useMemo(() => {
    const ids = new Set<number>()
    favoritePlayers.forEach((p) => ids.add(p.profileId))
    recentProfileIds.forEach((id) => ids.add(id))
    return Array.from(ids)
  }, [favoritePlayers, recentProfileIds])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [overviewData, failureData, batchData] = await Promise.all([
        getSyncOverview(),
        getFailedSummaries(20),
        trackedIds.length > 0 ? getBatchSyncStatus(trackedIds) : Promise.resolve({ players: [] }),
      ])
      setOverview(overviewData)
      setFailures(failureData)
      setPlayers(batchData.players)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [trackedIds])

  useEffect(() => {
    void load()
  }, [load])

  const runBatchSync = async () => {
    if (trackedIds.length === 0) {
      message.warning('尚無追蹤玩家')
      return
    }
    setActionLoading(true)
    try {
      const result = await batchSyncPlayers(trackedIds)
      message.success(`批次同步完成：${result.results.length} 位玩家`)
      await load()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  useEffect(() => {
    if (trackedIds.length > 0 && planProfileId == null) {
      setPlanProfileId(trackedIds[0])
    }
    if (trackedIds.length > 0 && reparseProfileId == null) {
      setReparseProfileId(trackedIds[0])
    }
  }, [trackedIds, planProfileId, reparseProfileId])

  const loadQueryPlans = async () => {
    if (!planProfileId) {
      message.warning('請輸入 Profile ID')
      return
    }
    setPlanLoading(true)
    try {
      const report = await getQueryPlans(planProfileId)
      setQueryPlans(report)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setPlanLoading(false)
    }
  }

  const runRetryFailed = async () => {
    setActionLoading(true)
    try {
      const result = await retryFailedSummaries()
      message.success(`重試完成：成功 ${result.succeeded} / 嘗試 ${result.attempted}`)
      await load()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const runNotifyAlerts = async () => {
    setActionLoading(true)
    try {
      const result = await notifyAlerts(true)
      if (result.sent) {
        message.success(`Webhook 已推送（${result.alertCount} 項告警）`)
      } else {
        message.info(`未推送：${result.reason}`)
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const runReparseSummaries = async () => {
    setActionLoading(true)
    try {
      const result = await reparseSummaries(reparseProfileId ?? undefined, 20)
      message.success(`重新解析完成：成功 ${result.succeeded} / 嘗試 ${result.attempted}`)
      await load()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} onRetry={() => void load()} />

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Typography.Title level={3} style={{ marginBottom: 0 }}>
              同步狀態 Dashboard
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              追蹤玩家來自最近搜尋與我的最愛（最多 10 位批次同步）
            </Typography.Paragraph>
          </div>
          <Space>
            <Button loading={actionLoading} onClick={() => void runBatchSync()} disabled={trackedIds.length === 0}>
              批次同步追蹤玩家
            </Button>
            <Button loading={actionLoading} onClick={() => void runRetryFailed()}>
              重試失敗 Summary
            </Button>
            <Button loading={actionLoading} onClick={() => void runNotifyAlerts()}>
              推送告警 Webhook
            </Button>
          </Space>
        </Space>
      </Col>
      {overview && overview.alerts.length > 0 && (
        <Col span={24}>
          <Space orientation="vertical" style={{ width: '100%' }}>
            {overview.alerts.map((alert) => (
              <Alert
                key={alert.code}
                type={alert.severity === 'ERROR' ? 'error' : 'warning'}
                showIcon
                title={`${alert.message}（${alert.count}）`}
              />
            ))}
          </Space>
        </Col>
      )}
      {overview && (
        <>
          <Col xs={24} sm={8}>
            <Card><Statistic title="已入庫玩家" value={overview.totalPlayers} /></Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card><Statistic title="對戰總數" value={overview.totalGames} /></Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card><Statistic title="尚未嘗試 Summary" value={overview.gamesWithoutSummary} /></Card>
          </Col>
          <Col span={24}>
            <Card title="Summary 狀態分佈">
              <Table
                rowKey="status"
                pagination={false}
                dataSource={overview.summaryStatusCounts}
                columns={[
                  { title: '狀態', dataIndex: 'status' },
                  { title: '筆數', dataIndex: 'count' },
                ]}
              />
            </Card>
          </Col>
        </>
      )}
      <Col span={24}>
        <Card title="追蹤玩家同步進度">
          {players.length === 0 ? (
            <Typography.Text type="secondary">尚無追蹤玩家，請先搜尋或加入最愛。</Typography.Text>
          ) : (
            <Table
              rowKey="profileId"
              dataSource={players}
              pagination={false}
              columns={[
                { title: 'Profile ID', dataIndex: 'profileId' },
                { title: '對戰數', dataIndex: 'totalGames' },
                { title: 'Summary 成功', dataIndex: 'summariesSynced' },
                { title: '待處理', dataIndex: 'summariesPending' },
                { title: '失敗/略過', dataIndex: 'summariesFailed' },
              ]}
            />
          )}
        </Card>
      </Col>
      <Col span={24}>
        <Card title="重新解析 Summary">
          <Typography.Paragraph type="secondary">
            從已入庫的 raw payload 重新解析，可補齊歷史對戰的 destroyed[] 與戰鬥統計。留空 Profile ID 則處理全域最近成功紀錄。
          </Typography.Paragraph>
          <Space wrap>
            <InputNumber
              min={1}
              placeholder="Profile ID（可選）"
              value={reparseProfileId ?? undefined}
              onChange={(value) => setReparseProfileId(typeof value === 'number' ? value : null)}
            />
            <Button loading={actionLoading} onClick={() => void runReparseSummaries()}>
              重新解析 Summary（最多 20 場）
            </Button>
          </Space>
        </Card>
      </Col>
      <Col span={24}>
        <Card title="SQL 查詢計畫檢視">
          <Space wrap style={{ marginBottom: 16 }}>
            <InputNumber
              min={1}
              placeholder="Profile ID"
              value={planProfileId ?? undefined}
              onChange={(value) => setPlanProfileId(typeof value === 'number' ? value : null)}
            />
            <Button loading={planLoading} onClick={() => void loadQueryPlans()}>
              檢視執行計畫
            </Button>
            {queryPlans && (
              <Typography.Text type="secondary">
                資料庫：{queryPlans.databaseProduct}
              </Typography.Text>
            )}
          </Space>
          {queryPlans && (
            <Table
              rowKey="queryKey"
              pagination={false}
              dataSource={queryPlans.plans}
              expandable={{
                expandedRowRender: (row) => (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{row.planLines.join('\n')}</pre>
                ),
              }}
              columns={[
                { title: '查詢', dataIndex: 'queryKey' },
                { title: '說明', dataIndex: 'description' },
                {
                  title: '耗時 (ms)',
                  dataIndex: 'executionMs',
                  sorter: (a, b) => a.executionMs - b.executionMs,
                },
              ]}
            />
          )}
        </Card>
      </Col>
      <Col span={24}>
        <Card title="近期 Summary 失敗">
          <Table
            rowKey="gameId"
            dataSource={failures?.failures ?? []}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: 'Game ID', dataIndex: 'gameId' },
              { title: 'Profile ID', dataIndex: 'profileId' },
              { title: '狀態', dataIndex: 'fetchStatus' },
              { title: '重試', dataIndex: 'retryCount' },
              {
                title: '錯誤',
                dataIndex: 'errorMessage',
                ellipsis: true,
                render: (v: string | null) => v ?? '—',
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  )
}
