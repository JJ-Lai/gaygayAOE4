import { CaretRightOutlined, PauseOutlined } from '@ant-design/icons'
import { Button, Col, Flex, Row, Segmented, Slider, Table, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { GameMap, PlanResult } from '../../sim/planner/types'
import { FullMap } from './FullMap'
import { AGE_ZH, RES_COLOR, RES_LABEL, SITE_COLOR, clock, sampleAt } from './format'

/** 地圖隨時間部署：拖時間軸或播放，看建築、各採集點人數、資源與時代 */
export function MapTimeline({ map, result, nameOf }: { map: GameMap; result: PlanResult; nameOf: (id: string) => string }) {
  const end = result.samples.length ? result.samples[result.samples.length - 1].t : 0
  const [t, setT] = useState(end)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(20)

  // 結果換了就跳到最後
  useEffect(() => {
    setT(end)
    setPlaying(false)
  }, [end, result])

  useEffect(() => {
    if (!playing) return
    const h = setInterval(() => {
      setT((x) => {
        const n = x + speed / 5
        if (n >= end) {
          setPlaying(false)
          return end
        }
        return n
      })
    }, 200)
    return () => clearInterval(h)
  }, [playing, speed, end])

  const s = sampleAt(result.samples, t)
  const marks = useMemo(() => {
    const m: Record<number, { label: string; style?: CSSProperties }> = {}
    for (const [a, at] of Object.entries(result.ageTimes)) if (Number(a) > 1) m[at] = { label: AGE_ZH[Number(a)], style: { color: '#7fb2f0', fontSize: 11 } }
    if (Number.isFinite(result.finish)) m[result.finish] = { label: '目標', style: { color: '#f0d08a', fontSize: 11 } }
    if (result.armyAt != null && Number.isFinite(result.armyAt)) m[result.armyAt] = { label: '出兵', style: { color: '#e0533f', fontSize: 11 } }
    return m
  }, [result])

  const labelOf = (id: string) => (id === 'sheep' ? '羊（城鎮中心旁）' : id === 'farm' ? '農田' : (map.sites.find((x) => x.id === id)?.label ?? id))
  const kindOf = (id: string) => (id === 'farm' ? 'berry' : id === 'sheep' ? 'sheep' : (map.sites.find((x) => x.id === id)?.kind ?? 'wood'))
  const rows = (s?.sites ?? []).filter((x) => x.workers > 0 || (x.id !== 'farm' && x.left > 0 && map.sites.find((y) => y.id === x.id && !y.contested)))

  return (
    <Row gutter={[16, 12]}>
      <Col xs={24} lg={13}>
        <FullMap map={map} result={result} t={t} nameOf={nameOf} maxWidth={520} />
        <Flex align="center" gap={8} style={{ marginTop: 8 }}>
          <Button
            shape="circle"
            icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
            onClick={() => {
              if (!playing && t >= end) setT(0)
              setPlaying(!playing)
            }}
            aria-label={playing ? '暫停' : '播放'}
          />
          <code style={{ minWidth: 44 }}>{clock(t)}</code>
          <Slider style={{ flex: 1 }} min={0} max={Math.max(1, end)} step={5} value={t} onChange={(v) => setT(v)} marks={marks} tooltip={{ formatter: (v) => clock(v ?? 0) }} />
        </Flex>
        <Flex align="center" gap={8} justify="flex-end">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            播放速度
          </Typography.Text>
          <Segmented size="small" value={speed} onChange={setSpeed} options={[{ value: 10, label: '10×' }, { value: 20, label: '20×' }, { value: 60, label: '60×' }]} />
        </Flex>
      </Col>
      <Col xs={24} lg={11}>
        {s && (
          <Flex vertical gap={10}>
            <Flex gap={8} wrap>
              <Tag color="gold">{AGE_ZH[s.age]}時代</Tag>
              <Tag>村民 {s.villagers}</Tag>
              <Tag>
                人口 {s.pop}/{s.popCap}
              </Tag>
              <Tag color="volcano">軍隊 {s.army}</Tag>
              {s.farms > 0 && <Tag>農田 {s.farms}</Tag>}
            </Flex>
            <div className="planner-bank">
              {(['food', 'wood', 'gold', 'stone'] as const).map((r) => (
                <div key={r} className="planner-bank-cell" style={{ borderColor: RES_COLOR[r] }}>
                  <div className="planner-bank-label">{RES_LABEL[r]}</div>
                  <div className="planner-bank-value">{Math.round(s.bank[r])}</div>
                  <div className="planner-bank-sub">
                    {s.split[r]} 人・{Math.round(s.income[r])}/分
                  </div>
                </div>
              ))}
            </div>
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={rows}
              columns={[
                {
                  title: '採集點',
                  dataIndex: 'id',
                  render: (id: string) => (
                    <span>
                      <i className="planner-dot" style={{ background: SITE_COLOR[kindOf(id)] }} />
                      {labelOf(id)}
                    </span>
                  ),
                },
                { title: '人數', dataIndex: 'workers', align: 'right', width: 60 },
                { title: '剩餘', dataIndex: 'left', align: 'right', width: 80, render: (v: number, x) => (x.id === 'farm' ? '—' : Math.max(0, Math.round(v)).toLocaleString()) },
              ]}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              地圖上藍色數字是該採集點此刻的人數；虛線框是還在蓋的建築，金色是地標；淡掉的資源已經採完。對手那一側只畫起始資源。
            </Typography.Text>
          </Flex>
        )}
      </Col>
    </Row>
  )
}
