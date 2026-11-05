// 把 vite build 的結果組成要部署到 Cloudflare Workers（gaygayaoe4）的網站：
//   /          → 儀表板（repo 根目錄的 dashboard/index.html）
//   /simulate  → 戰術模擬（vite 產生的 React 頁，改名成 simulate.html）
//   /js/*、/catalog.json → 儀表板的「看別人的戰績」（dashboard/js、dashboard/catalog.json）
// 儀表板的資料不打包進網站，網頁會直接從 GitHub raw 讀最新的 aoe4-data.json，
// 所以開機同步推資料時不需要重新部署。
import { copyFileSync, cpSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(frontend, 'dist')
const dashboard = resolve(frontend, '..', 'dashboard', 'index.html')

if (!existsSync(join(dist, 'index.html'))) throw new Error('找不到 dist/index.html，請先執行 vite build')
if (!existsSync(dashboard)) throw new Error('找不到儀表板：' + dashboard)

renameSync(join(dist, 'index.html'), join(dist, 'simulate.html'))
copyFileSync(dashboard, join(dist, 'index.html'))
// 儀表板的程式（切換玩家、重播解析）與成本表
cpSync(resolve(dirname(dashboard), 'js'), join(dist, 'js'), { recursive: true })
copyFileSync(resolve(dirname(dashboard), 'catalog.json'), join(dist, 'catalog.json'))

// 儀表板會先載入 data/aoe4-data.js 當備援；部署版放一個空檔，避免拿到 404 或被當成網頁回傳。
mkdirSync(join(dist, 'data'), { recursive: true })
writeFileSync(join(dist, 'data', 'aoe4-data.js'), '// 部署版不附資料：儀表板直接從 GitHub 讀取 dashboard/data/aoe4-data.json。\n')

console.log('網站已組好：dist/index.html（儀表板）、dist/simulate.html（戰術模擬）')
