import ReactECharts from 'echarts-for-react'
import type { ResourceTimelinePoint } from '../../api/types'

const COLORS: Record<string, string> = {
  wood: '#8B5A2B',
  gold: '#D4AF37',
  food: '#52c41a',
  stone: '#8c8c8c',
  oliveoil: '#faad14',
  total: '#1677ff',
}

interface ResourceTimelineChartProps {
  points: ResourceTimelinePoint[]
  selectedResources?: string[]
}

export function ResourceTimelineChart({ points, selectedResources }: ResourceTimelineChartProps) {
  const resources = selectedResources?.length
    ? selectedResources
    : [...new Set(points.map((p) => p.resource))]

  const minutes = [...new Set(points.map((p) => p.minute))].sort((a, b) => a - b)

  const series = resources.map((resource) => ({
    name: resource,
    type: 'line',
    smooth: true,
    showSymbol: false,
    itemStyle: { color: COLORS[resource] ?? undefined },
    data: minutes.map((minute) => {
      const point = points.find((p) => p.minute === minute && p.resource === resource)
      return point ? Math.round(point.value) : null
    }),
  }))

  return (
    <ReactECharts
      style={{ height: 420 }}
      option={{
        tooltip: { trigger: 'axis' },
        legend: { data: resources },
        grid: { left: 48, right: 24, top: 48, bottom: 32 },
        xAxis: { type: 'category', name: '分鐘', data: minutes },
        yAxis: { type: 'value', name: '累積資源（平均）' },
        series,
      }}
    />
  )
}
