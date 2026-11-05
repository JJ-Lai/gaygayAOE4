import ReactECharts from 'echarts-for-react'
import type { PlanResult } from '../../sim/planner/types'
import { RES_COLOR, RES_LABEL, clock } from './format'

function markLines(result: PlanResult) {
  const lines: { xAxis: number; name: string; color: string }[] = []
  for (const [a, t] of Object.entries(result.ageTimes)) {
    if (Number(a) > 1) lines.push({ xAxis: t, name: ['', '', '封建', '城堡', '帝王'][Number(a)], color: '#7fb2f0' })
  }
  for (const g of result.goals) if (g.t != null) lines.push({ xAxis: g.t, name: `目標 ${g.goalIndex + 1}`, color: '#f0d08a' })
  if (result.armyAt != null && Number.isFinite(result.armyAt)) lines.push({ xAxis: result.armyAt, name: '出兵完成', color: '#e0533f' })
  return {
    symbol: 'none',
    silent: true,
    data: lines.map((l) => ({ xAxis: l.xAxis, label: { formatter: l.name, color: l.color, fontSize: 11 }, lineStyle: { color: l.color, type: 'dashed' as const } })),
  }
}

const timeAxis = (max: number) => ({
  type: 'value' as const,
  min: 0,
  max: Math.ceil(max / 30) * 30,
  interval: max > 900 ? 120 : 60,
  axisLabel: { formatter: (v: number) => clock(v) },
})

export function VillagerChart({ result }: { result: PlanResult }) {
  const s = result.samples
  const max = s.length ? s[s.length - 1].t : 60
  const area = (name: string, color: string, pick: (x: PlanResult['samples'][number]) => number) => ({
    name,
    type: 'line' as const,
    stack: 'v',
    areaStyle: { opacity: 0.85 },
    lineStyle: { width: 0 },
    symbol: 'none',
    step: 'end' as const,
    color,
    data: s.map((x) => [x.t, pick(x)]),
  })
  const option = {
    animation: false,
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' }, valueFormatter: (v: number) => `${v} 人` },
    legend: { top: 0 },
    grid: { left: 40, right: 16, top: 36, bottom: 30 },
    xAxis: timeAxis(max),
    yAxis: { type: 'value', name: '村民', minInterval: 1 },
    series: [
      { ...area('食物', RES_COLOR.food, (x) => x.split.food), markLine: markLines(result) },
      area('木材', RES_COLOR.wood, (x) => x.split.wood),
      area('黃金', RES_COLOR.gold, (x) => x.split.gold),
      area('石頭', RES_COLOR.stone, (x) => x.split.stone),
      area('建造／走路', '#7b93c9', (x) => Math.max(0, x.villagers - x.split.food - x.split.wood - x.split.gold - x.split.stone)),
    ],
  }
  return <ReactECharts theme="aoe4" option={option} style={{ height: 320 }} notMerge />
}

export function BankChart({ result }: { result: PlanResult }) {
  const s = result.samples
  const max = s.length ? s[s.length - 1].t : 60
  const line = (key: keyof typeof RES_COLOR, dashed = false, income = false) => ({
    name: `${RES_LABEL[key]}${income ? '收入/分' : '庫存'}`,
    type: 'line' as const,
    symbol: 'none',
    smooth: income,
    color: RES_COLOR[key],
    lineStyle: { type: dashed ? ('dashed' as const) : ('solid' as const), width: income ? 1.5 : 2 },
    yAxisIndex: income ? 1 : 0,
    data: s.map((x) => [x.t, Math.round(income ? x.income[key] : x.bank[key])]),
  })
  const option = {
    animation: false,
    tooltip: { trigger: 'axis' },
    legend: { top: 0, type: 'scroll' },
    grid: { left: 48, right: 52, top: 40, bottom: 30 },
    xAxis: timeAxis(max),
    yAxis: [
      { type: 'value', name: '庫存' },
      { type: 'value', name: '每分鐘', splitLine: { show: false } },
    ],
    series: [
      { ...line('food'), markLine: markLines(result) },
      line('wood'),
      line('gold'),
      line('stone'),
      line('food', true, true),
      line('wood', true, true),
      line('gold', true, true),
      line('stone', true, true),
    ],
  }
  return <ReactECharts theme="aoe4" option={option} style={{ height: 320 }} notMerge />
}
