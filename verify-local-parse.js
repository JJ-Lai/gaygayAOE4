// 比對本機對局檔的兩套解析：Node 版（lib/*.js、sync-local-matches.js，開機同步用）和
// 瀏覽器版（dashboard/js/local-stats.js，儀表板「讀取本機資料夾」用），兩邊輸出必須逐欄相同。
// 用法：node verify-local-parse.js                     找本機的 AoE4 資料夾
//       node verify-local-parse.js <資料夾> [<資料夾>…]  例如 samples/replays-api-examples
// 資料夾裡的 .gz（network 檔）、.rec、stats.rgs 都會被檢查。
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { parseStatsBuffer } = require('./lib/stats-parse');
const { detailFromParsed } = require('./lib/local-detail');
const Local = require('./dashboard/js/local-stats.js');

// sync-local-matches.js 執行時就會開始同步，不能 require；只取出檔頭解析的兩個函式來比對
function syncFunctions() {
  const src = fs.readFileSync(path.join(__dirname, 'sync-local-matches.js'), 'utf8');
  const grab = (name) => {
    const at = src.indexOf('function ' + name + '(');
    if (at < 0) throw new Error('sync-local-matches.js 裡找不到 ' + name);
    let depth = 0, i = src.indexOf('{', at);
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
    return src.slice(at, i + 1);
  };
  const code = [grab('readU16Str'), grab('parseReplay'), grab('parseStats')].join('\n') + '\nreturn { parseReplay, parseStats };';
  return new Function('Buffer', code)(Buffer);
}

function defaultDirs() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return [
    path.join(home, 'OneDrive', '文件', 'My Games', 'Age of Empires IV'),
    path.join(home, 'OneDrive', 'Documents', 'My Games', 'Age of Empires IV'),
    path.join(home, 'Documents', 'My Games', 'Age of Empires IV'),
  ].filter((d) => fs.existsSync(d));
}

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(gz|rec|rgs)$/i.test(name)) out.push(full);
  }
  return out;
}

const norm = (v) => JSON.stringify(v, (k, x) => (x && x.type === 'Buffer' && Array.isArray(x.data) ? x.data : x));
function firstDiff(a, b, p) {
  if (norm(a) === norm(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], p + '.' + k); if (d) return d; }
  }
  return p + '：Node ' + String(norm(a)).slice(0, 80) + ' ／ 網頁 ' + String(norm(b)).slice(0, 80);
}

function main() {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : defaultDirs();
  if (!dirs.length) { console.error('找不到 AoE4 資料夾，請指定要檢查的資料夾。'); process.exit(2); }
  const sync = syncFunctions();
  const stats = { files: 0, stats: 0, replays: 0, same: 0, diff: 0, skipped: 0 };
  const problems = [];
  const check = (file, what, a, b) => {
    const d = firstDiff(a, b, what);
    if (d) { stats.diff++; problems.push(path.basename(file) + ' ' + d); } else stats.same++;
  };
  for (const dir of dirs) {
    for (const file of walk(dir, [])) {
      stats.files++;
      let buf = fs.readFileSync(file);
      if (buf[0] === 0x1f && buf[1] === 0x8b) { try { buf = zlib.gunzipSync(buf); } catch (e) { stats.skipped++; continue; } }
      const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
      if (buf.toString('latin1', 4, 11) === 'AOE4_RE') {
        stats.replays++;
        check(file, '重播檔頭', sync.parseReplay(buf), Local.parseReplayHeader(u8));
      } else if (buf.toString('latin1', 0, 12) === 'Relic Chunky') {
        stats.stats++;
        let a, b;
        try { a = parseStatsBuffer(buf); } catch (e) { a = { threw: e.message }; }
        try { b = Local.parseStatsBuffer(u8); } catch (e) { b = { threw: e.message }; }
        // 錯誤訊息只比「哪個區塊、哪個位置出錯」，Node 的越界訊息多了數值細節，不影響結果
        const errKey = (x) => (x && x.errors ? Object.assign({}, x, { errors: x.errors.map((e) => e.split(':')[0]) }) : x);
        check(file, '統計解析', errKey(a), errKey(b));
        check(file, '快速摘要', sync.parseStats(buf), Local.statsSummary(u8));
        if (!a.threw && !b.threw) {
          const me = (a.players.find((p) => p.STPD) || {}).STPD;
          const pid = me && me.profileId;
          check(file, '單場 detail', detailFromParsed(a, null, pid), Local.detailFromParsed(b, null, pid));
        }
      } else stats.skipped++;
    }
  }
  console.log(JSON.stringify(stats, null, 2));
  problems.slice(0, 30).forEach((p) => console.log('不同：' + p));
  process.exit(stats.diff ? 1 : 0);
}

main();
