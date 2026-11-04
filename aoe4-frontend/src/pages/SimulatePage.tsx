import { ExperimentOutlined, PauseCircleOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Descriptions, Flex, InputNumber, Progress, Row, Select, Slider, Spin, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BuildOrderTable } from '../components/planner/BuildOrderTable'
import { GoalEditor } from '../components/planner/GoalEditor'
import { SITE_COLOR, SITE_ZH, clock, describeGoal } from '../components/planner/format'
import { MiniMap } from '../components/planner/MiniMap'
import { BankChart, VillagerChart } from '../components/planner/PlannerCharts'
import { loadCatalog } from '../sim/catalog'
import { buildCivData, nameOf, type CivData } from '../sim/planner/civData'
import { CIV_ZH, GLOBAL_BONUSES, type Bonus } from '../sim/planner/civSpec'
import { MAP_TYPES, generateMap } from '../sim/planner/mapgen'
import type { StartMessage, WorkerOut } from '../sim/planner/planner.worker'
import { presetsFor } from '../sim/planner/presets'
import type { Goal, PlanResult, Policy, Step } from '../sim/planner/types'
import type { Catalog } from '../sim/types'

interface Best {
  result: PlanResult
  policy: Policy
  steps: Step[]
}

const MODELED: Record<Bonus['modeled'], { label: string; color: string }> = {
  yes: { label: '已計入', color: 'green' },
  approx: { label: '近似', color: 'orange' },
  no: { label: '未建模', color: 'default' },
}

const BUDGETS = [
  { value: 8000, label: '8 秒' },
  { value: 20000, label: '20 秒' },
  { value: 60000, label: '1 分鐘' },
]

export function SimulatePage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [civ, setCiv] = useState('ja')
  const [mapType, setMapType] = useState('dry-arabia')
  const [seed, setSeed] = useState(7)
  const [goals, setGoals] = useState<Goal[]>([])
  const [presetId, setPresetId] = useState<string | undefined>(undefined)
  const [idleWeight, setIdleWeight] = useState(0.5)
  const [budget, setBudget] = useState(20000)
  const [best, setBest] = useState<Best | null>(null)
  const [status, setStatus] = useState({ evals: 0, elapsed: 0, running: false })
  const [runToken, setRunToken] = useState(0)
  const [tab, setTab] = useState('bo')
  const workerRef = useRef<Worker | null>(null)
  const runId = useRef(0)

  useEffect(() => {
    Promise.all([loadCatalog(), fetch('/sim/names-zh.json').then((r) => r.json() as Promise<Record<string, string>>)])
      .then(([c, n]) => {
        setCatalog(c)
        setNames(n)
      })
      .catch((e) => setError(String(e)))
  }, [])

  const data: CivData | null = useMemo(() => (catalog ? buildCivData(catalog, civ, names) : null), [catalog, civ, names])
  const presets = useMemo(() => (data ? presetsFor(data) : []), [data])
  const map = useMemo(() => generateMap(mapType, seed), [mapType, seed])

  // 換文明時套用第一個預設流程
  useEffect(() => {
    if (!presets.length) return
    setPresetId(presets[0].id)
    setGoals(presets[0].goals)
  }, [presets])

  useEffect(() => {
    const w = new Worker(new URL('../sim/planner/planner.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data
      if (m.id !== runId.current) return
      if (m.type === 'best') setBest({ result: m.result, policy: m.policy, steps: m.steps })
      else if (m.type === 'progress') setStatus({ evals: m.evals, elapsed: m.elapsed, running: m.running })
      else setError(m.message)
    }
    workerRef.current = w
    return () => w.terminate()
  }, [])

  // 設定一改就重新最佳化（稍微延遲，避免連續輸入時一直重跑）
  useEffect(() => {
    if (!data || !goals.length || !workerRef.current) return
    const h = setTimeout(() => {
      const id = ++runId.current
      setBest(null)
      setStatus({ evals: 0, elapsed: 0, running: true })
      const msg: StartMessage = { type: 'start', id, civ, mapType, seed, goals, idleWeight, budgetMs: budget }
      workerRef.current!.postMessage(msg)
    }, 250)
    return () => clearTimeout(h)
  }, [data, civ, mapType, seed, goals, idleWeight, budget, runToken])

  const stop = () => {
    workerRef.current?.postMessage({ type: 'stop' })
    setStatus((s) => ({ ...s, running: false }))
  }

  if (error) return <Alert type="error" showIcon message="模擬器載入失敗" description={error} />
  if (!catalog || !data) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />

  const result = best?.result
  const goalTimes = goals.map((_, i) => result?.goals.find((g) => g.goalIndex === i)?.t ?? null)
  const civOptions = catalog.civilizations
    .map((c) => ({ value: c.abbr, label: `${CIV_ZH[c.abbr] ?? c.name}　${c.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))

  return (
    <div className="planner">
      <div className="planner-hero">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            <ExperimentOutlined /> 戰術目標規劃器
          </Typography.Title>
          <Typography.Text type="secondary">
            選文明、排好想達成的目標，系統逐秒模擬並即時搜尋每個時間點該做什麼。資料版本 patch {catalog.patch}（aoe4world 17.0.x 資料）。
          </Typography.Text>
        </div>
        <SearchStatus status={status} result={result} onStop={stop} onRestart={() => setRunToken((x) => x + 1)} />
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={9} xl={8}>
          <Flex vertical gap={16}>
            <Card size="small" title="1. 文明與地圖">
              <Flex vertical gap={10}>
                <Select showSearch={{ optionFilterProp: 'label' }} value={civ} onChange={setCiv} options={civOptions} />
                <Flex gap={8}>
                  <Select style={{ flex: 1 }} value={mapType} onChange={setMapType} options={MAP_TYPES.map((m) => ({ value: m.id, label: `${m.name}${m.confidence === 'sourced' ? '' : '（質性）'}` }))} />
                  <InputNumber min={1} max={99999} value={seed} onChange={(v) => setSeed(v ?? 1)} prefix="種子" style={{ width: 130 }} />
                  <Tooltip title="重抽一張地圖">
                    <Button icon={<ReloadOutlined />} onClick={() => setSeed(1 + Math.floor(Math.random() * 99999))} />
                  </Tooltip>
                </Flex>
                <MiniMap map={map} />
                <Flex wrap gap={6} justify="center">
                  {(['berry', 'deer', 'wood', 'gold', 'stone'] as const).map((k) => (
                    <span key={k} className="planner-legend">
                      <i style={{ background: SITE_COLOR[k] }} />
                      {SITE_ZH[k]}
                    </span>
                  ))}
                  <span className="planner-legend">
                    <i style={{ background: '#fff', border: '1px dashed #9b1c1c' }} />
                    爭奪區
                  </span>
                </Flex>
              </Flex>
            </Card>

            <Card size="small" title="2. 目標流程" extra={<Typography.Text type="secondary">由上到下依序達成</Typography.Text>}>
              <Flex vertical gap={10}>
                <Select
                  placeholder="套用預設流程"
                  value={presetId}
                  onChange={(id) => {
                    setPresetId(id)
                    setGoals(presets.find((p) => p.id === id)?.goals ?? [])
                  }}
                  options={presets.map((p) => ({ value: p.id, label: p.label }))}
                />
                <GoalEditor
                  data={data}
                  goals={goals}
                  times={result ? goalTimes : undefined}
                  onChange={(g) => {
                    setPresetId(undefined)
                    setGoals(g)
                  }}
                />
              </Flex>
            </Card>

            <Card size="small" title="3. 最佳化設定">
              <Flex vertical gap={8}>
                <div>
                  <Typography.Text>經濟權重</Typography.Text>
                  <Tooltip title="城鎮中心每閒置 1 秒，分數加多少秒。0 = 只看完成時間（可能為了快而停產村民）；越高越像職業選手，城鎮中心不停產。">
                    <Typography.Text type="secondary"> （城鎮中心閒置懲罰）</Typography.Text>
                  </Tooltip>
                  <Slider min={0} max={2} step={0.1} value={idleWeight} onChange={setIdleWeight} marks={{ 0: '只求快', 0.5: '預設', 2: '重經濟' }} />
                </div>
                <Flex align="center" gap={8}>
                  <Typography.Text>每次最多搜尋</Typography.Text>
                  <Select size="small" style={{ width: 100 }} value={budget} onChange={setBudget} options={BUDGETS} />
                </Flex>
              </Flex>
            </Card>
          </Flex>
        </Col>

        <Col xs={24} lg={15} xl={16}>
          <Flex vertical gap={16}>
            <div className="planner-kpis">
              {goals.map((g, i) => (
                <div key={i} className="planner-kpi">
                  <div className="planner-kpi-label">
                    {i + 1}. {describeGoal(data, g)}
                  </div>
                  <div className="planner-kpi-value">{result ? clock(goalTimes[i]) : <Spin size="small" />}</div>
                </div>
              ))}
              <div className="planner-kpi planner-kpi-muted">
                <div className="planner-kpi-label">完成時村民</div>
                <div className="planner-kpi-value">{result ? result.villagers : '—'}</div>
              </div>
              <div className="planner-kpi planner-kpi-muted">
                <div className="planner-kpi-label">城鎮中心閒置</div>
                <div className="planner-kpi-value">{result ? `${result.tcIdle}s` : '—'}</div>
              </div>
            </div>

            {result?.warnings.map((w) => <Alert key={w} type="warning" showIcon message={w} />)}

            <Card size="small" styles={{ body: { paddingTop: 4 } }}>
              <Tabs
                activeKey={tab}
                onChange={setTab}
                items={[
                  {
                    key: 'bo',
                    label: '建造順序',
                    children: result && best ? (
                      <Flex vertical gap={12}>
                        <StrategySummary data={data} best={best} />
                        <BuildOrderTable events={result.events} compact />
                      </Flex>
                    ) : (
                      <Waiting />
                    ),
                  },
                  { key: 'vill', label: '村民分配', children: result ? <VillagerChart result={result} /> : <Waiting /> },
                  { key: 'bank', label: '資源與收入', children: result ? <BankChart result={result} /> : <Waiting /> },
                  { key: 'civ', label: '文明加成', children: <BonusList data={data} /> },
                  { key: 'map', label: '地圖', children: <MapDetail map={map} /> },
                  { key: 'model', label: '模型說明', children: <ModelNotes /> },
                ]}
              />
            </Card>
          </Flex>
        </Col>
      </Row>
    </div>
  )
}

function Waiting() {
  return (
    <Flex justify="center" style={{ padding: 48 }}>
      <Spin description="正在搜尋第一個可行解…">
        <div style={{ width: 200, height: 40 }} />
      </Spin>
    </Flex>
  )
}

function SearchStatus({ status, result, onStop, onRestart }: { status: { evals: number; elapsed: number; running: boolean }; result?: PlanResult; onStop: () => void; onRestart: () => void }) {
  return (
    <Flex align="center" gap={12} className="planner-status">
      {status.running ? <Progress type="circle" size={34} percent={99} status="active" showInfo={false} /> : <ThunderboltOutlined style={{ fontSize: 26, color: '#2f4f8f' }} />}
      <div>
        <div style={{ fontWeight: 600 }}>{status.running ? '最佳化中…' : result ? '搜尋完成' : '等待中'}</div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          試過 {status.evals.toLocaleString()} 種策略・{(status.elapsed / 1000).toFixed(1)} 秒{result ? `・最佳 ${clock(result.finish)}` : ''}
        </Typography.Text>
      </div>
      {status.running ? (
        <Button icon={<PauseCircleOutlined />} onClick={onStop}>
          停止
        </Button>
      ) : (
        <Button type="primary" icon={<ReloadOutlined />} onClick={onRestart}>
          重新搜尋
        </Button>
      )}
    </Flex>
  )
}

function StrategySummary({ data, best }: { data: CivData; best: Best }) {
  const { policy, steps, result } = best
  const eco = Object.entries(policy.ecoAt)
    .filter(([, at]) => at >= 0)
    .map(([id, at]) => `${nameOf(data, id)}（第 ${at + 1} 步起）`)
  const lastOfGoal = new Map<number, number>()
  steps.forEach((s, i) => lastOfGoal.set(s.goalIndex, i))
  return (
    <Descriptions
      size="small"
      bordered
      column={{ xs: 1, md: 2 }}
      items={[
        {
          key: 'steps',
          label: '步驟',
          span: 2,
          children: (
            <Flex wrap gap={6}>
              {steps.map((s, i) => (
                <Tag key={i} color={s.implicit ? 'default' : 'blue'}>
                  {i + 1}. {s.label}
                  {(s.kind === 'age' || s.forward) && `・${policy.steps[i]?.builders} 人建造`}
                  {s.kind === 'army' && `・${policy.steps[i]?.producers} 座生產建築`}
                  {policy.steps[i]?.stopVills && '・暫停村民'}
                  {lastOfGoal.get(s.goalIndex) === i && ` → ${clock(result.goals.find((g) => g.goalIndex === s.goalIndex)?.t)}`}
                </Tag>
              ))}
            </Flex>
          ),
        },
        { key: 'vills', label: '村民上限', children: `${policy.maxVills} 名（房屋在剩 ${policy.houseBuffer} 格人口時開蓋）` },
        { key: 'hunt', label: '打鹿', children: policy.hunt ? '要（在鹿群旁蓋磨坊）' : '不打，羊吃完直接野果／農田' },
        { key: 'eco', label: '經濟科技', span: 2, children: eco.length ? eco.join('、') : '不研究' },
      ]}
    />
  )
}

function BonusList({ data }: { data: CivData }) {
  const rows = [...data.spec.bonuses.map((b, i) => ({ ...b, key: `c${i}`, scope: data.spec.zh })), ...GLOBAL_BONUSES.map((b, i) => ({ ...b, key: `g${i}`, scope: '全文明' }))]
  return (
    <Flex vertical gap={8}>
      <Typography.Text type="secondary">{data.spec.startNote}</Typography.Text>
      <Table
        size="small"
        pagination={false}
        rowKey="key"
        dataSource={rows}
        columns={[
          { title: '範圍', dataIndex: 'scope', width: 90 },
          { title: '狀態', dataIndex: 'modeled', width: 80, render: (m: Bonus['modeled']) => <Tag color={MODELED[m].color}>{MODELED[m].label}</Tag> },
          {
            title: '加成',
            dataIndex: 'text',
            render: (t: string, r) => (
              <div>
                <div>{t}</div>
                {r.note && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.note}</Typography.Text>}
              </div>
            ),
          },
          {
            title: '來源',
            dataIndex: 'source',
            width: 90,
            render: (s: string) =>
              s.startsWith('http') ? (
                <a href={s} target="_blank" rel="noreferrer">
                  {s.includes('ageofempires.com') ? '官方 17.0' : s.includes('fandom') ? 'Fandom' : 'aoe4world'}
                </a>
              ) : (
                <Tooltip title={s}>
                  <Typography.Text type="secondary">舊版</Typography.Text>
                </Tooltip>
              ),
          },
        ]}
      />
    </Flex>
  )
}

function MapDetail({ map }: { map: ReturnType<typeof generateMap> }) {
  return (
    <Row gutter={16}>
      <Col xs={24} md={10}>
        <MiniMap map={map} size={340} />
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
          附近的羊由斥候牧回：{map.sheepArrivals.map((t) => clock(t)).join('、')}。
        </Typography.Paragraph>
      </Col>
      <Col xs={24} md={14}>
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={[...map.sites].sort((a, b) => a.dist - b.dist)}
          columns={[
            { title: '資源', dataIndex: 'label', render: (l: string, s) => <span><i className="planner-dot" style={{ background: SITE_COLOR[s.kind] }} />{l}</span> },
            { title: '存量', dataIndex: 'amount', align: 'right', render: (n: number) => n.toLocaleString() },
            { title: '距離', dataIndex: 'dist', align: 'right', render: (d: number) => `${d} 格` },
            { title: '', dataIndex: 'contested', render: (c: boolean) => (c ? <Tag color="red">爭奪</Tag> : null) },
          ]}
        />
        <ul className="planner-notes">
          {map.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Col>
    </Row>
  )
}

function ModelNotes() {
  return (
    <div className="planner-model">
      <Typography.Title level={5}>怎麼算的</Typography.Title>
      <ul>
        <li>逐秒模擬。村民聚合在各個採集點上，但走路、交資源往返、羊群陸續牧回、採集點耗盡、蓋投放點、蓋農田、房屋人口、生產佇列都照實計算。</li>
        <li>每趟交資源的有效速率 = 攜帶量 ÷（攜帶量 ÷ 採集速率 + 2 × 到投放點距離 ÷ 移動速度）。砍樹用含砍倒時間的 0.70。</li>
        <li>多人建造：時間 = 基礎 × 3 ÷ (人數 + 2)。這是 Fandom 的公式；用它重算職業選手「2:10 放地標、4 人蓋、3:50 封建」的建造順序是吻合的。</li>
        <li>分配：每 8 秒依「目前步驟還缺的資源 ÷ 各資源的有效速率」重新算目標人數，差距夠大才搬人（搬人要走路）。新村民去最缺的資源。</li>
        <li>最佳化：在 Web Worker 裡做演化式區域搜尋，調整每一步的建造人數、資源偏好、是否暫停村民、生產建築數量、經濟科技時機、地標選擇、村民上限、是否打鹿。每次模擬 1~3 毫秒，一秒能試數百到上千種策略。</li>
        <li>分數 = 最後目標完成時間 + 0.05 × 各目標完成時間總和 + 經濟權重 × 城鎮中心閒置秒數。</li>
      </ul>
      <Typography.Title level={5}>和職業建造順序比較（aoe4guides，Season 13）</Typography.Title>
      <ul>
        <li>英格蘭封建：職業約 3:50~4:10、17~19 村民；這裡的「最快封建」約 3:30，因為最佳化會讓更多人蓋地標，職業選手通常只派 3~4 人。</li>
        <li>日本直城（水鳥居）：職業約 7:45~8:10、約 29 村民；模擬約 7:40、27~28 村民。</li>
        <li>英格蘭直城：職業 7:55~9:00、30~34 村民；模擬約 7:50~8:10、28~30 村民。</li>
      </ul>
      <Typography.Title level={5}>還沒做的</Typography.Title>
      <ul>
        <li>戰鬥、騷擾、斥候偵查、引野豬、釣魚、貿易、聖物。</li>
        <li>建築的影響範圍（光環一律近似為涵蓋所有採集點）。「文明加成」分頁列出每一條是否已計入。</li>
        <li>地圖格數距離沒有公開資料，全部是假設區間；地圖腳本本身（Content Editor 的 playerresources.lua）不公開。</li>
      </ul>
    </div>
  )
}
