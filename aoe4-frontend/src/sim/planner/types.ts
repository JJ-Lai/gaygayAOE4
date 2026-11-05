// 目標鏈規劃器（patch 17.0.12260）共用型別。
// 逐秒模擬 + 參數搜尋（取代舊版封閉式線性近似）。

export type Res = 'food' | 'wood' | 'gold' | 'stone'
export type Bundle = Record<Res, number>
export const RES: Res[] = ['food', 'wood', 'gold', 'stone']
export const zero = (): Bundle => ({ food: 0, wood: 0, gold: 0, stone: 0 })

// ---------- 地圖 ----------
export type SiteKind = 'sheep' | 'berry' | 'deer' | 'boar' | 'wood' | 'gold' | 'stone'

export interface Site {
  id: string
  kind: SiteKind
  label: string
  /** 總存量 */
  amount: number
  /** 羊隻、果叢、鹿、樹的數量，用來估同時可採的人數 */
  units: number
  /** 離城鎮中心中心點的格數 */
  dist: number
  /** 方位角（弧度），只用來畫小地圖和估兩點距離 */
  angle: number
  /** 中立或靠近對手，預設不採 */
  contested: boolean
}

export interface GameMap {
  typeId: string
  name: string
  seed: number
  sites: Site[]
  /** 牧羊：斥候把附近的羊帶回城鎮中心的時間點（秒） */
  sheepArrivals: number[]
  /** 自家城鎮中心到對手城鎮中心的格數 */
  enemyDist: number
  /** 從自家城鎮中心看向對手的方位角（弧度，與 Site.angle 同一座標系） */
  enemyAngle: number
  /** 全地圖邊長（格），座標原點在左上 */
  size: number
  home: Point
  enemy: Point
  /** 對手的起始資源：自家資源對地圖中心點對稱（17.0 起 1v1 出生點鏡像對稱） */
  enemySites: Site[]
  /** 中立資源（示意） */
  neutral: { kind: SiteKind; label: string; p: Point }[]
  notes: string[]
}

export interface Point {
  x: number
  y: number
}

// ---------- 目標 ----------
export type Goal =
  | { kind: 'age'; age: 2 | 3 | 4; via?: string }
  | { kind: 'build'; item: string; count: number; forward?: boolean }
  | { kind: 'army'; unit: string; count: number }
  | { kind: 'tech'; item: string }
  | { kind: 'villagers'; count: number }

/** 解析後的單一步驟：一個目標可能展開成多步（例如先升代、先蓋馬廄）。 */
export interface Step {
  goalIndex: number
  /** 這步是使用者的目標本身，還是為了它補上的前置 */
  implicit: boolean
  kind: 'age' | 'build' | 'army' | 'tech' | 'villagers'
  item: string
  count: number
  forward: boolean
  /** 升代步驟的目標時代 */
  age?: number
  label: string
}

// ---------- 策略參數（搜尋的對象） ----------
export interface StepParams {
  /** 蓋這一步建築（地標、塔）的村民數 */
  builders: number
  /** 對四種資源的分配偏好，-0.3 ~ 0.3，加在需求比例上 */
  bias: Bundle
  /** 軍隊步驟：生產建築的數量 */
  producers: number
}

export interface Policy {
  steps: StepParams[]
  /** 蓋房的額外緩衝人口（基本緩衝依生產速度自動算） */
  houseBuffer: number
  /** 是否去打鹿（要在鹿群旁蓋磨坊） */
  hunt: boolean
  /** 經濟科技 id -> 在第幾步開始研究；-1 = 不研究 */
  ecoAt: Record<string, number>
  /** 沒有指定地標的升代步驟：時代 -> 地標/科技 id */
  landmarkPick: Record<number, string>
  /** 目標達成後全力出兵：同時運作的生產建築數 */
  postProducers: number
  /** 被動收入建築（莊園、坑礦、屋台）：id -> 從第幾步開始蓋、蓋幾座 */
  trickle: Record<string, { at: number; count: number }>
}

/** 目標達成後的「全力出兵」設定 */
export interface PostArmy {
  /** 目標後要訓練的軍隊數（0 = 不模擬） */
  units: number
  /** 目標後要完成的鐵匠舖升級數 */
  upgrades: number
}

// ---------- 輸出 ----------
export type EventKind =
  | 'start'
  | 'villager'
  | 'rally'
  | 'place'
  | 'done'
  | 'train'
  | 'research'
  | 'age'
  | 'goal'
  | 'deplete'
  | 'note'

export interface PlanEvent {
  t: number
  kind: EventKind
  text: string
  item?: string
  pop: number
  villagers: number
  split: Bundle
  /** 這筆紀錄當下（已扣掉 cost 之後）的庫存 */
  bank: Bundle
  /** 這個動作花掉的資源（沒有花費就不給） */
  cost?: Bundle
  /** cost 是之前就付掉的（村民在排進城鎮中心時付款，出來時才記錄） */
  prepaid?: boolean
}

export interface Sample {
  t: number
  bank: Bundle
  /** 特殊資源庫存（橄欖油、白銀…） */
  other: Record<string, number>
  split: Bundle
  building: number
  walking: number
  idle: number
  villagers: number
  pop: number
  popCap: number
  age: number
  army: number
  income: Bundle
  /** 各採集點此刻的人數與剩餘量（sheep、farm 也在內） */
  sites: { id: string; workers: number; left: number }[]
  farms: number
}

/** 建築的位置與時間（畫地圖時間軸用） */
export interface BuildingTrack {
  uid: number
  item: string
  role: string
  /** 相對自家城鎮中心的距離與方位角 */
  at: number
  angle: number
  placed: number
  done: number | null
}

export interface GoalResult {
  goalIndex: number
  label: string
  t: number | null
}

export interface PlanResult {
  ok: boolean
  /** 最後一個目標完成的秒數；做不到時是 Infinity */
  finish: number
  /** 目標後全力出兵：達成兵數與升級的時間（沒有設定時是 null，做不到時是 Infinity） */
  armyAt: number | null
  postUnits: number
  postUpgrades: number
  /** 全力出兵階段訓練的單位 id -> 數量 */
  postMix: Record<string, number>
  /** 全力出兵階段完成的升級 */
  postTechs: string[]
  /** 目標完成那一刻的村民數 */
  villagersAtGoal: number
  buildings: BuildingTrack[]
  score: number
  goals: GoalResult[]
  steps: Step[]
  events: PlanEvent[]
  samples: Sample[]
  ageTimes: Record<number, number>
  villagers: number
  /** 城鎮中心違反「不中斷村民生產」的秒數（多座相加；人口 200 不算） */
  tcIdle: number
  /** 城鎮中心閒置的原因與秒數（含不算違規的人口 200） */
  tcIdleReasons: Record<string, number>
  warnings: string[]
}
