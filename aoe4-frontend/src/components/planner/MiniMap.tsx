import { Tooltip } from 'antd'
import type { GameMap } from '../../sim/planner/types'
import { SITE_COLOR } from './format'

export function MiniMap({ map, size = 280 }: { map: GameMap; size?: number }) {
  const c = size / 2
  const maxDist = Math.max(48, ...map.sites.map((s) => s.dist)) + 4
  const k = (c - 10) / maxDist
  const pos = (dist: number, angle: number) => [c + Math.cos(angle) * dist * k, c + Math.sin(angle) * dist * k]
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: 'block', margin: '0 auto' }} role="img" aria-label={`${map.name} 資源分佈`}>
      <defs>
        <radialGradient id="mm-ground" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e9dcb8" />
          <stop offset="100%" stopColor="#d4c08f" />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={size} height={size} rx={10} fill="url(#mm-ground)" />
      {[10, 20, 30, 40].map((r) => (
        <circle key={r} cx={c} cy={c} r={r * k} fill="none" stroke="#000" strokeOpacity={0.08} strokeDasharray="2 3" />
      ))}
      {[10, 20, 30, 40].map((r) => (
        <text key={`t${r}`} x={c + r * k + 2} y={c - 2} fontSize={8} fill="#000" fillOpacity={0.35}>
          {r}
        </text>
      ))}
      {/* 對手方向 */}
      <g transform={`translate(${size - 18}, 18)`}>
        <path d="M-12 12 L0 0 M0 0 L-7 1 M0 0 L-1 7" stroke="#9b1c1c" strokeWidth={2} fill="none" />
      </g>
      <text x={size - 34} y={36} fontSize={9} fill="#9b1c1c" textAnchor="end">
        對手 {map.enemyDist} 格
      </text>
      {map.sites.map((s) => {
        const [x, y] = pos(s.dist, s.angle)
        const r = Math.max(4, Math.min(13, Math.sqrt(s.amount) / 9))
        return (
          <Tooltip key={s.id} title={`${s.label}：${s.amount.toLocaleString()}，距離 ${s.dist} 格${s.contested ? '（爭奪區，預設不採）' : ''}`}>
            <g style={{ cursor: 'help' }}>
              {s.kind === 'wood' ? (
                <g>
                  {[-1, 0, 1].map((d) => (
                    <circle key={d} cx={x + d * r * 0.7} cy={y + (d === 0 ? -r * 0.4 : 0)} r={r * 0.7} fill={SITE_COLOR.wood} stroke="#1f3d1c" strokeWidth={0.8} />
                  ))}
                </g>
              ) : (
                <circle cx={x} cy={y} r={r} fill={SITE_COLOR[s.kind]} stroke={s.contested ? '#9b1c1c' : '#3b3b3b'} strokeWidth={s.contested ? 1.6 : 0.8} strokeDasharray={s.contested ? '3 2' : undefined} />
              )}
            </g>
          </Tooltip>
        )
      })}
      {/* 城鎮中心與羊 */}
      <rect x={c - 7} y={c - 7} width={14} height={14} rx={2} fill="#2f4f8f" stroke="#fff" strokeWidth={1.5} />
      {Array.from({ length: 5 + map.sheepArrivals.length }, (_, i) => {
        const a = (i / (5 + map.sheepArrivals.length)) * Math.PI * 2
        return <circle key={i} cx={c + Math.cos(a) * 14} cy={c + Math.sin(a) * 14} r={2.4} fill={i < 5 ? '#fff' : '#f5f5f5'} stroke="#666" strokeWidth={0.5} opacity={i < 5 ? 1 : 0.6} />
      })}
    </svg>
  )
}
