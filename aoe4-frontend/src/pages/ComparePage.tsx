import { Button, Card, Col, Input, Row, Space, Spin, Statistic, Typography, message } from 'antd'
import { LinkOutlined, SwapOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getErrorMessage, getOverview, getPlayer } from '../api/client'
import type { PlayerOverviewView, PlayerView } from '../api/types'
import { ErrorAlert } from '../components/ErrorAlert'

function PlayerCompareCard({
  title,
  profileId,
  player,
  overview,
  loading,
  error,
}: {
  title: string
  profileId: number
  player: PlayerView | null
  overview: PlayerOverviewView | null
  loading: boolean
  error: string | null
}) {
  return (
    <Card
      title={title}
      extra={
        profileId > 0 ? (
          <Link to={`/player/${profileId}`}>
            <LinkOutlined /> 儀表板
          </Link>
        ) : null
      }
    >
      {loading && <Spin />}
      {error && <ErrorAlert message={error} />}
      {!loading && !error && overview && (
        <>
          <Typography.Title level={5}>{player?.name ?? profileId}</Typography.Title>
          <Row gutter={16}>
            <Col span={8}>
              <Statistic title="總場次" value={overview.totalGames} />
            </Col>
            <Col span={8}>
              <Statistic title="勝率" value={overview.winRate * 100} precision={1} suffix="%" />
            </Col>
            <Col span={8}>
              <Statistic title="Summary" value={overview.gamesWithSummary} suffix="場" />
            </Col>
          </Row>
          <Typography.Paragraph style={{ marginTop: 12 }}>
            最常用文明：<Typography.Text strong>{overview.mostPlayedCiv ?? '—'}</Typography.Text>
          </Typography.Paragraph>
        </>
      )}
    </Card>
  )
}

export function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [leftId, setLeftId] = useState(searchParams.get('left') ?? '')
  const [rightId, setRightId] = useState(searchParams.get('right') ?? '')
  const [loading, setLoading] = useState(false)
  const [leftPlayer, setLeftPlayer] = useState<PlayerView | null>(null)
  const [rightPlayer, setRightPlayer] = useState<PlayerView | null>(null)
  const [leftOverview, setLeftOverview] = useState<PlayerOverviewView | null>(null)
  const [rightOverview, setRightOverview] = useState<PlayerOverviewView | null>(null)
  const [leftError, setLeftError] = useState<string | null>(null)
  const [rightError, setRightError] = useState<string | null>(null)

  const runCompare = async (left: string, right: string) => {
    const leftNum = Number(left)
    const rightNum = Number(right)
    if (!Number.isFinite(leftNum) || leftNum <= 0 || !Number.isFinite(rightNum) || rightNum <= 0) {
      message.error('請輸入兩個有效的 Profile ID')
      return
    }

    setSearchParams({ left: String(leftNum), right: String(rightNum) })
    setLoading(true)
    setLeftError(null)
    setRightError(null)

    const [leftResult, rightResult] = await Promise.allSettled([
      Promise.all([getPlayer(leftNum), getOverview(leftNum)]),
      Promise.all([getPlayer(rightNum), getOverview(rightNum)]),
    ])

    if (leftResult.status === 'fulfilled') {
      setLeftPlayer(leftResult.value[0])
      setLeftOverview(leftResult.value[1])
    } else {
      setLeftError(getErrorMessage(leftResult.reason))
      setLeftPlayer(null)
      setLeftOverview(null)
    }

    if (rightResult.status === 'fulfilled') {
      setRightPlayer(rightResult.value[0])
      setRightOverview(rightResult.value[1])
    } else {
      setRightError(getErrorMessage(rightResult.reason))
      setRightPlayer(null)
      setRightOverview(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    const left = searchParams.get('left')
    const right = searchParams.get('right')
    if (left) setLeftId(left)
    if (right) setRightId(right)
    if (left && right) {
      void runCompare(left, right)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card title="玩家比較">
          <Space wrap style={{ marginBottom: 16 }}>
            <Input
              placeholder="玩家 A Profile ID"
              value={leftId}
              onChange={(e) => setLeftId(e.target.value)}
              style={{ width: 180 }}
            />
            <SwapOutlined />
            <Input
              placeholder="玩家 B Profile ID"
              value={rightId}
              onChange={(e) => setRightId(e.target.value)}
              style={{ width: 180 }}
            />
            <Button type="primary" loading={loading} onClick={() => void runCompare(leftId, rightId)}>
              比較
            </Button>
          </Space>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <PlayerCompareCard
          title="玩家 A"
          profileId={Number(leftId) || 0}
          player={leftPlayer}
          overview={leftOverview}
          loading={loading}
          error={leftError}
        />
      </Col>
      <Col xs={24} md={12}>
        <PlayerCompareCard
          title="玩家 B"
          profileId={Number(rightId) || 0}
          player={rightPlayer}
          overview={rightOverview}
          loading={loading}
          error={rightError}
        />
      </Col>
    </Row>
  )
}
