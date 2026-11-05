import ReactECharts from 'echarts-for-react'
import type { RecentTrendPoint } from '../../api/types'

interface WinRateTrendChartProps {
  trend: RecentTrendPoint[]
}

export function WinRateTrendChart({ trend }: WinRateTrendChartProps) {
  const reversed = [...trend].reverse()
  const labels = reversed.map((t) => (t.startedAt ? new Date(t.startedAt).toLocaleDateString() : `#${t.gameId}`))
  const values = reversed.map((t) => (t.result === 'win' ? 1 : t.result === 'loss' ? -1 : 0))

  return (
    <ReactECharts theme="aoe4"
      style={{ height: 260 }}
      option={{
        tooltip: { trigger: 'axis' },
        grid: { left: 48, right: 24, top: 24, bottom: 48 },
        xAxis: { type: 'category', data: labels, axisLabel: { rotate: 30 } },
        yAxis: {
          type: 'value',
          min: -1,
          max: 1,
          interval: 1,
          axisLabel: { formatter: (v: number) => (v > 0 ? '勝' : v < 0 ? '負' : '—') },
        },
        series: [
          {
            type: 'bar',
            data: values.map((v) => ({
              value: v,
              itemStyle: { color: v > 0 ? '#6cc36b' : v < 0 ? '#e0533f' : '#5a6572' },
            })),
          },
        ],
      }}
    />
  )
}
