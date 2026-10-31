import ReactECharts from 'echarts-for-react'
import type { MilitaryLossRow } from '../../api/types'

interface MilitaryDiffChartProps {
  rows: MilitaryLossRow[]
  playerCiv: string
}

export function MilitaryDiffChart({ rows, playerCiv }: MilitaryDiffChartProps) {
  const sorted = [...rows].sort((a, b) => (b.avgMilitaryDiff ?? 0) - (a.avgMilitaryDiff ?? 0))
  const labels = sorted.map((r) => r.opponentCiv)
  const values = sorted.map((r) => r.avgMilitaryDiff ?? 0)

  return (
    <ReactECharts
      style={{ height: 360 }}
      option={{
        title: { text: `${playerCiv} 對各文明平均軍事分差`, left: 'center', textStyle: { fontSize: 14 } },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 80, right: 24, top: 48, bottom: 24 },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: labels, inverse: true },
        series: [
          {
            type: 'bar',
            data: values.map((v) => ({
              value: v,
              itemStyle: { color: v >= 0 ? '#52c41a' : '#ff4d4f' },
            })),
            label: { show: true, position: 'right', formatter: '{c}' },
          },
        ],
      }}
    />
  )
}
