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

/** phaseBias 每格的秒數 */
export const PHASE_SEC = 45

export interface Policy {
  steps: StepParams[]
  /** 蓋房的額外緩衝人口（基本緩衝依生產速度自動算） */
  houseBuffer: number
  /** 是否去打鹿（要在鹿群旁蓋磨坊） */
  hunt: boolean
  /** 同時採羊的最多人數（0~10，預設 10）；其餘食物村民去下一個最好的食物點（例如蓋磨坊採野果） */
  sheepCap?: number
  /** 經濟科技 id -> 在第幾步開始研究；-1 = 不研究 */
  ecoAt: Record<string, number>
  /** 沒有指定地標的升代步驟：時代 -> 地標/科技 id */
  landmarkPick: Record<number, string>
  /** 目標達成後全力出兵：同時運作的生產建築數 */
  postProducers: number
  /** 被動收入建築（莊園、坑礦、屋台）：id -> 從第幾步開始蓋、蓋幾座 */
  trickle: Record<string, { at: number; count: number }>
  /**
   * 光環建築（地標、蓄水池）的位置：id -> 每座的錨點（'home' 或採集點 id）。
   * 陣列長度 = 要蓋幾座（只對蓄水池這類非地標有意義）；沒寫用預設。
   */
  placeAt?: Record<string, string[]>
  /** 朝代：時代 -> 是否補蓋這個時代的另一座地標（中國、朱熹） */
  dynasty?: Record<number, boolean>
  /** 德里：訓練幾名學者駐紮加速研究 */
  scholars?: number
  /**
   * 依時間的資源偏好：第 i 格是第 i×45 ~ (i+1)×45 秒，加在分配比例上（-0.35 ~ 0.35），和步驟的偏好相加。
   * 讓搜尋可以逐段調整「這段時間多放幾個人在哪種資源」。
   */
  phaseBias?: Partial<Bundle>[]
  /** 可重複的科技研究幾次（維京農莊） */
  repeats?: Record<string, number>
  /** 馬利：買幾隻牛給村民採 */
  herd?: number
  /** 中國：再訓練幾名監工 */
  officials?: number
  /** 法蘭西公會廳：多久收一次（秒） */
  collectEvery?: number
  /** 輔助單位（教士、僧侶）各訓練幾名 */
  support?: Record<string, number>
  /** 蒙古：敖包範圍內雙倍生產村民 */
  double?: boolean
  /** 馬利格里奧巴拉：一直開的慶典（spec.festival.options 的 key） */
  festival?: string
  /** 金帳：使用的詔令（spec.edicts.options 的 key） */
  edict?: string
  /** 圖格魯克：各座要塞依序任命的總督 */
  governors?: string[]
  /** 要拿幾個聖物、佔幾個聖地（上限是 HolySettings） */
  relics?: number
  sites?: number
  /** 陸地貿易：訓練幾名商人（不含免費送的） */
  traders?: number
  /** 馬利：沿貿易路線蓋幾座收費哨站 */
  tolls?: number
  /** 金朝：派使者在幾座貿易站建立朝貢國 */
  tributaries?: number
  /** 拜占庭：用渡槽把蓄水池連起來提升水位 */
  link?: boolean
  /** 蒙古：沿貿易路線蓋幾座驛站前哨（商人在光環內加速） */
  yams?: number
  /** 拜占庭：金角塔用哪份傭兵合約（spec.mercenaries.contracts 的 key） */
  contract?: string
  /**
   * 控制器規則的參數（沒寫用預設）：rebalance = 幾秒重算一次村民分配（8）、move = 一次最多搬幾成村民（0.15）、
   * hyst = 差距小於幾人不搬（3）、setup = 選採集點時把走路與蓋營地攤到幾秒（120）、camp = 採集點多遠才蓋營地（6 格）、
   * houseLead = 蓋房提前的秒數（建造時間之外，12）、farmLead = 天然食物剩不到「食物村民 × 0.6 × 幾秒」就預留農田木材（90）
   */
  ctl?: Partial<Record<'rebalance' | 'move' | 'hyst' | 'setup' | 'camp' | 'houseLead' | 'farmLead', number>>
  /** 捕魚：訓練幾艘漁船，以及從第幾秒開始（之前不蓋碼頭、不訓練漁船；沒寫是 60 秒） */
  boats?: number
  fishFrom?: number
}

/**
 * 捕魚的設定（地圖模型沒有水）：漁船能用的深水魚有幾個、碼頭到魚的距離，以及城鎮中心到岸邊（蓋碼頭）的距離（格）。
 */
export interface FishSettings {
  spots: number
  dist: number
  dock: number
  /** 村民能採的岸邊魚條數（在岸邊，離城鎮中心 dock 格） */
  shore?: number
}

/**
 * 陸地貿易的設定（地圖模型沒有貿易站的位置）：能用的中立貿易站有幾座，以及離家裡的市場多遠（格）。
 * 有些地圖沒有貿易站；位置與距離由使用者設定。
 */
export interface TradeSettings {
  posts: number
  dist: number
}

/**
 * 聖物與聖地的設定（地圖模型沒有它們的位置）：你最多能拿到幾個聖物、佔幾個聖地，以及離城鎮中心多遠（格）。
 * 1v1 地圖有 5 個聖物、乾燥阿拉伯 3 個聖地（Fandom），但雙方會搶，能拿到幾個與距離由使用者設定。
 */
export interface HolySettings {
  relics: number
  relicDist: number
  sites: number
  siteDist: number
}

/**
 * 操作損失：引擎沒有反應時間與走位損失，最快時間比職業快 20～60 秒。
 * PRO_LOSS 用三個職業基準校準（英格蘭封建 3:50～4:10、日本直城 7:45～8:15、金朝頂尖最快封建 3:44）：
 * 每次手動指令 4 秒、採集效率 85%，三者分別得到 3:52、7:57、3:52（2026-11-06，scripts/check-planner.ts）。
 */
export interface OpLoss {
  delay: number
  efficiency: number
}
export const PRO_LOSS: OpLoss = { delay: 4, efficiency: 0.85 }

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
  /** 光環建築：影響範圍（從中心算，格）與錨點 */
  radius?: number
  anchor?: string
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
  /** 目標達成那一刻的累計收入（四種資源：採集 + 被動收入 + 一次給的），評分的次要條件 */
  gatheredAtGoal: number
  /** 同上，分資源 */
  gatheredByRes: Bundle
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
