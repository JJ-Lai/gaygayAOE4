import { Tooltip } from 'antd'
import { toMap } from '../../sim/planner/mapgen'
import type { GameMap, PlanResult, Point, Site } from '../../sim/planner/types'
import { SITE_COLOR, sampleAt } from './format'

const ROLE_SIZE: Record<string, number> = { house: 2.2, camp: 2.2, farm: 2.6, econ: 3, prod: 3.4, step: 4.2 }

interface Props {
  map: GameMap
  result?: PlanResult | null
  /** 顯示到第幾秒的部署；沒給就只畫起始地圖 */
  t?: number
  /** 名稱查詢（建築 tooltip） */
  nameOf?: (id: string) => string
  maxWidth?: number
}

export function FullMap({ map, result, t, nameOf, maxWidth = 360 }: Props) {
  const S = map.size
  const sample = result && t != null ? sampleAt(result.samples, t) : null
  const siteState = new Map(sample?.sites.map((x) => [x.id, x]) ?? [])
  const fmtName = (id: string) => nameOf?.(id) ?? id

  const dot = (s: Site, origin: Point, enemySide: boolean) => {
    const p = toMap(origin, s.dist, s.angle)
    const r = Math.max(1.4, Math.min(3.6, Math.sqrt(s.amount) / 32))
    const st = enemySide ? null : siteState.get(s.id)
    const gone = st != null && st.left <= 0
    const tip = `${enemySide ? '對手・' : ''}${s.label}：${s.amount.toLocaleString()}${st ? `，剩 ${Math.max(0, Math.round(st.left)).toLocaleString()}，${st.workers} 人在採` : ''}${s.contested ? '（爭奪區）' : ''}`
    return (
      <Tooltip key={(enemySide ? 'e' : 'h') + s.id} title={tip}>
        <g opacity={gone ? 0.25 : enemySide ? 0.7 : 1} style={{ cursor: 'help' }}>
          {s.kind === 'wood' ? (
            [-1, 0, 1].map((d) => <circle key={d} cx={p.x + d * r * 0.75} cy={p.y + (d === 0 ? -r * 0.45 : 0)} r={r * 0.75} fill={SITE_COLOR.wood} stroke="#1f3d1c" strokeWidth={0.25} />)
          ) : (
            <circle cx={p.x} cy={p.y} r={r} fill={SITE_COLOR[s.kind]} stroke={s.contested ? '#9b1c1c' : '#3b3b3b'} strokeWidth={s.contested ? 0.45 : 0.25} strokeDasharray={s.contested ? '1 0.6' : undefined} />
          )}
          {st && st.workers > 0 && (
            <g>
              <circle cx={p.x + r} cy={p.y - r} r={2} fill="#1d39c4" />
              <text x={p.x + r} y={p.y - r + 0.75} fontSize={2.2} fill="#fff" textAnchor="middle" fontWeight={700}>
                {st.workers}
              </text>
            </g>
          )}
        </g>
      </Tooltip>
    )
  }

  const tc = (p: Point, color: string, label: string) => (
    <g>
      <rect x={p.x - 2.6} y={p.y - 2.6} width={5.2} height={5.2} rx={0.6} fill={color} stroke="#fff" strokeWidth={0.5} />
      <text x={p.x} y={p.y + 6.2} fontSize={3} textAnchor="middle" fill={color} fontWeight={700}>
        {label}
      </text>
    </g>
  )

  const sheepAt = siteState.get('sheep')
  const farmAt = siteState.get('farm')
  const builds = result && t != null ? result.buildings.filter((b) => b.placed <= t && b.role !== 'farm') : []
  const farms = sample?.farms ?? 0

  return (
    <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ maxWidth, display: 'block', margin: '0 auto', borderRadius: 10 }} role="img" aria-label={`${map.name} 全地圖`}>
      <defs>
        <linearGradient id="fm-ground" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#d9c99a" />
          <stop offset="50%" stopColor="#e6d9b2" />
          <stop offset="100%" stopColor="#d6c391" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={S} height={S} fill="url(#fm-ground)" />
      {/* 中線（雙方出生點的垂直平分線） */}
      <line
        x1={S / 2 - Math.sin(map.enemyAngle) * -S}
        y1={S / 2 + Math.cos(map.enemyAngle) * -S}
        x2={S / 2 + Math.sin(map.enemyAngle) * -S}
        y2={S / 2 - Math.cos(map.enemyAngle) * -S}
        stroke="#000"
        strokeOpacity={0.08}
        strokeWidth={0.6}
        strokeDasharray="2 2"
      />
      {map.neutral.map((n, i) => (
        <circle key={`n${i}`} cx={n.p.x} cy={n.p.y} r={0.9} fill="#fafafa" stroke="#777" strokeWidth={0.2} />
      ))}
      {map.enemySites.map((s) => dot(s, map.enemy, true))}
      {map.sites.map((s) => dot(s, map.home, false))}

      {/* 農田：繞著城鎮中心排 */}
      {Array.from({ length: farms }, (_, i) => {
        const a = (i / Math.max(8, farms)) * Math.PI * 2 + 0.3
        const p = toMap(map.home, 6.5 + Math.floor(i / 10) * 3, a)
        return <rect key={`f${i}`} x={p.x - 1.3} y={p.y - 1.3} width={2.6} height={2.6} fill="#c9b458" stroke="#8a7a2a" strokeWidth={0.2} />
      })}

      {/* 光環範圍（蓄水池、大酒莊、花塔…）：完成後才生效，蓋造中用虛線 */}
      {builds
        .filter((b) => b.radius)
        .map((b) => {
          const p = toMap(map.home, b.at, b.angle)
          const done = b.done != null && b.done <= t!
          return (
            <circle
              key={`z${b.uid}`}
              cx={p.x}
              cy={p.y}
              r={b.radius}
              fill="#d4a017"
              fillOpacity={done ? 0.14 : 0.05}
              stroke="#d4a017"
              strokeOpacity={0.7}
              strokeWidth={0.3}
              strokeDasharray={done ? undefined : '1 0.6'}
              pointerEvents="none"
            />
          )
        })}

      {builds.map((b) => {
        const p = toMap(map.home, b.at, b.angle)
        const size = ROLE_SIZE[b.role] ?? 2.6
        const done = b.done != null && b.done <= t!
        const tower = /outpost|tower/.test(b.item)
        return (
          <Tooltip key={b.uid} title={`${fmtName(b.item)}：${Math.floor(b.placed / 60)}:${String(Math.round(b.placed % 60)).padStart(2, '0')} 開工${b.done != null ? `，${Math.floor(b.done / 60)}:${String(Math.round(b.done % 60)).padStart(2, '0')} 完成` : ''}${b.radius ? `；光環範圍約 ${b.radius.toFixed(1)} 格（範圍內的採集點才有加成）` : ''}`}>
            {tower ? (
              <polygon
                points={`${p.x},${p.y - 2.4} ${p.x + 2.1},${p.y + 1.6} ${p.x - 2.1},${p.y + 1.6}`}
                fill={done ? '#2f4f8f' : '#fff'}
                stroke="#2f4f8f"
                strokeWidth={0.45}
                strokeDasharray={done ? undefined : '0.8 0.5'}
              />
            ) : (
              <rect
                x={p.x - size / 2}
                y={p.y - size / 2}
                width={size}
                height={size}
                rx={b.role === 'step' ? 0.8 : 0.3}
                fill={done ? (b.role === 'step' ? '#b8860b' : '#4c6fb5') : '#ffffff'}
                fillOpacity={done ? 0.95 : 0.6}
                stroke={b.role === 'step' ? '#8a6408' : '#2f4f8f'}
                strokeWidth={0.4}
                strokeDasharray={done ? undefined : '0.8 0.5'}
              />
            )}
          </Tooltip>
        )
      })}

      {tc(map.enemy, '#b42318', '對手')}
      {tc(map.home, '#1d39c4', '你')}
      {sheepAt && sheepAt.workers > 0 && (
        <Tooltip title={`羊：${sheepAt.workers} 人在採`}>
          <g>
            <circle cx={map.home.x - 4.5} cy={map.home.y - 4} r={2} fill="#1d39c4" />
            <text x={map.home.x - 4.5} y={map.home.y - 3.25} fontSize={2.2} fill="#fff" textAnchor="middle" fontWeight={700}>
              {sheepAt.workers}
            </text>
          </g>
        </Tooltip>
      )}
      {farmAt && farmAt.workers > 0 && (
        <Tooltip title={`農田：${farmAt.workers} 人在耕作`}>
          <g>
            <circle cx={map.home.x + 4.5} cy={map.home.y + 4} r={2} fill="#7c6f1d" />
            <text x={map.home.x + 4.5} y={map.home.y + 4.75} fontSize={2.2} fill="#fff" textAnchor="middle" fontWeight={700}>
              {farmAt.workers}
            </text>
          </g>
        </Tooltip>
      )}
    </svg>
  )
}
