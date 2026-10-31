// 從本機 Age of Empires IV 資料夾讀出自訂／對電腦對局，寫入 data/local-custom-matches.json。
// 若這個資料夾已是 git 倉庫且有 origin，會提交並推上 GitHub。
// 用法：node sync-local-matches.js
//       node sync-local-matches.js --no-push
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'data', 'local-custom-matches.json');
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

function scanNetwork(gameDir, online) {
  const dir = path.join(gameDir, 'network');
  if (!fs.existsSync(dir)) return [];
  const groups = new Map();
  for (const name of fs.readdirSync(dir)) {
    const id = /^([MS])_(\d+)_[0-9a-fA-F]+\.gz$/.exec(name);
    if (!id) continue;
    const key = id[1] + id[2];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(name);
  }
  const matches = [];
  for (const names of groups.values()) {
    const idMatch = /^([MS])_(\d+)_/.exec(names[0]);
    const kind = idMatch[1];
    const id = Number(idMatch[2]);
    const onlineKind = online.get(id) || null;
    if (kind === 'M' && onlineKind && onlineKind !== 'custom') continue;
    let replay = null;
    let stats = null;
    let mtime = '';
    for (const name of names) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (!mtime || st.mtime.toISOString() > mtime) mtime = st.mtime.toISOString();
      let buf;
      try { buf = zlib.gunzipSync(fs.readFileSync(full)); } catch (e) { continue; }
      if (buf.subarray(4, 11).toString('latin1') === 'AOE4_RE') replay = parseReplay(buf);
      else if (buf.indexOf(Buffer.from('StatLoggingInternal')) >= 0 && buf.indexOf(Buffer.from('StatLoggingInternal')) < 120) stats = parseStats(buf);
    }
    const players = (stats && stats.players.length ? stats.players : (replay && replay.players) || []).map((p) => ({
      name: p.name || null,
      civ: p.civ || null,
      profileId: p.profileId || null,
      result: resultFromElim(p.eliminatedAtSec),
    }));
    if (!players.some(isMe) && !(replay && replay.players.some(isMe))) continue;
    const me = players.find(isMe) || {};
    matches.push({
      id: (kind === 'S' ? 'S' : 'M') + id,
      gameId: id,
      source: kind === 'S' ? 'network-skirmish' : (onlineKind === 'custom' ? 'network-custom' : 'network-local-only'),
      mode: kind === 'S' ? 'skirmish' : 'custom',
      startedAtLocal: (replay && replay.startedAtLocal) || null,
      cachedAt: mtime,
      map: (replay && replay.map) || null,
      durationSec: (stats && stats.durationSec) || null,
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
  const changed = next !== prev;
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
  git(['add', '--', 'data/local-custom-matches.json']);
  const staged = git(['diff', '--cached', '--name-only']);
  if (!staged) return '本機紀錄沒有新變化，不需要上傳。';
  git(['commit', '-m', '更新本機自訂對局紀錄']);
  git(['push', 'origin', 'HEAD']);
  return '已推上 GitHub。';
}

const gameDir = findGameDir();
const online = loadOnlineKinds();
const matches = scanNetwork(gameDir, online).concat(scanMatchHistory(gameDir));
const saved = save(matches, gameDir);
const upload = pushIfPossible();
console.log(JSON.stringify({ out: OUT, changed: saved.changed, counts: saved.counts, upload }, null, 2));
