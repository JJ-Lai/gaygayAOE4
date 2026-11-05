// 幫儀表板資料補上重播檔裡的生產指令（detail.players[].orders），讓「佇列呆料」改用實際排隊時間計算。
// 重播來自官方統計網站（玩家需開啟「分享對戰紀錄」，舊的重播會過期），快取在 data/replays/。
// 用法：node enrich-replays.js            只處理還沒有指令的場次
//       node enrich-replays.js --file 252441139=samples/replays/xxx.rec   用本機的重播檔
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { get } = require('./lib/catalog');
const { parseRec, ordersFor, replayPlayerFor } = require('./lib/rec-parse');
const { readDashboard, writeDashboard } = require('./lib/dashboard-data');

const ROOT = __dirname;
const REPLAY_DIR = path.join(ROOT, 'data', 'replays');
const PAUSE_MS = 1100;
// 2：orders 加入取消指令；版本較舊的場次會用快取的重播重新產生
const ORDERS_VERSION = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function unpack(raw) {
  if (raw[0] === 0x1f && raw[1] === 0x8b) return zlib.gunzipSync(raw);
  if (raw[0] === 0x50 && raw[1] === 0x4b) {
    // ZIP：只有一個檔案，讀本地檔頭後的壓縮內容
    const method = raw.readUInt16LE(8), csize = raw.readUInt32LE(18), nlen = raw.readUInt16LE(26), xlen = raw.readUInt16LE(28);
    const start = 30 + nlen + xlen;
    const body = raw.subarray(start, csize ? start + csize : undefined);
    return method === 8 ? zlib.inflateRawSync(body) : body;
  }
  return raw;
}

async function loadReplay(gameId, profileId, localFile) {
  fs.mkdirSync(REPLAY_DIR, { recursive: true });
  const file = path.join(REPLAY_DIR, gameId + '.rec.gz');
  const missing = path.join(REPLAY_DIR, gameId + '.missing');
  if (localFile) {
    const buf = unpack(fs.readFileSync(localFile));
    fs.writeFileSync(file, zlib.gzipSync(buf));
    return { buf, fetched: false };
  }
  if (fs.existsSync(file)) return { buf: zlib.gunzipSync(fs.readFileSync(file)), fetched: false };
  if (fs.existsSync(missing)) return { buf: null, fetched: false };
  const url = 'https://api.ageofempires.com/api/GameStats/AgeIV/GetMatchReplay/?gameId=' + gameId + '&profileId=' + profileId + '&matchId=' + gameId;
  const res = await get(url);
  if (res.status !== 200 || res.body.length < 1000) { fs.writeFileSync(missing, String(res.status)); return { buf: null, fetched: true }; }
  const buf = unpack(res.body);
  if (buf.toString('latin1', 4, 11) !== 'AOE4_RE') { fs.writeFileSync(missing, 'not a replay'); return { buf: null, fetched: true }; }
  fs.writeFileSync(file, zlib.gzipSync(buf));
  return { buf, fetched: true };
}

async function main() {
  const local = {};
  process.argv.forEach((a, i) => { if (a === '--file') { const [id, f] = String(process.argv[i + 1]).split('='); local[id] = f; } });
  const data = readDashboard(ROOT);
  const me = data.player && data.player.id;
  const stats = { matches: 0, enriched: 0, fetched: 0, missing: 0, already: 0, failed: 0 };
  for (const m of data.matches) {
    const detail = m.detail;
    if (!detail || detail.source === 'local-replay' || typeof m.id !== 'number') continue;
    if (!detail.players.some((p) => Array.isArray(p.events))) continue;
    stats.matches++;
    if (!local[m.id] && detail.players.every((p) => Array.isArray(p.orders)) && detail.ordersVersion >= ORDERS_VERSION) { stats.already++; continue; }
    let res;
    try { res = await loadReplay(m.id, me, local[m.id]); }
    catch (e) { stats.failed++; console.error(m.id, e.message); continue; }
    if (res.fetched) { stats.fetched++; await sleep(PAUSE_MS); }
    if (!res.buf) { stats.missing++; continue; }
    let rec;
    try { rec = parseRec(res.buf); }
    catch (e) { stats.failed++; console.error(m.id, '解析失敗：' + e.message); continue; }
    const used = new Set();
    let any = false;
    for (const p of detail.players) {
      const rp = replayPlayerFor(rec, p, used);
      if (!rp) continue;
      used.add(rp);
      p.orders = ordersFor(rec, rp.pid);
      any = true;
    }
    if (any) { detail.replayBuild = rec.build; detail.ordersVersion = ORDERS_VERSION; stats.enriched++; }
  }
  data.generatedAt = new Date().toISOString();
  writeDashboard(ROOT, data);
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
