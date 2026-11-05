// 從本機 Age of Empires IV 資料夾讀出自訂／對電腦對局，寫入 data/local-custom-matches.json。
// 遊戲沒快取的線上自訂對局（沒看賽後統計就離開時常發生），會從官方 API 的最近 30 場補下載到 data/relic-cache/。
// 若這個資料夾已是 git 倉庫且有 origin，會提交並推上 GitHub。
// 用法：node sync-local-matches.js
//       node sync-local-matches.js --no-push
//       node sync-local-matches.js --offline     不連官方 API，只讀本機
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { attachLocalDetails, matchFileGroups } = require('./lib/local-detail');
const { get } = require('./lib/catalog');
const dashboardData = require('./lib/dashboard-data');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'data', 'local-custom-matches.json');
const RELIC_DIR = path.join(ROOT, 'data', 'relic-cache');
const RELIC_INDEX = path.join(RELIC_DIR, 'index.json');
const RELIC_HISTORY = 'https://aoe-api.worldsedgelink.com/community/leaderboard/getRecentMatchHistory?title=age4&profile_ids=';
const ME = loadIdentity();

function loadIdentity() {
  const fallback = { profileId: 10861747, steamId: '76561198429263657', names: ['李侑玲', 'e1252081'] };
  const file = path.join(ROOT, 'aoe4-profile.json');
  if (!fs.existsSync(file)) return fallback;
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    profileId: Number(p.profile_id || fallback.profileId),
    steamId: String(p.steam_id || fallback.steamId),
    names: [...new Set([p.name, ...fallback.names].filter(Boolean))],
  };
}

function findGameDir() {
  const home = process.env.USERPROFILE || '';
  const candidates = [
    path.join(home, 'OneDrive', '文件', 'My Games', 'Age of Empires IV'),
    path.join(home, 'OneDrive', 'Documents', 'My Games', 'Age of Empires IV'),
    path.join(home, 'Documents', 'My Games', 'Age of Empires IV'),
  ];
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, 'network')) || fs.existsSync(path.join(dir, 'matchhistory')));
  if (!found) throw new Error('找不到 Age of Empires IV 資料夾。試過：\n' + candidates.join('\n'));
  return found;
}

function readU16Str(buf, off, max) {
  let s = '';
  const end = Math.min(buf.length, off + max * 2);
  for (let i = off; i + 1 < end; i += 2) {
    const c = buf.readUInt16LE(i);
    if (!c) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function parseReplay(buf) {
  const info = { build: buf.readUInt16LE(2), startedAtLocal: readU16Str(buf, 12, 40) };
  const head = buf.subarray(0, Math.min(buf.length, 8000)).toString('latin1');
  const map = /\x01?([\x01-\x40])\x00\x00\x00(map_size_\d+)\x00[\s\S]{0,6}?\x01([\x01-\x40])\x00\x00\x00([a-z0-9_]+)\x00[\s\S]{0,6}?\x01([\x01-\x40])\x00\x00\x00([a-z0-9_]+)/.exec(head);
  if (map) info.map = map[4];
  info.players = [];
  const fold = buf.indexOf(Buffer.from('FOLDINFO'));
  if (fold < 0) return info;
  const region = buf.subarray(fold, Math.min(buf.length, fold + 30000));
  const text = region.toString('latin1');
  const re = /\x01([\x01-\x40])\x00\x00\x00((?:[\s\S][\s\S]){1,64}?)[\s\S]{0,24}?\x01([\x02-\x30])\x00\x00\x00([a-z_]{2,48})\x00\x00\x22\x00\x7f\x00\x00\x00/g;
  let match;
  while ((match = re.exec(text))) {
    const nameLen = match[1].charCodeAt(0);
    const civLen = match[3].charCodeAt(0);
    if (match[4].length !== civLen) continue;
    const name = region.subarray(match.index + 5, match.index + 5 + nameLen * 2).toString('utf16le');
    const player = { name, civ: match[4] };
    const after = match.index + match[0].length;
    const seg = region.subarray(after, Math.min(region.length, after + 700)).toString('latin1');
    const steam = /((?:[0-9]\x00){17})/.exec(seg);
    if (steam) {
      const steamAt = after + steam.index;
      player.steamId = region.subarray(steamAt, steamAt + 34).toString('utf16le');
      const pidAt = steamAt - 13;
      if (pidAt > 0) player.profileId = Number(region.readBigInt64LE(pidAt));
    }
    info.players.push(player);
    re.lastIndex = match.index + match[0].length;
  }
  return info;
}

function parseStats(buf) {
  const players = [];
  const tag = Buffer.from('DATASTPD');
  let at = -1;
  while ((at = buf.indexOf(tag, at + 1)) >= 0) {
    const version = buf.readUInt32LE(at + 8);
    const size = buf.readUInt32LE(at + 12);
    const nameLen = buf.readUInt32LE(at + 16);
    const data = at + 20 + nameLen;
    const chunk = buf.subarray(data, Math.min(buf.length, data + size));
    const player = { version };
    try {
      const n = chunk.readUInt32LE(4);
      if (n > 0 && n < 64) player.name = chunk.subarray(8, 8 + n * 2).toString('utf16le').replace(/\0+$/, '');
      const elimAt = 8 + n * 2;
      player.eliminatedAtSec = chunk.readInt32LE(elimAt + 8);
    } catch (e) { /* 這一段格式不合就略過細節 */ }
    const text = chunk.toString('latin1');
    const civ = /\x01([\x02-\x30])\x00\x00\x00([a-z_]{2,48})\x00\x00\x22\x00\x7f\x00\x00\x00([\s\S]{8})/.exec(text);
    if (civ) {
      player.civ = civ[2];
      player.profileId = Number(Buffer.from(civ[3], 'latin1').readBigInt64LE(0));
    }
    players.push(player);
  }
  let durationSec = null;
  if (buf.length > 97) durationSec = buf.readUInt32LE(93);
  return { players, durationSec };
}

function isMe(player) {
  if (!player) return false;
  if (player.profileId === ME.profileId) return true;
  if (player.steamId === ME.steamId) return true;
  return ME.names.includes(player.name);
}

function resultFromElim(sec) {
  if (sec == null || sec === '') return 'unknown';
  return sec === -1 ? 'win' : 'loss';
}

function loadOnlineKinds() {
  const file = path.join(ROOT, 'aoe4-games.json');
  const kinds = new Map();
  if (!fs.existsSync(file)) return kinds;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const game of doc.games || []) {
    kinds.set(game.game_id, game.leaderboard || game.kind || '');
  }
  return kinds;
}

// 官方 API 的最近 30 場（自訂對局，matchtype 0）：
// - 開始／結束時間與每位玩家勝負記在 data/relic-cache/index.json（場次掉出最近 30 場後仍保留）
// - 遊戲 network 資料夾沒有這場的檔案時，下載重播到 data/relic-cache/M_<id>_<hash>.gz。
//   統計檔（逐時數據）放在不公開的雲端儲存，下載不到，所以這些場次沒有逐時數據。
// 回傳 Map(gameId → { startedAt, durationSec, results: { profileId: 'win'|'loss' } })
async function fetchRelicMatches(gameDir) {
  fs.mkdirSync(RELIC_DIR, { recursive: true });
  const index = fs.existsSync(RELIC_INDEX) ? JSON.parse(fs.readFileSync(RELIC_INDEX, 'utf8')) : {};
  const stats = { listed: 0, downloaded: 0, failed: 0 };
  if (!process.argv.includes('--offline')) {
    try {
      const res = await get(RELIC_HISTORY + encodeURIComponent(JSON.stringify([ME.profileId])));
      if (res.status !== 200) throw new Error('HTTP ' + res.status);
      const doc = JSON.parse(res.body.toString('utf8'));
      // 已經有重播檔的場次不用再下載（遊戲常只快取統計檔，這時仍下載重播來取得地圖）
      const have = new Set();
      for (const [key, files] of matchFileGroups([path.join(gameDir, 'network'), RELIC_DIR])) {
        if (key[0] !== 'M') continue;
        const hasReplay = files.some((f) => {
          try { return zlib.gunzipSync(fs.readFileSync(f)).subarray(4, 11).toString('latin1') === 'AOE4_RE'; } catch (e) { return false; }
        });
        if (hasReplay) have.add(key.slice(1));
      }
      for (const m of doc.matchHistoryStats || []) {
        if (m.matchtype_id !== 0) continue;
        if (!(m.matchhistorymember || []).some((x) => x.profile_id === ME.profileId)) continue;
        stats.listed++;
        const results = {};
        for (const r of m.matchhistoryreportresults || []) results[r.profile_id] = r.resulttype === 1 ? 'win' : r.resulttype === 0 ? 'loss' : 'unknown';
        index[m.id] = { start: m.startgametime, end: m.completiontime, results };
        if (have.has(String(m.id))) continue;
        // 檔名沿用遊戲快取的格式，之後若遊戲也快取了同一個檔，會被視為同一份
        const own = (m.matchurls || []).find((u) => u.profile_id === ME.profileId && u.datatype === 0 && u.url);
        const hash = own ? (/_([0-9a-fA-F]+)\.gz$/.exec(own.url) || [])[1] : null;
        const file = path.join(RELIC_DIR, 'M_' + m.id + '_' + (hash || '0') + '.gz');
        try {
          const r = await get('https://api.ageofempires.com/api/GameStats/AgeIV/GetMatchReplay/?gameId=' + m.id + '&profileId=' + ME.profileId + '&matchId=' + m.id);
          if (r.status !== 200 || r.body.length < 1000) throw new Error('HTTP ' + r.status);
          const buf = unpackReplay(r.body);
          if (buf.subarray(4, 11).toString('latin1') !== 'AOE4_RE') throw new Error('不是重播檔');
          fs.writeFileSync(file, zlib.gzipSync(buf));
          if (m.completiontime) fs.utimesSync(file, m.completiontime, m.completiontime);
          stats.downloaded++;
        } catch (e) {
          stats.failed++;
          console.error('下載第 ' + m.id + ' 場重播失敗：' + e.message);
        }
        await new Promise((r) => setTimeout(r, 1100));
      }
      fs.writeFileSync(RELIC_INDEX, JSON.stringify(index, null, 1) + '\n');
    } catch (e) {
      stats.error = e.message;
      console.error('官方 API 讀取失敗，只用本機資料：' + e.message);
    }
  }
  const info = new Map();
  for (const [id, v] of Object.entries(index)) {
    if (!v || !v.start) continue;
    info.set(Number(id), {
      startedAt: new Date(v.start * 1000).toISOString(),
      durationSec: v.end > v.start ? v.end - v.start : null,
      results: v.results || {},
    });
  }
  return { info, stats };
}

// 官方重播回應是 gzip，偶爾是只有一個檔案的 ZIP
function unpackReplay(raw) {
  if (raw[0] === 0x1f && raw[1] === 0x8b) return zlib.gunzipSync(raw);
  if (raw[0] === 0x50 && raw[1] === 0x4b) {
    const method = raw.readUInt16LE(8), csize = raw.readUInt32LE(18), nlen = raw.readUInt16LE(26), xlen = raw.readUInt16LE(28);
    const start = 30 + nlen + xlen;
    const body = raw.subarray(start, csize ? start + csize : undefined);
    return method === 8 ? zlib.inflateRawSync(body) : body;
  }
  return raw;
}

function scanNetwork(gameDir, online, relicInfo) {
  const groups = matchFileGroups([path.join(gameDir, 'network'), RELIC_DIR]);
  const matches = [];
  for (const files of groups.values()) {
    const idMatch = /^([MS])_(\d+)_/.exec(path.basename(files[0]));
    const kind = idMatch[1];
    const id = Number(idMatch[2]);
    const onlineKind = online.get(id) || null;
    if (kind === 'M' && onlineKind && onlineKind !== 'custom') continue;
    let replay = null;
    let stats = null;
    let mtime = '';
    for (const full of files) {
      const st = fs.statSync(full);
      if (!mtime || st.mtime.toISOString() > mtime) mtime = st.mtime.toISOString();
      let buf;
      try { buf = zlib.gunzipSync(fs.readFileSync(full)); } catch (e) { continue; }
      if (buf.subarray(4, 11).toString('latin1') === 'AOE4_RE') replay = parseReplay(buf);
      else if (buf.indexOf(Buffer.from('StatLoggingInternal')) >= 0 && buf.indexOf(Buffer.from('StatLoggingInternal')) < 120) stats = parseStats(buf);
    }
    // 官方 API 的資料（只有線上自訂對局有）：開始時間比重播檔頭和快取時間準；沒有統計檔時用它的勝負與長度
    const relic = kind === 'M' ? relicInfo.get(id) : null;
    const players = (stats && stats.players.length ? stats.players : (replay && replay.players) || []).map((p) => {
      const profileId = p.profileId || (isMe(p) ? ME.profileId : null);
      let result = resultFromElim(p.eliminatedAtSec);
      if (result === 'unknown' && relic && profileId && relic.results[profileId]) result = relic.results[profileId];
      return { name: p.name || null, civ: p.civ || null, profileId, result };
    });
    if (!players.some(isMe) && !(replay && replay.players.some(isMe))) continue;
    const me = players.find(isMe) || {};
    matches.push({
      id: (kind === 'S' ? 'S' : 'M') + id,
      gameId: id,
      source: kind === 'S' ? 'network-skirmish' : (onlineKind === 'custom' ? 'network-custom' : 'network-local-only'),
      mode: kind === 'S' ? 'skirmish' : 'custom',
      startedAtLocal: (replay && replay.startedAtLocal) || null,
      ...(relic ? { startedAt: relic.startedAt } : {}),
      cachedAt: mtime,
      map: (replay && replay.map) || null,
      durationSec: (stats && stats.durationSec) || (relic && relic.durationSec) || null,
      civ: me.civ || null,
      result: me.result || 'unknown',
      players,
    });
  }
  return matches;
}

function scanMatchHistory(gameDir) {
  const dir = path.join(gameDir, 'matchhistory');
  if (!fs.existsSync(dir)) return [];
  const matches = [];
  for (const folder of fs.readdirSync(dir)) {
    const file = path.join(dir, folder, 'match_history.jsn');
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8').replace(/\u0000+$/, '');
    let doc;
    try { doc = JSON.parse(text); } catch (e) { continue; }
    const reports = doc.matchHistoryReportResults || [];
    const mine = reports.find((r) => r.profileID === ME.profileId) || reports[0] || {};
    const resultType = mine.resultType;
    matches.push({
      id: 'H' + String(doc.matchHistoryID || folder),
      gameId: doc.matchHistoryID || folder,
      source: 'matchhistory',
      mode: 'skirmish',
      startedAtLocal: null,
      cachedAt: fs.statSync(file).mtime.toISOString(),
      map: doc.mapName || null,
      durationSec: Number.isFinite(doc.completionTime) && Number.isFinite(doc.startGameTime) && doc.startGameTime > 1000000000
        ? doc.completionTime - doc.startGameTime : null,
      civ: null,
      result: resultType === 1 ? 'win' : resultType === 0 ? 'loss' : 'unknown',
      players: reports.map((r) => ({
        name: null,
        civ: null,
        profileId: r.profileID || null,
        result: r.resultType === 1 ? 'win' : r.resultType === 0 ? 'loss' : 'unknown',
      })),
    });
  }
  return matches;
}

function parseLocalStamp(text, fallbackIso) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(上午|下午)\s+(\d{1,2}):(\d{2})/.exec(text || '');
  if (!m) return fallbackIso || null;
  let hour = Number(m[5]);
  if (m[4] === '下午' && hour < 12) hour += 12;
  if (m[4] === '上午' && hour === 12) hour = 0;
  const pad = (n) => String(n).padStart(2, '0');
  return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]) + 'T' + pad(hour) + ':' + m[6] + ':00+08:00';
}

function prettyMap(name) {
  if (!name || name.includes(' ')) return name || null;
  return name.split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function toDashboardMatch(local) {
  const meId = ME.profileId;
  const players = (local.players || []).map((p, i) => {
    const mine = p.profileId === meId || ME.names.includes(p.name);
    return {
      id: p.profileId || null,
      name: p.name || (mine ? ME.names[0] : '電腦'),
      civ: p.civ || null,
      team: mine ? 0 : 1,
      side: mine ? 'me' : 'opp',
      result: p.result || null,
      rating: null,
      ratingChange: null,
      slot: i,
    };
  });
  const me = players.find((p) => p.side === 'me') || {};
  players.forEach((p) => delete p.slot);
  const id = local.source === 'network-skirmish' ? 'S' + local.gameId
    : local.source === 'matchhistory' ? 'H' + local.gameId
      : local.gameId;
  return {
    id,
    startedAt: local.startedAt || parseLocalStamp(local.startedAtLocal, local.cachedAt),
    duration: local.durationSec || null,
    map: prettyMap(local.map),
    mode: local.mode === 'skirmish' ? 'skirmish' : 'custom',
    server: null,
    patch: null,
    state: 'local',
    averageRating: null,
    result: me.result || local.result || 'unknown',
    civ: me.civ || local.civ || null,
    rating: null,
    ratingChange: null,
    players,
    detail: null,
  };
}

function sameLocalGame(a, b) {
  if (!a.cachedAt || !b.cachedAt || prettyMap(a.map) !== prettyMap(b.map)) return false;
  return Math.abs(Date.parse(a.cachedAt) - Date.parse(b.cachedAt)) < 3 * 60 * 60 * 1000;
}

const readDashboard = () => dashboardData.readDashboard(ROOT);
const writeDashboard = (data) => dashboardData.writeDashboard(ROOT, data);

function mergeDashboard(localMatches, gameDir) {
  const data = readDashboard();
  const ids = new Set(data.matches.map((m) => m.id));
  const skirmish = localMatches.filter((m) => m.source === 'network-skirmish');
  const byId = new Map(data.matches.map((m) => [m.id, m]));
  let added = 0;
  let updated = 0;
  for (const local of localMatches) {
    if (local.source === 'network-custom' && ids.has(local.gameId)) continue;
    if (local.source === 'matchhistory' && skirmish.some((s) => sameLocalGame(s, local))) continue;
    const match = toDashboardMatch(local);
    if (ids.has(match.id)) {
      // 之前資料不全的場次：有官方開始時間後改正日期；後來補到重播時補上地圖
      const old = byId.get(match.id);
      if (!old || old.state !== 'local') continue;
      let changed = false;
      if (local.startedAt && old.startedAt !== match.startedAt) { old.startedAt = match.startedAt; changed = true; }
      if (!old.map && match.map) { old.map = match.map; changed = true; }
      if (changed) updated++;
      continue;
    }
    data.matches.push(match);
    ids.add(match.id);
    added++;
  }
  data.matches.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const details = attachLocalDetails(data, gameDir, ME.profileId, [RELIC_DIR]);
  if (added === 0 && updated === 0 && details.filled === 0) return { added: 0, updated: 0, total: data.matches.length, details };
  data.generatedAt = new Date().toISOString();
  data.source = 'aoe4world.com + local';
  writeDashboard(data);
  return { added, updated, total: data.matches.length, details };
}

function save(matches, gameDir) {
  matches.sort((a, b) => String(a.cachedAt).localeCompare(String(b.cachedAt)) || String(a.id).localeCompare(String(b.id)));
  const doc = {
    profileId: ME.profileId,
    extractedAt: new Date().toISOString(),
    gameDir,
    counts: {
      total: matches.length,
      skirmish: matches.filter((m) => m.source === 'network-skirmish').length,
      custom: matches.filter((m) => m.source === 'network-custom').length,
      localOnly: matches.filter((m) => m.source === 'network-local-only').length,
      matchhistory: matches.filter((m) => m.source === 'matchhistory').length,
    },
    matches,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const next = JSON.stringify(doc, null, 2) + '\n';
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const stamp = /"extractedAt": "[^"]*"/;
  const changed = next.replace(stamp, '"extractedAt": ""') !== prev.replace(stamp, '"extractedAt": ""');
  if (changed) fs.writeFileSync(OUT, next);
  return { changed, counts: doc.counts };
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function pushIfPossible() {
  if (process.argv.includes('--no-push')) return '已略過上傳（--no-push）。';
  let inside = true;
  try { git(['rev-parse', '--is-inside-work-tree']); } catch (e) { inside = false; }
  if (!inside) return '資料已存好。這個資料夾還沒有 git 倉庫，所以沒有上傳。';
  let remote = '';
  try { remote = git(['remote', 'get-url', 'origin']); } catch (e) { remote = ''; }
  if (!remote) return '資料已存好。還沒有 GitHub 遠端，所以沒有上傳。';
  git(['add', '-f', '--', 'data/local-custom-matches.json', 'dashboard/data/aoe4-data.js', 'dashboard/data/aoe4-data.json']);
  const staged = git(['diff', '--cached', '--name-only']);
  if (!staged) return '本機紀錄沒有新變化，不需要上傳。';
  git(['commit', '-m', '更新本機自訂對局紀錄']);
  git(['push', 'origin', 'HEAD']);
  return '已推上 GitHub。';
}

async function main() {
  const gameDir = findGameDir();
  const online = loadOnlineKinds();
  const relic = await fetchRelicMatches(gameDir);
  const matches = scanNetwork(gameDir, online, relic.info).concat(scanMatchHistory(gameDir));
  const saved = save(matches, gameDir);
  const dashboard = mergeDashboard(matches, gameDir);
  const upload = pushIfPossible();
  console.log(JSON.stringify({ out: OUT, changed: saved.changed, counts: saved.counts, relic: relic.stats, dashboard, upload }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
