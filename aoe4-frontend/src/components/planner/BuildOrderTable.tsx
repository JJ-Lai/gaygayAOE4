import { Table, Tag, Tooltip } from 'antd'
import type { PlanEvent } from '../../sim/planner/types'
import { RES_COLOR, clock, compress, type Row } from './format'

const KIND: Partial<Record<PlanEvent['kind'], { label: string; color: string }>> = {
  start: { label: '開局', color: 'green' },
  villager: { label: '村民', color: 'default' },
  rally: { label: '調度', color: 'cyan' },
  place: { label: '建造', color: 'blue' },
  done: { label: '完成', color: 'geekblue' },
  train: { label: '訓練', color: 'volcano' },
  research: { label: '研究', color: 'purple' },
  age: { label: '升代', color: 'gold' },
  goal: { label: '目標', color: 'red' },
  deplete: { label: '採完', color: 'default' },
  note: { label: '階段', color: 'magenta' },
}


const RES4 = ['food', 'wood', 'gold', 'stone'] as const

const dot = (color: string, n: number, minWidth = 34) => (
  <span key={color} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, minWidth }}>
    <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: 'inline-block' }} />
    <span style={{ fontVariantNumeric: 'tabular-nums', color: n ? undefined : '#bbb' }}>{n}</span>
  </span>
)

export function BuildOrderTable({ events, compact }: { events: PlanEvent[]; compact?: boolean }) {
  const rows = compress(events.filter((e) => !compact || e.kind !== 'deplete'))
  return (
    <Table<Row>
      size="small"
      rowKey="key"
      dataSource={rows}
      pagination={rows.length > 60 ? { pageSize: 60, showSizeChanger: false } : false}
      rowClassName={(r) => (r.kind === 'goal' || r.kind === 'age' ? 'planner-row-strong' : '')}
      columns={[
        { title: '時間', dataIndex: 't', width: 64, render: (t: number) => <code>{clock(t)}</code> },
        { title: '人口', dataIndex: 'pop', width: 56, align: 'right' },
        {
          title: '動作',
          dataIndex: 'text',
          render: (text: string, r) => (
            <span>
              {KIND[r.kind] && (
                <Tag color={KIND[r.kind]!.color} style={{ marginInlineEnd: 6 }}>
                  {KIND[r.kind]!.label}
                </Tag>
              )}
              {text}
            </span>
          ),
        },
        {
          title: '現有（動作前）',
          dataIndex: 'have',
          width: 220,
          render: (h: Row['have']) =>
            h ? (
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {RES4.map((r) => dot(RES_COLOR[r], Math.floor(h[r] ?? 0), 42))}
              </span>
            ) : (
              '—'
            ),
        },
        {
          title: '花費',
          dataIndex: 'cost',
          width: 150,
          render: (c: Row['cost'], r) => {
            if (!c) return <span style={{ color: '#bbb' }}>—</span>
            const parts = RES4.filter((k) => c[k] > 0).map((k) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: RES_COLOR[k], display: 'inline-block' }} />
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>−{Math.round(c[k])}</span>
              </span>
            ))
            return (
              <Tooltip title={r.prepaid ? '排進城鎮中心時就已付款，這裡只是列出每名的成本' : undefined}>
                <span style={{ display: 'inline-flex', gap: 6, opacity: r.prepaid ? 0.55 : 1 }}>{parts}</span>
              </Tooltip>
            )
          },
        },
        {
          title: '工人分配（食 / 木 / 金 / 石）',
          dataIndex: 'split',
          width: 170,
          render: (s: Row['split']) => (
            <span style={{ display: 'inline-flex', gap: 4 }}>
              {dot(RES_COLOR.food, s.food)}
              {dot(RES_COLOR.wood, s.wood)}
              {dot(RES_COLOR.gold, s.gold)}
              {dot(RES_COLOR.stone, s.stone)}
            </span>
          ),
        },
      ]}
    />
  )
}
