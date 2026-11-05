import ReactECharts from 'echarts-for-react'
import type { MatchupRow } from '../../api/types'

interface MatchupHeatmapProps {
  matchups: MatchupRow[]
}

export function MatchupHeatmap({ matchups }: MatchupHeatmapProps) {
  const playerCivs = [...new Set(matchups.map((m) => m.playerCiv))].sort()
  const opponentCivs = [...new Set(matchups.map((m) => m.opponentCiv))].sort()

  const data: [number, number, number][] = []
  matchups.forEach((m) => {
    const x = opponentCivs.indexOf(m.opponentCiv)
    const y = playerCivs.indexOf(m.playerCiv)
    if (x >= 0 && y >= 0) {
      data.push([x, y, Math.round(m.winRate * 100)])
    }
  })

  return (
    <ReactECharts theme="aoe4"
      style={{ height: Math.max(320, playerCivs.length * 36 + 120) }}
      option={{
        tooltip: {
          position: 'top',
          formatter: (params: { value: [number, number, number] }) => {
            const [x, y, rate] = params.value
            return `${playerCivs[y]} vs ${opponentCivs[x]}<br/>勝率 ${rate}%`
          },
        },
        grid: { left: 120, right: 40, top: 40, bottom: 80 },
        xAxis: {
          type: 'category',
          data: opponentCivs,
          splitArea: { show: true },
          axisLabel: { rotate: 35 },
        },
        yAxis: {
          type: 'category',
          data: playerCivs,
          splitArea: { show: true },
        },
        visualMap: {
          min: 0,
          max: 100,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          inRange: { color: ['#e0533f', '#d4aa5f', '#6cc36b'] },
        },
        series: [
          {
            name: '勝率 %',
            type: 'heatmap',
            data,
            label: { show: true, formatter: (p: { value: [number, number, number] }) => `${p.value[2]}%` },
          },
        ],
      }}
    />
  )
}
