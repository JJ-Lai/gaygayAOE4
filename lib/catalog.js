// aoe4world 靜態資料表（data.aoe4world.com）：pbgid／藍圖名稱 → 成本、生產時間、生產建築。
// 原始檔快取在 data/catalog/，儀表板只存用得到的項目（見 compactEntry）。
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const KINDS = ['units', 'buildings', 'technologies', 'upgrades'];
const KIND_CODE = { units: 'u', buildings: 'b', technologies: 't', upgrades: 't' };
const USER_AGENT = 'aoe4-dashboard-sync/1.0 (personal match dashboard)';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).toString()));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

// 讀取（必要時下載）四份資料表，回傳 { byPbgid, byAttrib }
async function loadCatalog(cacheDir, { refresh = false } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const byPbgid = new Map();
  const byAttrib = new Map();
  for (const kind of KINDS) {
    const file = path.join(cacheDir, kind + '.json');
    if (refresh || !fs.existsSync(file)) {
      const res = await get('https://data.aoe4world.com/' + kind + '/all.json');
      if (res.status !== 200) throw new Error('下載 ' + kind + ' 資料表失敗：HTTP ' + res.status);
      fs.writeFileSync(file, res.body);
    }
    const list = JSON.parse(fs.readFileSync(file, 'utf8')).data || [];
    for (const x of list) {
      const entry = { ...x, kind: KIND_CODE[kind] };
      if (!byPbgid.has(x.pbgid)) byPbgid.set(x.pbgid, entry);
      if (x.attribName) {
        const key = normAttrib(x.attribName);
        if (!byAttrib.has(key)) byAttrib.set(key, entry);
      }
    }
  }
  return { byPbgid, byAttrib };
}

// 本機統計的藍圖名稱和資料表略有差異（例如建築多了 _control）
function normAttrib(name) {
  return String(name || '').toLowerCase().replace(/_control(?=_|$)/, '');
}

function lookupAttrib(catalog, name) {
  const key = normAttrib(name);
  return catalog.byAttrib.get(key) || catalog.byAttrib.get(key.replace(/_\d+$/, '')) || null;
}

// 儀表板用的精簡格式：[baseId, 類型(u/b/t), 食物, 木材, 黃金, 石頭, 橄欖油, 秒數, 生產建築 baseId]
function compactEntry(x) {
  const c = x.costs || {};
  const n = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v) : 0);
  const producer = Array.isArray(x.producedBy) && x.producedBy.length ? x.producedBy[0] : null;
  return [x.baseId || x.id, x.kind, n(c.food), n(c.wood), n(c.gold), n(c.stone), n(c.oliveoil), n(c.time), producer];
}

module.exports = { loadCatalog, lookupAttrib, compactEntry, get, USER_AGENT };
