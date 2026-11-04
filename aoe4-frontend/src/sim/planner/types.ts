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
  notes: string[]
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
  /** 這一步期間暫停生產村民 */
  stopVills: boolean
  /** 軍隊步驟：生產建築的數量 */
  producers: number
}

export interface Policy {
  steps: StepParams[]
  /** 村民上限（到了就停產） */
  maxVills: number
  /** 剩幾格人口時開始蓋房 */
  houseBuffer: number
  /** 是否去打鹿（要在鹿群旁蓋磨坊） */
  hunt: boolean
  /** 經濟科技 id -> 在第幾步開始研究；-1 = 不研究 */
  ecoAt: Record<string, number>
  /** 沒有指定地標的升代步驟：時代 -> 地標/科技 id */
  landmarkPick: Record<number, string>
}

// ---------- 輸出 ----------
export type EventKind =
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
}

export interface Sample {
  t: number
  bank: Bundle
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
  score: number
  goals: GoalResult[]
  steps: Step[]
  events: PlanEvent[]
  samples: Sample[]
  ageTimes: Record<number, number>
  villagers: number
  /** 目標完成前城鎮中心閒置的秒數（多座相加） */
  tcIdle: number
  warnings: string[]
}
