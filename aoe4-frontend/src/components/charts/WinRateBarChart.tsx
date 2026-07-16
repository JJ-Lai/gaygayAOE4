import ReactECharts from 'echarts-for-react'

export interface WinRateBarItem {
  label: string
  winRate: number
  games: number
}

interface WinRateBarChartProps {
  items: WinRateBarItem[]
  maxItems?: number
}

export function WinRateBarChart({ items, maxItems = 15 }: WinRateBarChartProps) {
  const top = items.slice(0, maxItems)
  const labels = top.map((item) => item.label)
  const winRates = top.map((item) => Number((item.winRate * 100).toFixed(1)))
  const games = top.map((item) => item.games)

  return (
    <ReactECharts
      style={{ height: 360 }}
      option={{
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params: { dataIndex: number }[]) => {
            const idx = params[0]?.dataIndex ?? 0
            const row = top[idx]
            if (!row) return ''
            return `${row.label}<br/>場次：${row.games}<br/>勝率：${(row.winRate * 100).toFixed(1)}%`
          },
        },
        grid: { left: 120, right: 24, top: 24, bottom: 24 },
        xAxis: {
          type: 'value',
          max: 100,
          axisLabel: { formatter: '{value}%' },
        },
        yAxis: {
          type: 'category',
          data: labels,
          inverse: true,
          axisLabel: { width: 100, overflow: 'truncate' },
        },
        series: [
          {
            type: 'bar',
            data: winRates.map((rate, i) => ({
              value: rate,
              itemStyle: {
                color: games[i] >= 5 ? '#1677ff' : '#91caff',
              },
            })),
            label: {
              show: true,
              position: 'right',
              formatter: (p: { dataIndex: number; value: number }) => {
                const g = games[p.dataIndex]
                return `${p.value}% (${g})`
              },
            },
          },
        ],
      }}
    />
  )
}
