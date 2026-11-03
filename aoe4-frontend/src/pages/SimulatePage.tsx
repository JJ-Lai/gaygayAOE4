import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Typography,
} from 'antd'
import ReactECharts from 'echarts-for-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadCatalog } from '../sim/catalog.ts'
import { clock, defaultUnit, militaryUnits, optimize } from '../sim/engine.ts'
import { openingFor } from '../sim/openings.ts'
import { scenariosFor } from '../sim/scenarios.ts'
import type { Catalog, CatalogItem, Resources, Scenario, SolveResult } from '../sim/types.ts'

const CIV_ZH: Record<string, string> = {
  ab: '阿拔斯王朝',
  ay: '阿尤布',
  by: '拜占庭',
  ch: '中國',
  de: '德里蘇丹國',
  en: '英格蘭',
  fr: '法蘭西',
  gol: '金帳汗國',
  hr: '神聖羅馬帝國',
  hl: '蘭開斯特',
  ja: '日本',
  je: '聖女貞德',
  jin: '金朝',
  kt: '聖殿騎士團',
  mac: '馬其頓王朝',
  ma: '馬利',
  mo: '蒙古',
  od: '龍騎士團',
  ot: '鄂圖曼',
  ru: '羅斯',
  sco: '蘇格蘭',
  sen: '戰國大名',
  tug: '圖格魯克',
  vik: '維京',
  zx: '朱熹傳承',
}

const emptyIncome = (): Resources => ({ food: 600, wood: 300, gold: 200, stone: 0 })

export function SimulatePage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [civ, setCiv] = useState('en')
  const [scenarioId, setScenarioId] = useState('age-2')
  const [unitId, setUnitId] = useState('longbowman')
  const [unitCount, setUnitCount] = useState(8)
  const [buildingCount, setBuildingCount] = useState(1)
  const [foodSource, setFoodSource] = useState('sheep')
  const [foodAmount, setFoodAmount] = useState(2000)
  const [walk, setWalk] = useState(false)
  const [dropoffTiles, setDropoffTiles] = useState(1.5)
  const english = openingFor('en')
  const [startFood, setStartFood] = useState(english.food)
  const [startWood, setStartWood] = useState(english.wood)
  const [startGold, setStartGold] = useState(english.gold)
  const [startStone, setStartStone] = useState(english.stone)
  const [startVillagers, setStartVillagers] = useState(english.villagers)
  const [incomePerMin, setIncomePerMin] = useState<Resources>(emptyIncome)
  const [incomeVillagers, setIncomeVillagers] = useState(20)
  const [incomeMode, setIncomeMode] = useState<Scenario['incomeMode']>('min-villagers')
  const [result, setResult] = useState<SolveResult | null>(null)
  const [solving, setSolving] = useState(false)

  useEffect(() => {
    void loadCatalog()
      .then(setCatalog)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '載入失敗'))
  }, [])

  const opening = useMemo(() => openingFor(civ), [civ])
  const choices = useMemo(() => (catalog ? scenariosFor(catalog, civ) : []), [catalog, civ])
  const selected = choices.find((choice) => choice.id === scenarioId) ?? choices[0]
  const units = useMemo(() => (catalog ? militaryUnits(catalog, civ) : []), [catalog, civ])

  useEffect(() => {
    if (!choices.length) return
    if (!choices.some((choice) => choice.id === scenarioId)) setScenarioId(choices[0].id)
  }, [choices, scenarioId])

  useEffect(() => {
    if (!selected) return
    setBuildingCount(selected.buildings[0]?.count ?? 1)
    if (selected.id !== 'custom-army') setUnitCount(selected.units[0]?.count ?? 8)
  }, [civ, selected])

  useEffect(() => {
    if (!catalog) return
    if (!units.some((unit) => unit.id === unitId)) {
      setUnitId(defaultUnit(catalog, civ) ?? '')
    }
  }, [catalog, civ, unitId, units])

  function buildScenario(): Scenario | null {
    if (!catalog || !selected) return null
    const custom = selected.id === 'custom-army'
    const scenarioUnits = custom
      ? (unitId ? [{ id: unitId, count: unitCount }] : [])
      : selected.units.map((unit, index) => ({ id: unit.id, count: index === 0 ? unitCount : unit.count }))
    const buildings = selected.buildings.map((building, index) => ({
      id: building.id,
      count: index === 0 ? buildingCount : building.count,
    }))
    return {
      mode: selected.mode,
      civ,
      targetAge: selected.targetAge,
      units: scenarioUnits.filter((unit) => unit.count > 0),
      buildings: buildings.filter((building) => building.count > 0),
      horizon: selected.horizon,
      foodSource,
      foodAmount,
      walk,
      dropoffTiles,
      gatherMultiplier: 1,
      startFood,
      startWood,
      startGold,
      startStone,
      startVillagers,
      incomePerMin,
      incomeVillagers,
      incomeMode,
      incomeWeights: { food: 1, wood: 1, gold: 2, stone: 1 },
    }
  }

  function solve() {
    if (!catalog) return
    const scenario = buildScenario()
    if (!scenario) return
    setSolving(true)
    window.setTimeout(() => {
      try {
        setResult(optimize(catalog, scenario))
        setError(null)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '求解失敗')
      } finally {
        setSolving(false)
      }
    }, 30)
  }

  useEffect(() => {
    if (catalog && !result && !solving) solve()
    // Initial solve only. Later runs go through the button so slider drags stay responsive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog])

  const resourceChart = useMemo(() => chartOf(result, 'bank'), [result])
  const assignChart = useMemo(() => chartOf(result, 'assign'), [result])

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Typography.Title level={3} style={{ marginTop: 0 }}>戰術模擬</Typography.Title>
        <Typography.Paragraph type="secondary">
          先選文明，再選情境。換文明會帶入該文明的開局資源和工人。城鎮中心不中斷這些工人：付得起就接著生產，並留下下一個的食物和黃金。
          磨坊、伐木場、採礦場裡會提高村民效率的科技，只在回本且不佔用城鎮中心時才研究。每個時間點會列出有幾個人在採哪種資源。
        </Typography.Paragraph>
        {catalog && (
          <Alert
            type="info"
            showIcon
            title={`已載入 ${catalog.civilizations.length} 個文明，資料版本 ${catalog.patch}`}
            description="單位花費、訓練時間、移動速度、建築時間來自 AoE4 World 對遊戲檔的解析。採集速率是羊 0.75、野果 0.69、鹿 0.825、野豬 0.9、木金石 0.75（每秒），再乘上該文明的節點修正與已研究科技。這是不含趕羊與碰撞的下界。"
          />
        )}
        {error && <Alert style={{ marginTop: 12 }} type="error" title={error} />}
      </Card>

      <Card title="1. 選擇文明">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Field label="文明">
              <Select
                style={{ width: '100%' }}
                value={civ}
                showSearch
                optionFilterProp="label"
                options={(catalog?.civilizations ?? []).map((item) => ({
                  value: item.abbr,
                  label: `${CIV_ZH[item.abbr] ?? item.name} · ${item.name}`,
                }))}
                onChange={(value) => {
                  const next = openingFor(value)
                  setCiv(value)
                  setStartFood(next.food)
                  setStartWood(next.wood)
                  setStartGold(next.gold)
                  setStartStone(next.stone)
                  setStartVillagers(next.villagers)
                  setResult(null)
                }}
              />
            </Field>
          </Col>
          <Col xs={12} md={4}>
            <Field label={`起始${opening.workerLabel}`}>
              <InputNumber min={1} max={30} value={startVillagers} onChange={(value) => setStartVillagers(value ?? 6)} />
            </Field>
          </Col>
          <Col xs={12} md={4}><Num label="起始食物" value={startFood} onChange={setStartFood} /></Col>
          <Col xs={12} md={4}><Num label="起始木材" value={startWood} onChange={setStartWood} /></Col>
          <Col xs={12} md={4}><Num label="起始黃金" value={startGold} onChange={setStartGold} /></Col>
          <Col xs={12} md={4}><Num label="起始石頭" value={startStone} onChange={setStartStone} /></Col>
          <Col xs={24} md={8}>
            <Field label="食物來源">
              <Select
                style={{ width: '100%' }}
                value={foodSource}
                options={(catalog?.gather.sources ?? []).filter((source) => source.resource === 'food').map((source) => ({
                  value: source.id,
                  label: `${source.label} · ${((catalog?.gather.civRates[civ]?.[source.id] ?? source.rate) * (source.id === 'farm' ? (opening.farmGather ?? opening.gather) : opening.gather)).toFixed(3)}/秒`,
                }))}
                onChange={setFoodSource}
              />
            </Field>
          </Col>
          <Col xs={12} md={4}>
            <Num label="地圖食物存量" value={foodAmount} onChange={setFoodAmount} />
          </Col>
          <Col xs={12} md={6}>
            <Field label="計算往返 / 距離（格）">
              <Space>
                <Switch checked={walk} onChange={setWalk} />
                <InputNumber min={0} max={8} step={0.5} disabled={!walk} value={dropoffTiles} onChange={(value) => setDropoffTiles(value ?? 0)} />
              </Space>
            </Field>
          </Col>
        </Row>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          {opening.detail}
        </Typography.Paragraph>
      </Card>

      <Card title="2. 選擇情境">
        <Field label="這個文明做得到的情境">
          <Select
            style={{ width: '100%', maxWidth: 520 }}
            value={selected?.id}
            disabled={!selected}
            showSearch
            optionFilterProp="label"
            options={choices.map((choice) => ({ value: choice.id, label: choice.label }))}
            onChange={(value) => {
              setScenarioId(value)
              setResult(null)
            }}
          />
        </Field>
        {selected && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
            {selected.detail}
          </Typography.Paragraph>
        )}
        <Space wrap>
          {selected?.buildings[0] && (
            <Num
              label={`${catalog?.items[civ]?.find((item) => item.id === selected.buildings[0].id)?.name ?? '建築'} 數量`}
              value={buildingCount}
              onChange={setBuildingCount}
            />
          )}
          {selected && selected.id === 'custom-army' && (
            <Field label="單位">
              <Select
                style={{ width: 280 }}
                showSearch
                optionFilterProp="label"
                value={unitId || undefined}
                options={units.map((unit) => ({ value: unit.id, label: `${unit.name} · 時代 ${unit.minAge}` }))}
                onChange={setUnitId}
              />
            </Field>
          )}
          {selected && selected.units.length > 0 && (
            <Num
              label={`${selected.id === 'custom-army' ? (units.find((unit) => unit.id === unitId)?.name ?? '部隊') : (catalog?.items[civ]?.find((item) => item.id === selected.units[0].id)?.name ?? '部隊')} 數量`}
              value={unitCount}
              onChange={setUnitCount}
            />
          )}
          {selected?.mode === 'income' && (
            <>
              <Field label="目標">
                <Select
                  style={{ width: 280 }}
                  value={incomeMode}
                  options={[
                    { value: 'min-villagers', label: '用最少村民達到產量' },
                    { value: 'max-weight', label: '固定村民、最大化加權收入' },
                  ]}
                  onChange={(value) => setIncomeMode(value)}
                />
              </Field>
              {incomeMode === 'min-villagers' ? (
                <>
                  <Num label="食物 / 分" value={incomePerMin.food} onChange={(value) => setIncomePerMin({ ...incomePerMin, food: value })} />
                  <Num label="木材 / 分" value={incomePerMin.wood} onChange={(value) => setIncomePerMin({ ...incomePerMin, wood: value })} />
                  <Num label="黃金 / 分" value={incomePerMin.gold} onChange={(value) => setIncomePerMin({ ...incomePerMin, gold: value })} />
                  <Num label="石頭 / 分" value={incomePerMin.stone} onChange={(value) => setIncomePerMin({ ...incomePerMin, stone: value })} />
                </>
              ) : (
                <Num label="村民數" value={incomeVillagers} onChange={setIncomeVillagers} />
              )}
            </>
          )}
        </Space>
        <Button type="primary" style={{ marginTop: 16 }} loading={solving} disabled={!catalog || !selected} onClick={solve}>
          求解
        </Button>
      </Card>

      {result && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}><Card><Statistic title="目標值" value={result.objectiveLabel} /></Card></Col>
            <Col xs={12} md={6}><Card><Statistic title="結束時代" value={result.age} /></Card></Col>
            <Col xs={12} md={6}><Card><Statistic title="村民" value={Number(result.villagers.toFixed(1))} /></Card></Col>
            <Col xs={12} md={6}><Card><Statistic title="搜過的配置" value={result.tried} /></Card></Col>
          </Row>
          <Card title={result.feasible ? '求解結果' : '未在時限內完成'}>
            <Typography.Paragraph>{result.summary}</Typography.Paragraph>
            {result.notes.map((note) => (
              <Typography.Paragraph key={note} type="secondary">{note}</Typography.Paragraph>
            ))}
            <Typography.Title level={5}>這個時間點的線性式</Typography.Title>
            <pre style={{ background: '#fafafa', padding: 12, overflow: 'auto' }}>{result.formulation}</pre>
          </Card>
          <Card title="每個時間的村民配置">
            <Table
              size="small"
              pagination={{ pageSize: 12 }}
              rowKey="key"
              dataSource={assignmentRows(result.timeline)}
              columns={[
                { title: '時間', dataIndex: 'time', width: 90 },
                { title: '村民', dataIndex: 'villagers', width: 80 },
                { title: '食物', dataIndex: 'food', width: 80 },
                { title: '木材', dataIndex: 'wood', width: 80 },
                { title: '黃金', dataIndex: 'gold', width: 80 },
                { title: '石頭', dataIndex: 'stone', width: 80 },
                { title: '建造', dataIndex: 'building', width: 80 },
              ]}
            />
          </Card>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title="資源與村民分配">
                <ReactECharts style={{ height: 300 }} option={resourceChart} />
                <ReactECharts style={{ height: 260 }} option={assignChart} />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="時間軸">
                <div style={{ maxHeight: 560, overflow: 'auto' }}>
                  {result.events.map((event, index) => (
                    <Typography.Paragraph key={`${event.t}-${index}`} style={{ marginBottom: 8 }}>
                      <Typography.Text code>{clock(event.t)}</Typography.Text> {event.text}
                    </Typography.Paragraph>
                  ))}
                </div>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {catalog && (
        <Collapse
          items={[{
            key: 'catalog',
            label: '這個文明的單位、建築與科技參數',
            children: <CatalogTable items={catalog.items[civ] ?? []} />,
          }]}
        />
      )}
    </Space>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <div>{children}</div>
    </div>
  )
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <InputNumber min={0} max={5000} value={value} onChange={(next) => onChange(next ?? 0)} />
    </Field>
  )
}

function assignmentRows(samples: SolveResult['timeline']) {
  const rows: { key: string; time: string; villagers: number; food: string; wood: string; gold: string; stone: string; building: number }[] = []
  for (const sample of samples) {
    const row = {
      key: `${sample.t}-${rows.length}`,
      time: clock(sample.t),
      villagers: sample.villagers,
      food: String(Math.round(sample.onFood)),
      wood: String(Math.round(sample.onWood)),
      gold: String(Math.round(sample.onGold)),
      stone: String(Math.round(sample.onStone)),
      building: sample.building,
    }
    const previous = rows[rows.length - 1]
    if (previous && previous.villagers === row.villagers && previous.food === row.food
      && previous.wood === row.wood && previous.gold === row.gold && previous.stone === row.stone
      && previous.building === row.building) continue
    rows.push(row)
  }
  return rows
}

function chartOf(result: SolveResult | null, kind: 'bank' | 'assign') {
  const rows = result?.timeline ?? []
  const axis = rows.map((row) => clock(row.t))
  if (kind === 'bank') {
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['食物', '木材', '黃金', '石頭'] },
      grid: { left: 48, right: 16, top: 32, bottom: 28 },
      xAxis: { type: 'category', data: axis },
      yAxis: { type: 'value' },
      series: [
        { name: '食物', type: 'line', showSymbol: false, data: rows.map((row) => Math.round(row.food)) },
        { name: '木材', type: 'line', showSymbol: false, data: rows.map((row) => Math.round(row.wood)) },
        { name: '黃金', type: 'line', showSymbol: false, data: rows.map((row) => Math.round(row.gold)) },
        { name: '石頭', type: 'line', showSymbol: false, data: rows.map((row) => Math.round(row.stone)) },
      ],
    }
  }
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['食物', '木材', '黃金', '石頭', '建造'] },
    grid: { left: 48, right: 16, top: 32, bottom: 28 },
    xAxis: { type: 'category', data: axis },
    yAxis: { type: 'value' },
    series: [
      { name: '食物', type: 'line', stack: 'v', areaStyle: {}, showSymbol: false, data: rows.map((row) => Math.round(row.onFood)) },
      { name: '木材', type: 'line', stack: 'v', areaStyle: {}, showSymbol: false, data: rows.map((row) => Math.round(row.onWood)) },
      { name: '黃金', type: 'line', stack: 'v', areaStyle: {}, showSymbol: false, data: rows.map((row) => Math.round(row.onGold)) },
      { name: '石頭', type: 'line', stack: 'v', areaStyle: {}, showSymbol: false, data: rows.map((row) => Math.round(row.onStone)) },
      { name: '建造', type: 'line', stack: 'v', areaStyle: {}, showSymbol: false, data: rows.map((row) => row.building) },
    ],
  }
}

function CatalogTable({ items }: { items: CatalogItem[] }) {
  const [kind, setKind] = useState<CatalogItem['kind'] | 'all'>('unit')
  const [query, setQuery] = useState('')
  const rows = items
    .filter((item) => (kind === 'all' || item.kind === kind) && item.name.toLowerCase().includes(query.toLowerCase()))
    .map((item) => {
      const variation = item.variations[0]
      return {
        key: `${item.kind}-${item.id}`,
        name: item.name,
        age: item.minAge,
        food: variation?.food ?? 0,
        wood: variation?.wood ?? 0,
        gold: variation?.gold ?? 0,
        stone: variation?.stone ?? 0,
        time: variation?.time ?? 0,
        pop: variation?.pop ?? 0,
        speed: variation?.speed || '—',
        dps: variation?.dps || '—',
      }
    })
  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Select
          value={kind}
          style={{ width: 140 }}
          options={[
            { value: 'unit', label: '單位' },
            { value: 'building', label: '建築' },
            { value: 'technology', label: '科技' },
            { value: 'upgrade', label: '升級' },
            { value: 'all', label: '全部' },
          ]}
          onChange={setKind}
        />
        <Input
          allowClear
          placeholder="搜尋名稱"
          style={{ width: 240 }}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Space>
      <Table
        size="small"
        rowKey="key"
        pagination={{ pageSize: 12 }}
        dataSource={rows}
        columns={[
          { title: '名稱', dataIndex: 'name' },
          { title: '時代', dataIndex: 'age', width: 70 },
          { title: '食物', dataIndex: 'food', width: 70 },
          { title: '木材', dataIndex: 'wood', width: 70 },
          { title: '黃金', dataIndex: 'gold', width: 70 },
          { title: '石頭', dataIndex: 'stone', width: 70 },
          { title: '時間', dataIndex: 'time', width: 70 },
          { title: '人口', dataIndex: 'pop', width: 70 },
          { title: '移速', dataIndex: 'speed', width: 80 },
          { title: 'DPS', dataIndex: 'dps', width: 80 },
        ]}
      />
    </>
  )
}
