import { CopyOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Descriptions, Row, Segmented, Select, Space, Spin, Statistic, Tag, Timeline, Typography, message } from 'antd'
import type { EChartsType } from 'echarts'
import ReactECharts from 'echarts-for-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getErrorMessage, getGameDetail, getGameTimeline, syncGameSummary } from '../api/client'
import type { GameDetailView, GameTimelineView, TimelineBuildEvent, TimelineOpponentOption } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'
import { EmptyState } from '../components/EmptyState'
import { SummaryApiKeyForm } from '../components/SummaryApiKeyForm'
import { useMetaTag, useOgMeta, usePageTitle } from '../hooks/usePageMeta'

type EventFilter = 'all' | 'destroyed'

function eventKindColor(kind: string): string {
  switch (kind) {
    case 'FINISHED':
      return 'green'
    case 'CONSTRUCTED':
      return 'blue'
    case 'DESTROYED':
      return 'red'
    default:
      return 'default'
  }
}

function formatBuildEvent(e: TimelineBuildEvent): string {
  const time = `${e.minute}:${String(e.eventSecond % 60).padStart(2, '0')}`
  const name = e.displayName ?? `${e.entityType} (${e.pbgid ?? '?'})`
  return `${time} — ${name}`
}

function exportChartPng(chart: EChartsType | undefined, filename: string) {
  if (!chart) {
    message.warning('圖表尚未載入')
    return
  }
  const dataUrl = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#121a23' })
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

function flattenResourceSeries(timeline: GameTimelineView['resources']) {
  return timeline.flatMap((s) =>
    s.points.map((p) => ({ minute: p.minute, value: p.accumulatedValue, resource: s.resource })),
  )
}

function filterBuildEvents(events: TimelineBuildEvent[], eventFilter: EventFilter) {
  if (eventFilter === 'destroyed') {
    return events.filter((e) => e.eventKind === 'DESTROYED')
  }
  return events
}

function comparePlayerLabel(option: TimelineOpponentOption): string {
  const name = option.playerName ?? option.profileId
  const civ = option.civilization ? ` (${option.civilization})` : ''
  const missing = option.hasTimelineData ? '' : ' — 無 Summary'
  return `${name}${civ}${missing}`
}

function buildComparePlayerSelectOptions(opponents: TimelineOpponentOption[]) {
  const toOption = (o: TimelineOpponentOption) => ({
    value: o.profileId,
    label: comparePlayerLabel(o),
    disabled: !o.hasTimelineData,
  })

  const enemies = opponents.filter((o) => o.relationship === 'opponent')
  const teammates = opponents.filter((o) => o.relationship === 'teammate')
  const unknown = opponents.filter((o) => o.relationship !== 'opponent' && o.relationship !== 'teammate')

  const groups: { label: string; options: ReturnType<typeof toOption>[] }[] = []
  if (enemies.length > 0) {
    groups.push({ label: '敵方', options: enemies.map(toOption) })
  }
  if (teammates.length > 0) {
    groups.push({ label: '隊友', options: teammates.map(toOption) })
  }
  if (unknown.length > 0) {
    groups.push({ label: '其他', options: unknown.map(toOption) })
  }
  return (groups.length > 0 ? groups : opponents.map(toOption)) as Parameters<
    typeof Select
  >[0]['options']
}

function BuildEventTimeline({ events }: { events: TimelineBuildEvent[] }) {
  if (events.length === 0) {
    return <EmptyState description="沒有事件" />
  }
  return (
    <Timeline
      items={events.slice(0, 30).map((e) => ({
        color: eventKindColor(e.eventKind),
        children: (
          <>
            <Tag color={eventKindColor(e.eventKind)}>{e.eventKind}</Tag> {formatBuildEvent(e)}
          </>
        ),
      }))}
    />
  )
}

export function GameDetailPage() {
  const { profileId, gameId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<GameDetailView | null>(null)
  const [timeline, setTimeline] = useState<GameTimelineView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventFilter, setEventFilter] = useState<EventFilter>('all')
  const [syncingSummary, setSyncingSummary] = useState(false)
  const resourceChartRef = useRef<ReactECharts>(null)
  const armyChartRef = useRef<ReactECharts>(null)

  const pid = Number(profileId)
  const gid = Number(gameId)
  const opponentParam = searchParams.get('opponent')
  const selectedOpponentId = opponentParam ? Number(opponentParam) : undefined

  const pageTitle = detail && gid
    ? `對戰 #${gid}${detail.game.mapName ? ` · ${detail.game.mapName}` : ''} | AOE4 Analytics`
    : 'AOE4 Analytics'
  usePageTitle(pageTitle)
  useMetaTag(
    'description',
    detail
      ? `AOE4 對戰分析：${detail.game.mapName ?? '未知地圖'} · ${detail.game.leaderboardCode ?? ''}`
      : '世紀帝國 IV 對戰數據分析',
  )
  useOgMeta({
    title: detail && gid ? pageTitle.replace(' | AOE4 Analytics', '') : undefined,
    description: detail
      ? `地圖 ${detail.game.mapName ?? '—'} · ${detail.game.leaderboardCode ?? ''} · 資源與軍隊雙方對比`
      : undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
  })

  const loadData = useCallback(async () => {
    if (!pid || !gid) return
    setLoading(true)
    setError(null)
    try {
      const [d, t] = await Promise.all([
        getGameDetail(gid, pid),
        getGameTimeline(gid, pid, selectedOpponentId).catch(() => null),
      ])
      setDetail(d)
      setTimeline(t)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [pid, gid, selectedOpponentId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const retryThisGameSummary = async () => {
    setSyncingSummary(true)
    try {
      const result = await syncGameSummary(gid, pid)
      if (result.succeeded > 0) {
        message.success('本場 Summary 同步成功')
        await loadData()
      } else {
        message.warning('仍無法取得 Summary。若為私人對戰，請在下方貼上 Overlay API Key 後再試。')
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSyncingSummary(false)
    }
  }

  const changeOpponent = (opponentId: number | undefined) => {
    const next = new URLSearchParams(searchParams)
    if (opponentId) {
      next.set('opponent', String(opponentId))
    } else {
      next.delete('opponent')
    }
    setSearchParams(next)
  }

  const filteredBuildEvents = useMemo(
    () => filterBuildEvents(timeline?.buildEvents ?? [], eventFilter),
    [timeline?.buildEvents, eventFilter],
  )

  const filteredOpponentBuildEvents = useMemo(
    () => filterBuildEvents(timeline?.opponent?.buildEvents ?? [], eventFilter),
    [timeline?.opponent?.buildEvents, eventFilter],
  )

  const copyShareLink = async () => {
    try {
      const sharePath = `/share/player/${pid}/games/${gid}${
        selectedOpponentId ? `?opponent=${selectedOpponentId}` : ''
      }`
      await navigator.clipboard.writeText(`${window.location.origin}${sharePath}`)
      message.success('已複製分享連結（含社群預覽）')
    } catch {
      message.error('無法複製連結')
    }
  }

  if (loading) return <Spin size="large" />
  if (error) return <ErrorAlert message={error} />
  if (!detail) return <EmptyState />

  const resourceSeries = flattenResourceSeries(timeline?.resources ?? [])
  const opponent = timeline?.opponent ?? null
  const opponentResourceSeries = opponent ? flattenResourceSeries(opponent.resources) : []
  const opponentLabel = opponent?.playerName ?? '對手'

  const resources = [...new Set(resourceSeries.map((r) => r.resource))]
  const opponentResources = [...new Set(opponentResourceSeries.map((r) => r.resource))]
  const minutes = [
    ...new Set([...resourceSeries, ...opponentResourceSeries].map((r) => r.minute)),
  ].sort((a, b) => a - b)

  const armyMinutes = [
    ...new Set([
      ...(timeline?.armyValues.map((a) => a.minute) ?? []),
      ...(opponent?.armyValues.map((a) => a.minute) ?? []),
    ]),
  ].sort((a, b) => a - b)
  const armyData = armyMinutes.map(
    (m) => timeline?.armyValues.find((a) => a.minute === m)?.armyValue ?? null,
  )
  const opponentArmyData = opponent
    ? armyMinutes.map((m) => opponent.armyValues.find((a) => a.minute === m)?.armyValue ?? null)
    : []

  const resourceLegend = [
    ...resources.map((r) => `我方 ${r}`),
    ...opponentResources.map((r) => `${opponentLabel} ${r}`),
  ]

  const combat = detail.combatStats

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card
          title={`對戰 #${gid}`}
          extra={
            <Button icon={<CopyOutlined />} onClick={() => void copyShareLink()}>
              複製分享連結
            </Button>
          }
        >
          <Descriptions column={2}>
            <Descriptions.Item label="地圖">{detail.game.mapName}</Descriptions.Item>
            <Descriptions.Item label="模式">{detail.game.leaderboardCode}</Descriptions.Item>
            <Descriptions.Item label="開始時間">
              {detail.game.startedAt ? new Date(detail.game.startedAt).toLocaleString() : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="時長">{detail.game.durationSeconds ? `${Math.round(detail.game.durationSeconds / 60)} 分` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Summary">
              <Tag color={detail.hasSummary ? 'green' : 'default'}>{detail.summaryFetchStatus ?? '無'}</Tag>
            </Descriptions.Item>
            {opponent && (
              <Descriptions.Item label="對手">
                {opponent.playerName ?? opponent.profileId}
                {opponent.civilization ? ` (${opponent.civilization})` : ''}
              </Descriptions.Item>
            )}
            {(timeline?.availableOpponents.length ?? 0) > 1 && (
              <Descriptions.Item label="切換對比玩家">
                <Select
                  style={{ minWidth: 220 }}
                  value={timeline?.opponent?.profileId ?? selectedOpponentId}
                  options={buildComparePlayerSelectOptions(timeline?.availableOpponents ?? [])}
                  onChange={(value) => changeOpponent(typeof value === 'number' ? value : undefined)}
                />
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>
      </Col>

      {detail && !detail.hasSummary && (
        <Col span={24}>
          <Alert
            type="warning"
            showIcon
            message="尚無本場 Summary（無法顯示隨時間的資源／軍隊／建造數據）"
            description={
              <div>
                <Typography.Paragraph style={{ marginBottom: 12 }}>
                  私人對戰需提供自己的 Overlay <Typography.Text code>apiKey</Typography.Text>。
                  也可先按「重新抓取」；若仍失敗，請貼上含 apiKey 的 Overlay URL。
                  完整步驟見 <Link to={`/settings?profileId=${pid}`}>設定頁</Link>。
                </Typography.Paragraph>
                <Space style={{ marginBottom: 16 }} wrap>
                  <Button
                    icon={<ReloadOutlined />}
                    loading={syncingSummary}
                    onClick={() => void retryThisGameSummary()}
                  >
                    重新抓取本場 Summary
                  </Button>
                </Space>
                <Card size="small" title="輸入 Summary API Key">
                  <SummaryApiKeyForm
                    compact
                    defaultProfileId={pid}
                    gameId={gid}
                    onConfigured={() => void loadData()}
                  />
                </Card>
              </div>
            }
          />
        </Col>
      )}

      {combat && (
        <Col span={24}>
          <Card title="戰鬥統計">
            <Row gutter={16}>
              <Col xs={12} sm={8} md={4}>
                <Statistic title="建築損失" value={combat.buildingsLost ?? '—'} />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Statistic title="單位損失" value={combat.unitsLost ?? '—'} />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Statistic title="單位擊殺" value={combat.unitKills ?? '—'} />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Statistic title="小隊擊殺" value={combat.squadKills ?? '—'} />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Statistic title="敵方死亡" value={combat.enemyDeaths ?? '—'} />
              </Col>
            </Row>
          </Card>
        </Col>
      )}

      {timeline && (timeline.resources.length > 0 || opponentResourceSeries.length > 0) && (
        <Col span={24}>
          <Card
            title="資源曲線（雙方對比）"
            extra={
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() =>
                  exportChartPng(resourceChartRef.current?.getEchartsInstance(), `game-${gid}-resources.png`)
                }
              >
                匯出 PNG
              </Button>
            }
          >
            {opponent && (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                實線：我方 · 虛線：{opponentLabel}
              </Typography.Paragraph>
            )}
            <ReactECharts theme="aoe4"
              ref={resourceChartRef}
              style={{ height: 360 }}
              option={{
                tooltip: { trigger: 'axis' },
                legend: { data: resourceLegend },
                xAxis: { type: 'category', name: '分鐘', data: minutes },
                yAxis: { type: 'value' },
                series: [
                  ...resources.map((resource) => ({
                    name: `我方 ${resource}`,
                    type: 'line' as const,
                    smooth: true,
                    showSymbol: false,
                    data: minutes.map(
                      (m) => resourceSeries.find((r) => r.minute === m && r.resource === resource)?.value ?? null,
                    ),
                  })),
                  ...opponentResources.map((resource) => ({
                    name: `${opponentLabel} ${resource}`,
                    type: 'line' as const,
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { type: 'dashed' as const },
                    data: minutes.map(
                      (m) =>
                        opponentResourceSeries.find((r) => r.minute === m && r.resource === resource)?.value ?? null,
                    ),
                  })),
                ],
              }}
            />
          </Card>
        </Col>
      )}

      {timeline && (timeline.armyValues.length > 0 || (opponent?.armyValues.length ?? 0) > 0) && (
        <Col span={24}>
          <Card
            title="軍隊價值（雙方對比）"
            extra={
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => exportChartPng(armyChartRef.current?.getEchartsInstance(), `game-${gid}-army.png`)}
              >
                匯出 PNG
              </Button>
            }
          >
            <ReactECharts theme="aoe4"
              ref={armyChartRef}
              style={{ height: 280 }}
              option={{
                tooltip: { trigger: 'axis' },
                legend: { data: opponent ? ['我方', opponentLabel] : ['我方'] },
                xAxis: { type: 'category', data: armyMinutes },
                yAxis: { type: 'value' },
                series: [
                  { name: '我方', type: 'line', smooth: true, data: armyData, areaStyle: {} },
                  ...(opponent
                    ? [
                        {
                          name: opponentLabel,
                          type: 'line' as const,
                          smooth: true,
                          data: opponentArmyData,
                          lineStyle: { type: 'dashed' as const },
                        },
                      ]
                    : []),
                ],
              }}
            />
          </Card>
        </Col>
      )}

      {timeline && (timeline.buildEvents.length > 0 || (opponent?.buildEvents.length ?? 0) > 0) && (
        <Col span={24}>
          <Card
            title={opponent?.buildEvents.length ? '建造事件（雙方對比，前 30 項）' : '建造事件（前 30 項）'}
            extra={
              <Segmented
                size="small"
                value={eventFilter}
                onChange={(value) => setEventFilter(value as EventFilter)}
                options={[
                  { label: '全部', value: 'all' },
                  { label: '僅損失', value: 'destroyed' },
                ]}
              />
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={opponent?.buildEvents.length ? 12 : 24}>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  我方
                </Typography.Title>
                <BuildEventTimeline events={filteredBuildEvents} />
              </Col>
              {(opponent?.buildEvents.length ?? 0) > 0 && (
                <Col xs={24} md={12}>
                  <Typography.Title level={5} style={{ marginTop: 0 }}>
                    {opponentLabel}
                  </Typography.Title>
                  <BuildEventTimeline events={filteredOpponentBuildEvents} />
                </Col>
              )}
            </Row>
          </Card>
        </Col>
      )}

      {!timeline?.resources.length && !timeline?.armyValues.length && !opponent?.resources.length && (
        <Col span={24}>
          <EmptyState description="此場對戰尚無 Summary 時間軸資料" />
        </Col>
      )}
    </Row>
  )
}
