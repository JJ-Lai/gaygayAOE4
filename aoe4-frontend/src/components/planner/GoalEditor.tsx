import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Checkbox, Flex, InputNumber, Segmented, Select, Tag, Tooltip, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { minAge, nameOf, type CivData } from '../../sim/planner/civData'
import { AGE_ZH, describeGoal } from './format'
import type { Goal } from '../../sim/planner/types'

type Kind = Goal['kind']

const KIND_COLOR: Record<Kind, string> = { age: 'gold', build: 'blue', army: 'volcano', tech: 'purple', villagers: 'green' }
const KIND_ZH: Record<Kind, string> = { age: '升代', build: '建築', army: '軍隊', tech: '科技', villagers: '村民' }

export function GoalEditor({ data, goals, onChange, times }: { data: CivData; goals: Goal[]; onChange: (g: Goal[]) => void; times?: (number | null)[] }) {
  const [kind, setKind] = useState<Kind>('army')
  const [age, setAge] = useState<2 | 3 | 4>(3)
  const [via, setVia] = useState<string | undefined>(undefined)
  const [item, setItem] = useState<string | undefined>(undefined)
  const [count, setCount] = useState(10)
  const [forward, setForward] = useState(false)

  const options = useMemo(() => {
    const all = [...data.items.values()]
    const label = (id: string, a: number) => `${nameOf(data, id)}（${AGE_ZH[a]}）`
    const sorted = (xs: typeof all) => xs.sort((a, b) => minAge(a) - minAge(b) || nameOf(data, a.id).localeCompare(nameOf(data, b.id), 'zh-Hant'))
    return {
      build: sorted(all.filter((i) => i.kind === 'building' && !i.variations.some((v) => v.tags.some((t) => t.startsWith('toAge'))))).map((i) => ({ value: i.id, label: label(i.id, minAge(i)) })),
      army: sorted(all.filter((i) => i.kind === 'unit' && i.military && i.variations.some((v) => v.producedBy.length))).map((i) => ({ value: i.id, label: label(i.id, minAge(i)) })),
      tech: sorted(all.filter((i) => i.kind === 'technology' || i.kind === 'upgrade').filter((i) => i.variations.some((v) => v.producedBy.length))).map((i) => ({ value: i.id, label: label(i.id, minAge(i)) })),
    }
  }, [data])

  const add = () => {
    let g: Goal | null = null
    if (kind === 'age') g = { kind, age, via }
    else if (kind === 'villagers') g = { kind, count }
    else if (item && kind === 'build') g = { kind, item, count, forward }
    else if (item && kind === 'army') g = { kind, unit: item, count }
    else if (item && kind === 'tech') g = { kind, item }
    if (g) onChange([...goals, g])
  }

  const move = (i: number, d: number) => {
    const next = [...goals]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x)
    onChange(next)
  }

  return (
    <Flex vertical gap={10}>
      {goals.length === 0 && <Typography.Text type="secondary">還沒有目標。從上面選一個預設流程，或在下面新增。</Typography.Text>}
      <ol className="planner-goals">
        {goals.map((g, i) => (
          <li key={i}>
            <span className="planner-goal-index">{i + 1}</span>
            <Tag color={KIND_COLOR[g.kind]} style={{ marginInlineEnd: 0 }}>
              {KIND_ZH[g.kind]}
            </Tag>
            <span className="planner-goal-text">{describeGoal(data, g)}</span>
            {times && <code className="planner-goal-time">{times[i] != null ? fmt(times[i]!) : '…'}</code>}
            <span className="planner-goal-actions">
              <Tooltip title="上移">
                <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
              </Tooltip>
              <Tooltip title="下移">
                <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === goals.length - 1} onClick={() => move(i, 1)} />
              </Tooltip>
              <Tooltip title="刪除">
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(goals.filter((_, j) => j !== i))} />
              </Tooltip>
            </span>
          </li>
        ))}
      </ol>

      <div className="planner-add">
        <Segmented<Kind>
          block
          size="small"
          value={kind}
          onChange={(v) => {
            setKind(v)
            setItem(undefined)
          }}
          options={(['age', 'build', 'army', 'tech', 'villagers'] as Kind[]).map((k) => ({ value: k, label: KIND_ZH[k] }))}
        />
        {kind === 'age' && (
          <Flex gap={8}>
            <Select
              style={{ width: 110 }}
              value={age}
              onChange={(v) => {
                setAge(v)
                setVia(undefined)
              }}
              options={[2, 3, 4].map((a) => ({ value: a as 2 | 3 | 4, label: `${AGE_ZH[a]}時代` }))}
            />
            <Select
              style={{ flex: 1 }}
              allowClear
              placeholder="地標／方式：讓系統挑"
              value={via}
              onChange={setVia}
              options={(data.ageOptions[age] ?? []).map((o) => ({ value: o.id, label: o.name }))}
            />
          </Flex>
        )}
        {(kind === 'build' || kind === 'army' || kind === 'tech') && (
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="選擇項目" value={item} onChange={setItem} options={options[kind]} />
        )}
        {(kind === 'build' || kind === 'army' || kind === 'villagers') && (
          <Flex gap={8} align="center">
            <InputNumber min={1} max={kind === 'villagers' ? 150 : 100} value={count} onChange={(v) => setCount(v ?? 1)} prefix="數量" style={{ width: 150 }} />
            {kind === 'build' && (
              <Checkbox checked={forward} onChange={(e) => setForward(e.target.checked)}>
                蓋在對手附近（塔攻）
              </Checkbox>
            )}
          </Flex>
        )}
        <Button type="dashed" icon={<PlusOutlined />} onClick={add} disabled={(kind === 'build' || kind === 'army' || kind === 'tech') && !item} block>
          加到流程最後
        </Button>
      </div>
    </Flex>
  )
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
