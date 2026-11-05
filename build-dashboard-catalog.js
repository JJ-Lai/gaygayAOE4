// 產生 dashboard/catalog.json：儀表板在瀏覽器裡分析其他玩家時用的完整成本表。
//   items：pbgid → [baseId, 類型 u/b/t, 食物, 木材, 黃金, 石頭, 橄欖油, 生產秒數, 生產建築 baseId]（格式同 aoe4-data 的 catalog）
//   attrib：藍圖名稱（小寫、去掉 _control）→ pbgid，讀本機 stats.rgs 時用
// 來源是 data.aoe4world.com 的四份資料表（快取在 data/catalog/）。遊戲改版後執行：
//   node build-dashboard-catalog.js --refresh
'use strict';
const fs = require('fs');
const path = require('path');
const { loadCatalog, compactEntry } = require('./lib/catalog');

const ROOT = __dirname;

async function main() {
  const catalog = await loadCatalog(path.join(ROOT, 'data', 'catalog'), { refresh: process.argv.includes('--refresh') });
  const items = {};
  [...catalog.byPbgid.keys()].sort((a, b) => a - b).forEach((id) => { items[id] = compactEntry(catalog.byPbgid.get(id)); });
  const attrib = {};
  [...catalog.byAttrib.keys()].sort().forEach((k) => { attrib[k] = catalog.byAttrib.get(k).pbgid; });
  const out = { version: 1, generatedAt: new Date().toISOString(), source: 'data.aoe4world.com', items, attrib };
  const file = path.join(ROOT, 'dashboard', 'catalog.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('已寫入 ' + file + '：' + Object.keys(items).length + ' 個項目、' + Object.keys(attrib).length + ' 個藍圖名稱，' + Math.round(fs.statSync(file).size / 1024) + ' KB');
}

main().catch((e) => { console.error(e); process.exit(1); });
