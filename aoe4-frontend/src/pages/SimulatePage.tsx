import { ExperimentOutlined, PauseCircleOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Descriptions, Flex, InputNumber, Progress, Row, Select, Spin, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BuildOrderTable } from '../components/planner/BuildOrderTable'
import { GoalEditor } from '../components/planner/GoalEditor'
import { SITE_COLOR, SITE_ZH, clock, describeGoal } from '../components/planner/format'
import { FullMap } from '../components/planner/FullMap'
import { MapTimeline } from '../components/planner/MapTimeline'
import { BankChart, VillagerChart } from '../components/planner/PlannerCharts'
import { loadCatalog } from '../sim/catalog'
import { buildCivData, nameOf, type CivData } from '../sim/planner/civData'
import { CIV_ZH, GLOBAL_BONUSES, type Bonus } from '../sim/planner/civSpec'
import { MAP_TYPES, generateMap } from '../sim/planner/mapgen'
import type { StartMessage, WorkerOut } from '../sim/planner/planner.worker'
import { presetsFor } from '../sim/planner/presets'
import type { Goal, HolySettings, PlanResult, Policy, PostArmy, Step } from '../sim/planner/types'
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
  na: { label: '不影響規劃', color: 'blue' },
}

const BUDGETS = [
  { value: 20000, label: '20 秒' },
  { value: 60000, label: '1 分鐘' },
  { value: 120000, label: '2 分鐘' },
  { value: 300000, label: '5 分鐘' },
]

/** 平行搜尋的 worker 數：留一個核心給畫面，最多 6 個 */
const WORKERS = Math.max(1, Math.min(6, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4) - 1))

/** 和搜尋同一套比較：先比城鎮中心中斷秒數，再比分數 */
const isBetter = (a: PlanResult, b: PlanResult) => (a.tcIdle !== b.tcIdle ? a.tcIdle < b.tcIdle : a.score < b.score - 1e-6)

export function SimulatePage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [civ, setCiv] = useState('ja')
  const [mapType, setMapType] = useState('dry-arabia')
  const [seed, setSeed] = useState(7)
  const [goals, setGoals] = useState<Goal[]>([])
  const [presetId, setPresetId] = useState<string | undefined>(undefined)
  const [budget, setBudget] = useState(60000)
  const [post, setPost] = useState<PostArmy>({ units: 30, upgrades: 2 })
  // 聖物與聖地：地圖腳本不公開，數量與距離都是假設（1v1 地圖 5 個聖物，乾燥阿拉伯 3 個聖地；自己能拿到的取一部分）
  const [holyOn, setHolyOn] = useState(false)
  const [holy, setHoly] = useState<HolySettings>({ relics: 2, relicDist: 40, sites: 1, siteDist: 48 })
  const [best, setBest] = useState<Best | null>(null)
  const [status, setStatus] = useState({ evals: 0, elapsed: 0, running: false })
  const [runToken, setRunToken] = useState(0)
  const [tab, setTab] = useState('bo')
  const workerRef = useRef<Worker[]>([])
  const runId = useRef(0)
  const bestRef = useRef<PlanResult | null>(null)
  const progress = useRef<{ evals: number; elapsed: number; running: boolean }[]>([])

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

  // 平行開好幾個 worker，各用不同亂數種子搜；畫面只顯示目前最好的那個結果
  useEffect(() => {
    const ws = Array.from({ length: WORKERS }, (_, k) => {
      const w = new Worker(new URL('../sim/planner/planner.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data
        if (m.id !== runId.current) return
        if (m.type === 'best') {
          if (!bestRef.current || isBetter(m.result, bestRef.current)) {
            bestRef.current = m.result
            setBest({ result: m.result, policy: m.policy, steps: m.steps })
          }
        } else if (m.type === 'progress') {
          progress.current[k] = { evals: m.evals, elapsed: m.elapsed, running: m.running }
          const ps = progress.current.filter(Boolean)
          setStatus({ evals: ps.reduce((s, p) => s + p.evals, 0), elapsed: Math.max(...ps.map((p) => p.elapsed)), running: ps.some((p) => p.running) })
        } else setError(m.message)
      }
      return w
    })
    workerRef.current = ws
    return () => ws.forEach((w) => w.terminate())
  }, [])

  // 設定一改就重新最佳化（稍微延遲，避免連續輸入時一直重跑）
  useEffect(() => {
    if (!data || !goals.length || !workerRef.current.length) return
    const h = setTimeout(() => {
      const id = ++runId.current
      setBest(null)
      bestRef.current = null
      progress.current = []
      setStatus({ evals: 0, elapsed: 0, running: true })
      workerRef.current.forEach((w, k) => {
        const msg: StartMessage = { type: 'start', id, civ, mapType, seed, goals, post, holy: holyOn ? holy : undefined, budgetMs: budget, worker: k }
        w.postMessage(msg)
      })
    }, 250)
    return () => clearTimeout(h)
  }, [data, civ, mapType, seed, goals, post, holyOn, holy, budget, runToken])

  const stop = () => {
    workerRef.current.forEach((w) => w.postMessage({ type: 'stop' }))
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
                <FullMap map={map} />
                <Flex wrap gap={6} justify="center">
                  {(['berry', 'deer', 'wood', 'gold', 'stone'] as const).map((k) => (
                    <span key={k} className="planner-legend">
                      <i style={{ background: SITE_COLOR[k] }} />
                      {SITE_ZH[k]}
                    </span>
                  ))}
                  <span className="planner-legend">
                    <i style={{ background: 'transparent', border: '1px dashed #e0533f' }} />
                    爭奪區
                  </span>
                  <span className="planner-legend">
                    <i style={{ background: '#4f9bf0', borderRadius: 2 }} />你
                  </span>
                  <span className="planner-legend">
                    <i style={{ background: '#e0533f', borderRadius: 2 }} />對手
                  </span>
                </Flex>
              </Flex>
            </Card>

            <Card size="small" title="2. 目標流程" extra={<Typography.Text type="secondary">由上到下依序達成</Typography.Text>}>
              <GoalEditor
                data={data}
                goals={goals}
                times={result ? goalTimes : undefined}
                presets={presets}
                presetId={presetId}
                onPreset={(p) => {
                  setPresetId(p.id)
                  setGoals(p.goals)
                }}
                onChange={(g) => {
                  setPresetId(undefined)
                  setGoals(g)
                }}
              />
            </Card>

            <Card size="small" title="3. 目標達成之後">
              <Flex vertical gap={8}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  遊戲不會停在目標：達成後繼續模擬「全力出兵」，同時蓋兵營、靶場、馬廄出步兵、弓兵、騎兵（各取最便宜的，求數量），並在鐵匠舖研究升級。最佳化會同時考慮目標時間與之後的出兵速度，所以不會為了目標把村民全拉去蓋地標。
                </Typography.Text>
                <Flex align="center" gap={8} wrap>
                  <Typography.Text>出兵目標</Typography.Text>
                  <Select
                    size="small"
                    style={{ width: 110 }}
                    value={post.units}
                    onChange={(units) => setPost((p) => ({ ...p, units }))}
                    options={[0, 15, 30, 50, 80].map((n) => ({ value: n, label: n ? `${n} 名軍隊` : '不模擬' }))}
                  />
                  <Select
                    size="small"
                    style={{ width: 110 }}
                    value={post.upgrades}
                    onChange={(upgrades) => setPost((p) => ({ ...p, upgrades }))}
                    options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: n ? `${n} 項升級` : '不升級' }))}
                  />
                </Flex>
              </Flex>
            </Card>

            <Card size="small" title="聖物與聖地">
              <Flex vertical gap={8}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  城堡時代起（德里研究聖域後從封建起）由引擎補修道院類建築與 1 名宗教單位去撿聖物（每個每分鐘 80 黃金）、站聖地 30 秒佔領（每個每分鐘 100 黃金）；拿幾個由最佳化決定。地圖腳本不公開，下面的數量（自己能安全拿到的）與距離（格）都是假設，對手爭奪不建模。
                </Typography.Text>
                <Flex align="center" gap={8} wrap>
                  <Select
                    size="small"
                    style={{ width: 110 }}
                    value={holyOn ? 'on' : 'off'}
                    onChange={(v) => setHolyOn(v === 'on')}
                    options={[
                      { value: 'off', label: '不模擬' },
                      { value: 'on', label: '模擬' },
                    ]}
                  />
                  <InputNumber size="small" min={0} max={5} value={holy.relics} disabled={!holyOn} onChange={(v) => setHoly((h) => ({ ...h, relics: v ?? 0 }))} prefix="聖物" suffix="個" style={{ width: 110 }} />
                  <InputNumber size="small" min={5} max={150} value={holy.relicDist} disabled={!holyOn} onChange={(v) => setHoly((h) => ({ ...h, relicDist: v ?? 40 }))} prefix="距離" suffix="格" style={{ width: 120 }} />
                  <InputNumber size="small" min={0} max={3} value={holy.sites} disabled={!holyOn} onChange={(v) => setHoly((h) => ({ ...h, sites: v ?? 0 }))} prefix="聖地" suffix="個" style={{ width: 110 }} />
                  <InputNumber size="small" min={5} max={150} value={holy.siteDist} disabled={!holyOn} onChange={(v) => setHoly((h) => ({ ...h, siteDist: v ?? 48 }))} prefix="距離" suffix="格" style={{ width: 120 }} />
                </Flex>
              </Flex>
            </Card>

            <Card size="small" title="4. 搜尋">
              <Flex vertical gap={8}>
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
              {result?.armyAt != null && (
                <div className="planner-kpi planner-kpi-army">
                  <div className="planner-kpi-label">
                    目標後全力出兵：{post.units} 兵{result.postUpgrades || post.upgrades ? ` + ${post.upgrades} 升級` : ''}
                  </div>
                  <Tooltip title={armyText(result, (id) => nameOf(data, id))}>
                    <div className="planner-kpi-value">{clock(result.armyAt)}</div>
                  </Tooltip>
                </div>
              )}
              <div className="planner-kpi planner-kpi-muted">
                <div className="planner-kpi-label">目標達成時村民</div>
                <div className="planner-kpi-value">{result ? result.villagersAtGoal : '—'}</div>
              </div>
              <div className="planner-kpi planner-kpi-muted">
                <div className="planner-kpi-label">目標達成時累計採集</div>
                <Tooltip
                  title={
                    result
                      ? `食物 ${Math.round(result.gatheredByRes.food)}、木材 ${Math.round(result.gatheredByRes.wood)}、黃金 ${Math.round(result.gatheredByRes.gold)}、石頭 ${Math.round(result.gatheredByRes.stone)}（含被動收入）。評分的次要條件：每 100 資源抵 1 秒。`
                      : null
                  }
                >
                  <div className="planner-kpi-value">{result ? Math.round(result.gatheredAtGoal).toLocaleString() : '—'}</div>
                </Tooltip>
              </div>
              <div className="planner-kpi planner-kpi-muted">
                <div className="planner-kpi-label">城鎮中心中斷村民</div>
                <Tooltip title={result ? idleText(result) : null}>
                  <div className="planner-kpi-value" style={{ color: result && result.tcIdle > 0 ? '#e0533f' : undefined }}>
                    {result ? `${result.tcIdle}s` : '—'}
                  </div>
                </Tooltip>
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
                  {
                    key: 'map',
                    label: '地圖時間軸',
                    children: (
                      <Flex vertical gap={16}>
                        {result ? <MapTimeline map={map} result={result} nameOf={(id) => nameOf(data, id)} /> : <Waiting />}
                        <MapDetail map={map} />
                      </Flex>
                    ),
                  },
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

function armyText(r: PlanResult, name: (id: string) => string) {
  const mix = Object.entries(r.postMix)
    .map(([id, n]) => `${name(id)} ${n}`)
    .join('、')
  const techs = r.postTechs.map(name).join('、')
  return `${mix || '沒有出兵'}${techs ? `；升級：${techs}` : ''}`
}

function idleText(r: PlanResult) {
  const parts = Object.entries(r.tcIdleReasons).map(([k, v]) => `${k} ${v} 秒`)
  return parts.length ? `原因：${parts.join('、')}` : '城鎮中心全程不中斷'
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
      {status.running ? <Progress type="circle" size={34} percent={99} status="active" showInfo={false} /> : <ThunderboltOutlined style={{ fontSize: 26, color: '#d4aa5f' }} />}
      <div>
        <div style={{ fontWeight: 600 }}>{status.running ? '最佳化中…' : result ? '搜尋完成' : '等待中'}</div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          試過 {status.evals.toLocaleString()} 種策略・{(status.elapsed / 1000).toFixed(1)} 秒{result ? `・目標 ${clock(result.finish)}${result.armyAt != null ? `・出兵 ${clock(result.armyAt)}` : ''}` : ''}
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
          span: 'filled',
          children: (
            <Flex wrap gap={6}>
              {steps.map((s, i) => (
                <Tag key={i} color={s.implicit ? 'default' : 'blue'}>
                  {i + 1}. {s.label}
                  {(s.kind === 'age' || s.forward) && `・${policy.steps[i]?.builders} 人建造`}
                  {s.kind === 'army' && `・${policy.steps[i]?.producers} 座生產建築`}
                  {lastOfGoal.get(s.goalIndex) === i && ` → ${clock(result.goals.find((g) => g.goalIndex === s.goalIndex)?.t)}`}
                </Tag>
              ))}
            </Flex>
          ),
        },
        { key: 'vills', label: '村民生產', children: `所有城鎮中心不中斷（硬性規則）；房屋依生產速度提前蓋，另加 ${policy.houseBuffer} 格緩衝` },
        { key: 'hunt', label: '打鹿', children: policy.hunt ? '要（在鹿群旁蓋磨坊）' : '不打，羊吃完直接野果／農田' },
        { key: 'eco', label: '經濟科技', span: 'filled', children: eco.length ? eco.join('、') : '不研究' },
        ...(data.spec.trickles.length
          ? [
              {
                key: 'trickle',
                label: '加蓋的被動收入建築',
                span: 'filled' as const,
                children:
                  data.spec.trickles
                    .map((tr) => ({ tr, p: policy.trickle?.[tr.building] }))
                    .filter((x) => x.p && x.p.count > 0)
                    .map((x) => `${nameOf(data, x.tr.building)} × ${Math.min(x.tr.max, x.p!.count)}（第 ${x.p!.at + 1} 步起）`)
                    .join('、') || '不蓋',
              },
            ]
          : []),
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
      <Col xs={24} md={14}>
        <Typography.Title level={5}>自家起始資源</Typography.Title>
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={[...map.sites].sort((a, b) => a.dist - b.dist)}
          columns={[
            {
              title: '資源',
              dataIndex: 'label',
              render: (l: string, s) => (
                <span>
                  <i className="planner-dot" style={{ background: SITE_COLOR[s.kind] }} />
                  {l}
                </span>
              ),
            },
            { title: '存量', dataIndex: 'amount', align: 'right', render: (n: number) => n.toLocaleString() },
            { title: '距離', dataIndex: 'dist', align: 'right', render: (d: number) => `${d} 格` },
            { title: '', dataIndex: 'contested', render: (c: boolean) => (c ? <Tag color="red">爭奪</Tag> : null) },
          ]}
        />
      </Col>
      <Col xs={24} md={10}>
        <Typography.Title level={5}>地圖設定</Typography.Title>
        <ul className="planner-notes">
          <li>
            全圖約 {map.size}×{map.size} 格，兩座城鎮中心相距 {map.enemyDist} 格，對手的資源是自家資源對地圖中心點的鏡像。
          </li>
          <li>附近的羊由斥候牧回：{map.sheepArrivals.map((t) => clock(t)).join('、')}。</li>
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
        <li>最佳化：在 Web Worker 裡做演化式區域搜尋，調整每一步的建造人數、資源偏好、生產建築數量、經濟科技時機、地標選擇、房屋緩衝、是否打鹿。每次模擬 1~3 毫秒，一秒能試數百到上千種策略。</li>
        <li>硬性規則：所有城鎮中心不中斷村民生產。其他花費一律先留下一批村民的費用；房屋依生產速度提前蓋；軍隊不能佔掉下一名村民的人口；城鎮中心不拿來訓練軍隊或研究經濟科技。只有人口 200 不算中斷。</li>
        <li>聖殿騎士團等「在城鎮中心研究升代」的文明，研究期間城鎮中心不能出村民，這段會照實記為中斷，並在「城鎮中心中斷村民」顯示原因。</li>
        <li>目標達成後的「全力出兵」：照「3. 目標達成之後」的設定，同時運作的兵營、靶場、馬廄數量由最佳化決定，每座都訓練該時代最便宜的單位，鐵匠舖（日本、戰國是鍛造場）由便宜到貴研究升級；維京、馬其頓沒有鐵匠舖，不計升級。</li>
        <li>有出兵目標時，分數 = 達成出兵目標的時間 + 0.5 × 最後目標完成時間（目標仍要快，但會為了之後的經濟稍微讓步）；沒有出兵目標時，分數 = 最後目標完成時間。</li>
        <li>地圖：兩座城鎮中心沿對角線相對，對手資源是自家資源對地圖中心的鏡像（17.0 起 1v1 出生點鏡像對稱）；中央大金礦、野豬放在中間地帶。地圖腳本本身不公開，距離與地圖大小都是假設。</li>
        <li>分數（細項）= 上面的時間 + 0.05 × 各目標完成時間總和 + 60 × 中斷秒數（每中斷 1 秒等於慢 1 分鐘，所以搜尋只會在真的無法避免時接受中斷）。</li>
      </ul>
      <Typography.Title level={5}>和職業建造順序比較（aoe4guides，Season 13）</Typography.Title>
      <ul>
        <li>英格蘭封建：職業約 3:50~4:10、17~19 村民；這裡的「最快封建」約 3:30，因為最佳化會讓更多人蓋地標，職業選手通常只派 3~4 人。</li>
        <li>日本直城（水鳥居）：職業約 7:45~8:10、約 29 村民；模擬約 7:40、27~28 村民。</li>
        <li>英格蘭直城：職業 7:55~9:00、30~34 村民；模擬約 7:50~8:10、28~30 村民。</li>
      </ul>
      <Typography.Title level={5}>還沒做的</Typography.Title>
      <ul>
        <li>戰鬥、騷擾、斥候偵查、引野豬、釣魚、貿易；聖物與聖地只算自己安全拿到的（數量、距離是假設），對手爭奪不建模。</li>
        <li>建築的影響範圍（光環一律近似為涵蓋所有採集點）。「文明加成」分頁列出每一條是否已計入。</li>
        <li>地圖格數距離沒有公開資料，全部是假設區間；地圖腳本本身（Content Editor 的 playerresources.lua）不公開。</li>
      </ul>
    </div>
  )
}
