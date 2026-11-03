export interface Opening {
  food: number
  wood: number
  gold: number
  stone: number
  villagers: number
  workerId?: string
  workerLabel: string
  workerCap: number
  /** 非農田的採集倍率。1 表示用目錄裡的基礎速率。 */
  gather: number
  farmGather?: number
  carryBonus: number
  /** 一般建築的建造效率。地標、防禦可另外指定。 */
  build: number
  landmarkBuild?: number
  defenseBuild?: number
  detail: string
}

const standard = (detail: string, patch: Partial<Opening> = {}): Opening => ({
  food: 200,
  wood: 150,
  gold: 100,
  stone: 0,
  villagers: 6,
  workerLabel: '村民',
  workerCap: 130,
  gather: 1,
  carryBonus: 0,
  build: 1,
  detail,
  ...patch,
})

/**
 * 開局數字來自遊戲內說明與文明條目，不是 AoE4 World 的 age 欄位。
 * 沒有寫進 detail 的機制就不在線性式裡。
 */
const OPENINGS: Record<string, Opening> = {
  ab: standard('阿拔斯開局 6 村民，200 食物、200 木材、100 黃金。野果速率已在目錄。黃金時代要靠智慧宮影響範圍內的建築，這裡沒有假設建築都蓋在範圍內。', { wood: 200 }),
  ay: standard('阿尤布開局 6 村民，200 食物、200 木材、100 黃金。野果速率已在目錄。黃金時代同樣沒有假設建築都在智慧宮範圍內。', { wood: 200 }),
  by: standard('拜占庭開局 6 村民，200 食物、150 木材、100 黃金、100 石頭，另有 100 橄欖油。第一座蓄水池用起始石頭，蓋好後採集 +10%（一級水，假設村民在光環內，多座不疊加）。水渠升到二級以上、橄欖油和建築返石沒有模擬。', { stone: 100 }),
  ch: standard('中國開局 6 村民，200 食物、150 木材、100 黃金。建築時間沿用目錄裡已經折過的快速建造。監工和稅收沒有模擬。'),
  de: standard('德里開局 6 村民，200 食物、200 木材、100 黃金。野果速率已在目錄。免費但很慢的科技沒有另做一條研究時間。', { wood: 200 }),
  en: standard('英格蘭開局 6 村民，200 食物、200 木材、100 黃金。', { wood: 200 }),
  fr: standard('法蘭西開局 6 村民，200 食物、150 木材、100 黃金。村民訓練時間和落點建築半價沿用目錄。'),
  gol: standard('金帳汗國開局按 6 村民，200 食物、225 木材、150 黃金、50 石頭。雙產和帳房沒有另做。', { wood: 225, gold: 150, stone: 50 }),
  hr: standard('神聖羅馬開局 6 村民、1 神職人員，200 食物、150 木材、0 黃金。神職人員的靈感沒有進採集速率。', { gold: 0 }),
  hl: standard('蘭開斯特開局 6 村民，200 食物、200 木材、100 黃金，羊的採集速率已在目錄。額外 4 隻羊沒有加進地圖食物存量。', { wood: 200 }),
  ja: standard('日本開局 6 村民，200 食物、150 木材、100 黃金。金礦 20% 石頭、農田大名光環沒有進這個模型。'),
  je: standard('聖女貞德開局 6 村民，200 食物、150 木材、100 黃金。貞德本人的經驗和採集沒有算成工人。'),
  jin: standard('金朝開局 3 名鄉騎、1 偵察兵、2 馴鹿、2 羊，200 食物、150 木材、100 黃金。鄉騎採集是村民的 2.2 倍，農田是 1.9 倍，攜帶量多 5；一般建築建造 2 倍、地標 1.75 倍、防禦 1.4 倍。只訓練鄉騎，上限 20，不訓練普通村民。馴鹿和羊的肉量沒有加進地圖食物存量。', {
    villagers: 3,
    workerId: 'mounted-villager',
    workerLabel: '鄉騎',
    workerCap: 20,
    gather: 2.2,
    farmGather: 1.9,
    carryBonus: 5,
    build: 2,
    landmarkBuild: 1.75,
    defenseBuild: 1.4,
  }),
  kt: standard('聖殿騎士團開局 6 村民，200 食物、100 木材、100 黃金。木材基礎速率 0.6 已在目錄；伐木同時獲得食物還沒有進收入。', { wood: 100 }),
  mac: standard('馬其頓王朝開局 6 村民，200 食物、200 木材、100 黃金、100 白銀。白銀不是石頭，沒有放進石頭庫存。', { wood: 200 }),
  ma: standard('馬利開局 6 村民，200 食物、150 木材、100 黃金。坑礦和牛沒有模擬。'),
  mo: standard('蒙古開局 6 村民、可汗，200 食物、150 木材、100 黃金。沒有房屋，人口上限按 200。敖包的雙倍生產沒有模擬。'),
  od: standard('龍騎士團開局 5 名鍍金村民，200 食物、200 木材、100 黃金。採集快 27%。建造時間沿用目錄裡已經加快的數字，不重複加速。', {
    villagers: 5,
    wood: 200,
    workerId: 'gilded-villager',
    workerLabel: '鍍金村民',
    gather: 1.27,
  }),
  ot: standard('鄂圖曼開局 6 村民，200 食物、200 木材、100 黃金、50 石頭。軍營造價沿用目錄。軍事學校的免費產兵沒有模擬。', { wood: 200, stone: 50 }),
  ru: standard('羅斯開局 6 村民，200 食物、200 木材、100 黃金。賞金的黃金和食物加速沒有進收入。', { wood: 200 }),
  sco: standard('蘇格蘭的高地牛和塔樓房屋人口沒有進這個模型，開局暫用 6 村民、200 食物、150 木材、100 黃金。'),
  sen: standard('戰國大名開局 6 村民，200 食物、150 木材、100 黃金。祭典的採集光環和金礦換石頭沒有模擬。'),
  tug: standard('圖格魯克開局 6 村民，200 食物、150 木材、100 黃金。工作象的額外掉落沒有進收入。'),
  vik: standard('維京村民會免費自動招募，長屋提高上限。這個模型仍用目錄裡的村民花費，所以不是維京的最佳解。'),
  zx: standard('朱熹傳承開局 5 村民、1 監工，150 食物、200 木材、50 黃金。只把村民數和資源帶入。監工加速和稅收沒有模擬。', {
    villagers: 5,
    food: 150,
    wood: 200,
    gold: 50,
  }),
}

export function openingFor(abbr: string): Opening {
  return OPENINGS[abbr] ?? standard('這個文明沒有單獨的開局記錄，暫用 6 村民、200 食物、150 木材、100 黃金。')
}

export function buildPace(itemId: string, landmark: boolean, opening: Opening): number {
  if (landmark) return opening.landmarkBuild ?? opening.build
  if (/outpost|palisade|wall|keep|tower|fortress|gate/i.test(itemId)) return opening.defenseBuild ?? opening.build
  return opening.build
}
