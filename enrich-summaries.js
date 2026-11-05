// 幫儀表板資料補上每位玩家的建造／生產／研究事件（detail.players[].events）與成本表（catalog），
// 讓儀表板可以分析資源囤積、佇列呆料和生產建築利用率。
// 來源：aoe4world 單場摘要的 buildOrder（快取在 data/summaries/），成本來自 data.aoe4world.com。
// 用法：node enrich-summaries.js            只抓還沒有事件的場次
//       node enrich-summaries.js --refresh  重新下載成本表
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { loadCatalog, compactEntry, get } = require('./lib/catalog');
const { readDashboard, writeDashboard } = require('./lib/dashboard-data');

const ROOT = __dirname;
const SUMMARY_DIR = path.join(ROOT, 'data', 'summaries');
const CATALOG_DIR = path.join(ROOT, 'data', 'catalog');
const PAUSE_MS = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 事件代碼：0 = 完成（單位、科技）、1 = 建築蓋好、2 = 被摧毀
const CODE = { finished: 0, constructed: 1, destroyed: 2 };

async function loadSummary(gameId, profileId) {
  fs.mkdirSync(SUMMARY_DIR, { recursive: true });
  const file = path.join(SUMMARY_DIR, gameId + '.json.gz');
  const missing = path.join(SUMMARY_DIR, gameId + '.missing');
  if (fs.existsSync(file)) return { summary: JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')), fetched: false };
  if (fs.existsSync(missing)) return { summary: null, fetched: false };
  const url = 'https://aoe4world.com/players/' + profileId + '/games/' + gameId + '/summary?camelize=true';
  const res = await get(url);
  if (res.status === 404) { fs.writeFileSync(missing, ''); return { summary: null, fetched: true }; }
  if (res.status !== 200) throw new Error('摘要 ' + gameId + ' 下載失敗：HTTP ' + res.status);
  const summary = JSON.parse(res.body.toString('utf8'));
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(summary)));
  return { summary, fetched: true };
}

function eventsFromBuildOrder(buildOrder, catalog, used) {
  const out = [];
  for (const item of buildOrder || []) {
    if (!catalog.byPbgid.has(item.pbgid)) continue;
    used.add(item.pbgid);
    for (const [key, code] of Object.entries(CODE)) {
      for (const t of item[key] || []) {
        if (typeof t !== 'number' || t < 0) continue;
        out.push([Math.round(t), item.pbgid, code]);
      }
    }
  }
  out.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  return out;
}

function summaryPlayerFor(summary, p) {
  const list = summary.players || [];
  return list.find((x) => p.id && x.profileId === p.id) || list.find((x) => p.name && x.name === p.name) || null;
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const data = readDashboard(ROOT);
  const catalog = await loadCatalog(CATALOG_DIR, { refresh });
  const me = data.player && data.player.id;
  const used = new Set(Object.keys(data.catalog || {}).map(Number));
  const stats = { matches: 0, enriched: 0, fetched: 0, missing: 0, already: 0, failed: 0 };

  for (const m of data.matches) {
    const detail = m.detail;
    if (!detail || detail.source === 'local-replay' || typeof m.id !== 'number') continue;
    stats.matches++;
    if (detail.players.every((p) => Array.isArray(p.events))) {
      detail.players.forEach((p) => p.events.forEach((e) => used.add(e[1])));
      stats.already++;
      continue;
    }
    let res;
    try { res = await loadSummary(m.id, me); }
    catch (e) { stats.failed++; console.error(e.message); continue; }
    if (res.fetched) { stats.fetched++; await sleep(PAUSE_MS); }
    if (!res.summary) { stats.missing++; continue; }
    let any = false;
    for (const p of detail.players) {
      const sp = summaryPlayerFor(res.summary, p);
      if (!sp) continue;
      p.events = eventsFromBuildOrder(sp.buildOrder, catalog, used);
      any = true;
    }
    if (any) stats.enriched++;
  }

  // 本機重播的事件（由 lib/local-detail.js 產生）也要把用到的項目放進成本表
  for (const m of data.matches) for (const p of (m.detail && m.detail.players) || []) for (const e of p.events || []) used.add(e[1]);

  const compact = {};
  [...used].sort((a, b) => a - b).forEach((id) => { const x = catalog.byPbgid.get(id); if (x) compact[id] = compactEntry(x); });
  data.catalog = compact;
  data.generatedAt = new Date().toISOString();
  writeDashboard(ROOT, data);
  console.log(JSON.stringify({ ...stats, catalogItems: Object.keys(compact).length }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
