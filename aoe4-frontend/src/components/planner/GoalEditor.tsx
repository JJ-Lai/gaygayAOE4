import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Checkbox, Empty, Flex, Input, InputNumber, Modal, Select, Tabs, Tag, Tooltip, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { minAge, nameOf, variationAt, type CivData } from '../../sim/planner/civData'
import type { Preset } from '../../sim/planner/presets'
import type { Goal } from '../../sim/planner/types'
import type { CatalogItem } from '../../sim/types'
import { AGE_ZH, clock } from './format'

type Kind = Goal['kind']

const KIND_META: Record<Kind, { label: string; icon: string; color: string }> = {
  age: { label: '升代', icon: '🏛️', color: '#b8860b' },
  build: { label: '建築', icon: '🏗️', color: '#2f54eb' },
  army: { label: '軍隊', icon: '⚔️', color: '#d4380d' },
  tech: { label: '科技', icon: '📜', color: '#722ed1' },
  villagers: { label: '經濟', icon: '👷', color: '#389e0d' },
}

const RES_SHORT = [
  ['food', '食'],
  ['wood', '木'],
  ['gold', '金'],
  ['stone', '石'],
] as const

function costText(it: CatalogItem, age: number) {
  const v = variationAt(it, Math.max(age, minAge(it)))
  const parts = RES_SHORT.filter(([k]) => v[k] > 0).map(([k, z]) => `${v[k]}${z}`)
  return parts.length ? parts.join(' ') : '免費'
}

interface Props {
  data: CivData
  goals: Goal[]
  onChange: (g: Goal[]) => void
  times?: (number | null)[]
  presets: Preset[]
  presetId?: string
  onPreset: (p: Preset) => void
}

export function GoalEditor({ data, goals, onChange, times, presets, presetId, onPreset }: Props) {
  const [picker, setPicker] = useState(false)
  const set = (i: number, g: Goal) => onChange(goals.map((x, j) => (j === i ? g : x)))
  const move = (i: number, d: number) => {
    const next = [...goals]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x)
    onChange(next)
  }

  return (
    <Flex vertical gap={12}>
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          範本（點一下套用，之後可以再改）
        </Typography.Text>
        <div className="planner-presets">
          {presets.map((p) => (
            <button key={p.id} type="button" className={`planner-preset${p.id === presetId ? ' active' : ''}`} onClick={() => onPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="planner-flow">
        {goals.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="還沒有步驟，從範本開始或按下方「新增步驟」" />}
        {goals.map((g, i) => (
          <div key={i} className="planner-flow-item">
            <div className="planner-flow-rail">
              <span className="planner-flow-num" style={{ background: KIND_META[g.kind].color }}>
                {i + 1}
              </span>
              {i < goals.length - 1 && <span className="planner-flow-line" />}
            </div>
            <div className="planner-flow-card">
              <Flex align="center" gap={6}>
                <span aria-hidden>{KIND_META[g.kind].icon}</span>
                <Typography.Text strong style={{ flex: 1, minWidth: 0 }} ellipsis>
                  {stepTitle(data, g)}
                </Typography.Text>
                {times && <code className="planner-goal-time">{times[i] != null ? clock(times[i]) : '…'}</code>}
                <Tooltip title="往前">
                  <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                </Tooltip>
                <Tooltip title="往後">
                  <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === goals.length - 1} onClick={() => move(i, 1)} />
                </Tooltip>
                <Tooltip title="移除">
                  <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={() => onChange(goals.filter((_, j) => j !== i))} />
                </Tooltip>
              </Flex>
              <StepControls data={data} goal={g} onChange={(x) => set(i, x)} />
            </div>
          </div>
        ))}
      </div>

      <Button type="primary" ghost icon={<PlusOutlined />} onClick={() => setPicker(true)} block>
        新增步驟
      </Button>
      <StepPicker
        data={data}
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(g) => {
          onChange([...goals, g])
          setPicker(false)
        }}
      />
    </Flex>
  )
}

function stepTitle(data: CivData, g: Goal) {
  switch (g.kind) {
    case 'age':
      return `升到${AGE_ZH[g.age]}時代`
    case 'build':
      return `${g.forward ? '前線' : ''}${nameOf(data, g.item)}`
    case 'army':
      return nameOf(data, g.unit)
    case 'tech':
      return nameOf(data, g.item)
    case 'villagers':
      return '村民數量'
  }
}

/** 每一步的就地設定：數量、地標、前線 */
function StepControls({ data, goal, onChange }: { data: CivData; goal: Goal; onChange: (g: Goal) => void }) {
  if (goal.kind === 'age') {
    return (
      <Select
        size="small"
        style={{ width: '100%', marginTop: 6 }}
        value={goal.via ?? ''}
        onChange={(v) => onChange({ ...goal, via: v || undefined })}
        options={[{ value: '', label: '地標：讓系統挑最快的' }, ...(data.ageOptions[goal.age] ?? []).map((o) => ({ value: o.id, label: `地標：${o.name}` }))]}
      />
    )
  }
  if (goal.kind === 'tech') return null
  const unit = goal.kind === 'army' ? '名' : goal.kind === 'build' ? '座' : '名村民'
  return (
    <Flex align="center" gap={8} wrap style={{ marginTop: 6 }}>
      <InputNumber size="small" min={1} max={goal.kind === 'villagers' ? 150 : 100} value={goal.count} onChange={(v) => onChange({ ...goal, count: v ?? 1 })} suffix={unit} style={{ width: 120 }} />
      {goal.kind === 'army' &&
        [5, 10, 20, 40].map((n) => (
          <Tag.CheckableTag key={n} checked={goal.count === n} onChange={() => onChange({ ...goal, count: n })}>
            {n}
          </Tag.CheckableTag>
        ))}
      {goal.kind === 'build' && (
        <Checkbox checked={!!goal.forward} onChange={(e) => onChange({ ...goal, forward: e.target.checked })}>
          蓋在對手附近（塔攻）
        </Checkbox>
      )}
    </Flex>
  )
}

interface Tile {
  key: string
  title: string
  sub: string
  age: number
  goal: Goal
  group: string
  hint?: string
}

/** 「新增步驟」：依類別列出可點的卡片，可搜尋 */
function StepPicker({ data, open, onClose, onPick }: { data: CivData; open: boolean; onClose: () => void; onPick: (g: Goal) => void }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<string>('age')
  const tiles = useMemo(() => buildTiles(data), [data])
  const filter = (xs: Tile[]) => (q ? xs.filter((x) => x.title.includes(q) || x.group.includes(q) || x.sub.includes(q)) : xs)

  const grid = (xs: Tile[]) => {
    const list = filter(xs)
    if (!list.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="沒有符合的項目" />
    const groups = [...new Set(list.map((x) => x.group))]
    return (
      <div className="planner-picker">
        {groups.map((g) => (
          <div key={g}>
            <div className="planner-picker-group">{g}</div>
            <div className="planner-picker-grid">
              {list
                .filter((x) => x.group === g)
                .map((x) => (
                  <button key={x.key} type="button" className="planner-tile" onClick={() => onPick(x.goal)}>
                    <span className="planner-tile-title">{x.title}</span>
                    <span className="planner-tile-sub">
                      {x.goal.kind !== 'age' && <Tag style={{ marginInlineEnd: 4 }}>{AGE_ZH[x.age]}</Tag>}
                      {x.sub}
                    </span>
                    {x.hint && <span className="planner-tile-hint">{x.hint}</span>}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={760} title="新增步驟" destroyOnHidden>
      <Input allowClear prefix={<SearchOutlined />} placeholder="搜尋單位、建築、科技…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'age', label: '🏛️ 升代', children: grid(tiles.age) },
          { key: 'army', label: '⚔️ 軍隊', children: grid(tiles.army) },
          { key: 'build', label: '🏗️ 建築', children: grid(tiles.build) },
          { key: 'tech', label: '📜 科技', children: grid(tiles.tech) },
          { key: 'eco', label: '👷 經濟', children: grid(tiles.eco) },
        ]}
      />
    </Modal>
  )
}

const DEFENSE = /outpost|tower|keep|fortress|castle(?!-of)|fort/
const SKIP_BUILD = /palisade|wall|gate|^farm$/

function buildTiles(data: CivData) {
  const name = (id: string) => nameOf(data, id)
  const all = [...data.items.values()]
  const isLandmark = (it: CatalogItem) => it.variations.some((v) => v.tags.some((t) => t.startsWith('toAge')))
  const age: Tile[] = []
  for (const a of [2, 3, 4] as const) {
    age.push({ key: `age${a}`, title: `${AGE_ZH[a]}時代`, sub: '系統挑最快的地標', age: a - 1, group: '升代（讓系統挑）', goal: { kind: 'age', age: a } })
    for (const o of data.ageOptions[a] ?? []) {
      const cost = RES_SHORT.filter(([k]) => o.cost[k] > 0)
        .map(([k, z]) => `${o.cost[k]}${z}`)
        .join(' ')
      age.push({ key: `age${a}-${o.id}`, title: o.name, sub: cost, age: a - 1, group: `指定${AGE_ZH[a]}時代地標`, goal: { kind: 'age', age: a, via: o.id } })
    }
  }

  // 軍隊：依生產建築分組
  const army: (Tile & { rank: number })[] = []
  const RANK = ['barracks', 'archery-range', 'stable', 'siege-workshop', 'dock']
  for (const u of all) {
    // 商人雖然在目錄裡標成軍事，但不是戰鬥單位
    if (u.kind !== 'unit' || !u.military || /trader|caravan/.test(u.id)) continue
    const v = variationAt(u, 4)
    const prods = v.producedBy.filter((p) => data.items.get(p)?.kind === 'building')
    if (!prods.length) continue
    const prod = prods.find((p) => RANK.includes(p)) ?? prods[0]
    const pb = data.items.get(prod)!
    const rank = RANK.includes(prod) ? RANK.indexOf(prod) : isLandmark(pb) ? 99 : 50
    army.push({ key: u.id, title: name(u.id), sub: costText(u, minAge(u)), age: minAge(u), group: isLandmark(pb) ? '地標生產' : name(prod), goal: { kind: 'army', unit: u.id, count: 10 }, rank })
  }
  army.sort((a, b) => a.rank - b.rank || a.group.localeCompare(b.group, 'zh-Hant') || a.age - b.age)

  const build: Tile[] = []
  for (const b of all) {
    if (b.kind !== 'building' || isLandmark(b) || SKIP_BUILD.test(b.id)) continue
    const v = variationAt(b, 4)
    const group = v.tags.includes('production') ? '軍事生產' : DEFENSE.test(b.id) ? '防禦' : v.tags.includes('tc') || v.tags.includes('dropoff') || v.tags.includes('house') ? '經濟' : '其他'
    build.push({ key: b.id, title: name(b.id), sub: costText(b, minAge(b)), age: minAge(b), group, goal: { kind: 'build', item: b.id, count: 1 } })
  }
  const groupOrder = ['戰術', '防禦', '經濟', '軍事生產', '其他']
  if (data.items.has('outpost')) build.push({ key: 'tower-rush', title: '塔攻：前線 2 座哨站', sub: `${costText(data.items.get('outpost')!, 1)} ×2`, age: 1, group: '戰術', goal: { kind: 'build', item: 'outpost', count: 2, forward: true }, hint: '派村民走到對手附近蓋' })
  if (data.items.has('town-center')) build.push({ key: 'second-tc', title: '第二座城鎮中心', sub: costText(data.items.get('town-center')!, 1), age: 1, group: '戰術', goal: { kind: 'build', item: 'town-center', count: 1 }, hint: '雙城鎮中心爆村民' })
  build.sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || a.age - b.age)

  const tech: Tile[] = []
  for (const it of all) {
    if ((it.kind !== 'technology' && it.kind !== 'upgrade') || isLandmark(it)) continue
    const v = variationAt(it, 4)
    const prod = v.producedBy.find((p) => data.items.get(p)?.kind === 'building')
    if (!prod) continue
    tech.push({ key: it.id, title: name(it.id), sub: costText(it, minAge(it)), age: minAge(it), group: name(prod), goal: { kind: 'tech', item: it.id } })
  }
  tech.sort((a, b) => a.group.localeCompare(b.group, 'zh-Hant') || a.age - b.age)

  const eco: Tile[] = [20, 30, 40, 60, 80, 100].map((n) => ({ key: `v${n}`, title: `村民達到 ${n} 名`, sub: '所有城鎮中心持續生產', age: 1, group: '村民', goal: { kind: 'villagers', count: n } }))
  for (const id of data.ecoTechs) {
    const it = data.items.get(id)!
    eco.push({ key: `eco-${id}`, title: name(id), sub: costText(it, minAge(it)), age: minAge(it), group: '經濟科技', goal: { kind: 'tech', item: id } })
  }
  return { age, army, build, tech, eco }
}
