// 解析 AoE4 重播檔（.rec）的指令流：只有玩家下的指令，沒有遊戲狀態。
// 格式參考 aoe4world/replays-api docs/replayData.bt 與 BigManJohn000/aoe4-replay-viewer tools/recfile.py（build 11308 驗證）。
//
//   u16 ?, u16 build, char[8] "AOE4_REP", wchar[32] 日期
//   Relic Chunky 標頭 + FOLDPOST、Relic Chunky 標頭 + DATASDSC、FOLDINFO（遊戲設定、玩家）
//   紀錄流：u32 種類；0 = 遊戲 tick，1 = 聊天
//     tick：u32 大小, u8 版本, u32 tick, u32 校驗碼, u32 區塊數, 區塊（u32 主機, u32 ?, u32 大小, 內容）
//     區塊內容是一串指令，每個指令以自己的 u16 長度開頭：
//       u16 長度, u8 指令種類, u8 玩家序號（| 0x80 = 按住 Shift 排入）, u32 序號, …, u32 @20 玩家（1000 + 玩家 id）,
//       @24 接收者清單, 之後 u8 資料種類, u8 資料長度（0x80 時後面再跟 u8 長度）, 資料
//   每秒 8 個 tick。
'use strict';
const zlib = require('zlib');

const TICKS_PER_SECOND = 8;
const CHUNKY_HEADER = 24;
const ENTITY_ID_BASE = 1000005000;

const CMD = {
  0x03: 'train',            // CMD_BuildSquad：一個指令訓練一隻
  0x05: 'cancel',           // CMD_CancelProduction：取消生產佇列
  0x10: 'research',         // CMD_Upgrade：在建築裡研究
  0x38: 'cancelBuild',      // CMD_CancelConstruction
  0x7b: 'build',            // PCMD_PlaceAndConstructEntities：放置建築（一整排城牆是一個指令）
  0x82: 'playerUpgrade',    // PCMD_Upgrade
};

function node(b, o) {
  const typ = b.toString('ascii', o, o + 4);
  const id = b.toString('ascii', o + 4, o + 8);
  const ver = b.readUInt32LE(o + 8), length = b.readUInt32LE(o + 12), nameLen = b.readUInt32LE(o + 16);
  const start = o + 20 + nameLen;
  return { typ, id, start, end: start + length, ver };
}

function parsePlayers(b, start, end) {
  const count = b.readUInt32LE(start + 10);
  const players = [];
  let o = start + 14;
  while (players.length < count && o < end - 16) {
    const human = b[o];
    if (human === 0 || human === 1) {
      const n = b.readUInt32LE(o + 1);
      if (n >= 1 && n <= 64) {
        const p = o + 5 + 2 * n;
        if (p + 13 <= end) {
          const team = b.readUInt32LE(p), pid = b.readUInt32LE(p + 4), cl = b.readUInt32LE(p + 9);
          const civ = b.subarray(p + 13, p + 13 + cl);
          if (team < 16 && cl >= 3 && cl <= 40 && [...civ].every((c) => c >= 48 && c < 123) && !civ.toString('latin1').startsWith('map_')) {
            players.push({ slot: players.length, name: b.toString('utf16le', o + 5, p), civ: civ.toString('latin1'), team, human: !!human, pid });
            o = p + 13 + cl;
            continue;
          }
        }
      }
    }
    o++;
  }
  return players;
}

// 接收者清單：每個是 (種類, 序號)，種類 0 = 玩家、1 = 建築或單位實體、2 = 小隊
function receivers(c) {
  const o = 24;
  const ids = [];
  if (c[o] === 0x80) { for (let i = 0; i < c[o + 1]; i++) ids.push(c.readUInt32LE(o + 2 + 4 * i)); }
  else if (c[o] & 0x40) { for (let i = 0; i < (c[o] & 0x3f); i++) ids.push(c.readUInt32LE(o + 1 + 4 * i)); }
  else ids.push(c.readUInt32BE(o));
  return ids.map((i) => ({ kind: i >>> 28, index: i & 0x0fffffff }));
}

function commandData(c) {
  let o = 24;
  if (c[o] === 0x80) o += 2 + 4 * c[o + 1];
  else if (c[o] & 0x40) o += 1 + 4 * (c[o] & 0x3f);
  else o += 4;
  if (o >= c.length) return { type: null, data: Buffer.alloc(0), offset: o };
  const type = c[o];
  if (type === 0xff) return { type, data: Buffer.alloc(0), offset: o };
  let n = c[o + 1], p = o + 2;
  if (n === 0x80) { n = c[p]; p += 1; }
  return { type, data: c.subarray(p, p + n), offset: p };
}

function* blockCommands(payload) {
  let p = 0;
  while (p + 2 <= payload.length) {
    const n = payload.readUInt16LE(p);
    if (n < 2) break;
    yield payload.subarray(p, p + n);
    p += n;
  }
}

function parseRec(input, { keepRaw = false } = {}) {
  let b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
  if (b.toString('latin1', 4, 11) !== 'AOE4_RE') throw new Error('不是 AoE4 重播檔');
  const build = b.readUInt16LE(2);
  const date = b.toString('utf16le', 12, 76).split('\u0000')[0];
  let o = 76 + CHUNKY_HEADER;
  o = node(b, o).end;                 // FOLDPOST
  o += CHUNKY_HEADER;
  o = node(b, o).end;                 // DATASDSC
  const info = node(b, o);
  if (info.typ + info.id !== 'FOLDINFO') throw new Error('找不到 FOLDINFO（位置 ' + o + '）');
  let players = [];
  for (let p = info.start; p < info.end;) {
    const ch = node(b, p);
    if (ch.typ + ch.id === 'DATADATA') players = parsePlayers(b, ch.start, ch.end);
    p = ch.end;
  }

  const commands = [];
  let lastTick = 0;
  o = info.end;
  while (o + 4 <= b.length) {
    const kind = b.readUInt32LE(o); o += 4;
    if (kind === 0) {
      const size = b.readUInt32LE(o); o += 4;
      const end = o + size;
      const tick = b.readUInt32LE(o + 1), nblk = b.readUInt32LE(o + 9);
      let p = o + 13;
      for (let k = 0; k < nblk; k++) {
        const bsz = b.readUInt32LE(p + 8);
        p += 12;
        const payload = b.subarray(p, p + bsz);
        p += bsz;
        for (const c of blockCommands(payload)) {
          if (c.length < 26) continue;
          const type = CMD[c[2]];
          if (!type) continue;
          const d = commandData(c);
          const recv = receivers(c);
          const cmd = { tick, t: tick / TICKS_PER_SECOND, type, slot: c[3] & 0x7f, queued: !!(c[3] & 0x80), pid: c.length >= 24 ? c.readUInt32LE(20) - 1000 : null, recv, dataType: d.type };
          if ((type === 'train' || type === 'research' || type === 'build' || type === 'playerUpgrade') && d.data.length >= 5) cmd.pbgid = d.data.readUInt32LE(1);
          if (type === 'train' || type === 'research' || type === 'cancel') {
            const r = recv.find((x) => x.kind === 1);
            if (r) cmd.entity = r.index + ENTITY_ID_BASE;
          }
          // 取消指令的資料是建築內的項目序號：每棟建築的訓練／研究指令依序從 1 編號
          if (type === 'cancel' && d.data.length >= 4) cmd.cancelId = d.data.readUInt32LE(0);
          if (type === 'build' && d.data.length >= 17) cmd.pos = [d.data.readFloatLE(5), d.data.readFloatLE(13)];
          if (keepRaw) { cmd.raw = Buffer.from(c); cmd.data = Buffer.from(d.data); }
          commands.push(cmd);
        }
      }
      o = end;
      lastTick = tick;
    } else if (kind === 1) {
      const size = b.readUInt32LE(o);
      o += 4 + size;
    } else {
      throw new Error('未知的紀錄種類 ' + kind + '（位置 ' + (o - 4) + '）');
    }
  }
  return { build, date, players, duration: lastTick / TICKS_PER_SECOND, commands };
}

module.exports = { parseRec, TICKS_PER_SECOND, ENTITY_ID_BASE };
