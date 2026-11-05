// 讀本機 AoE4 資料夾（我的文件\My Games\Age of Empires IV）裡的對局檔，轉成儀表板的資料格式。
//   network/M_對局ID_xxxx.gz、S_對局ID_xxxx.gz：同一場會有重播（AOE4_REP）和統計（Relic Chunky StatLoggingInternal）
//   matchhistory/資料夾/match_history.jsn、stats.rgs：離線對電腦
// 這裡是 lib/chunky.js、lib/stats-parse.js、lib/local-detail.js 與 sync-local-matches.js 掃描部分的瀏覽器版
// （輸入改成 Uint8Array，不依賴 Buffer、fs、zlib）。輸出和 Node 版逐欄相同，用 verify-local-parse.js 比對。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AOE4LocalStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------- 位元組小工具 ----------------
  const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const latin1 = (b, s, e) => { let r = ''; const end = Math.min(e, b.length); for (let i = s; i < end; i += 8192) r += String.fromCharCode.apply(null, b.subarray(i, Math.min(end, i + 8192))); return r; };
  const utf16 = (b, s, e) => { let r = ''; const end = Math.min(e, b.length); for (let i = s; i + 1 < end; i += 2) r += String.fromCharCode(b[i] | (b[i + 1] << 8)); return r; };
  const hex = (b) => Array.prototype.map.call(b, (x) => (x < 16 ? '0' : '') + x.toString(16)).join('');
  function indexOf(b, needle, from) {
    const n = typeof needle === 'string' ? Array.from(needle, (c) => c.charCodeAt(0)) : needle;
    outer: for (let i = from || 0; i <= b.length - n.length; i++) {
      for (let j = 0; j < n.length; j++) if (b[i + j] !== n[j]) continue outer;
      return i;
    }
    return -1;
  }

  // ---------------- Relic Chunky（lib/chunky.js） ----------------
  const MAGIC = 'Relic Chunky\r\n\x1a\0';
  const isMagic = (b, off) => off + 16 <= b.length && latin1(b, off, off + 16) === MAGIC;

  function parseChunks(buf, off, end, depth, out) {
    const v = dv(buf);
    while (off + 20 <= end) {
      const type = latin1(buf, off, off + 4);
      if (type !== 'FOLD' && type !== 'DATA') {
        if (isMagic(buf, off)) {
          out.push({ depth, off, kind: 'HEADER', fileVersion: v.getUint32(off + 16, true), platform: v.getUint32(off + 20, true) });
          off += 24; continue;
        }
        out.push({ depth, off, kind: 'STOP', reason: 'unknown tag ' + JSON.stringify(type) });
        return off;
      }
      const id = latin1(buf, off + 4, off + 8);
      const ver = v.getUint32(off + 8, true);
      const size = v.getUint32(off + 12, true);
      const nameLen = v.getUint32(off + 16, true);
      const name = latin1(buf, off + 20, off + 20 + nameLen).replace(/\0+$/, '');
      const dataOff = off + 20 + nameLen;
      const node = { depth, off, kind: type, id, ver, size, name, dataOff, dataEnd: dataOff + size };
      out.push(node);
      if (type === 'FOLD') parseChunks(buf, dataOff, dataOff + size, depth + 1, out);
      off = dataOff + size;
    }
    return off;
  }

  function parseFile(buf, start) {
    const out = [];
    const off = start || 0;
    if (!isMagic(buf, off)) throw new Error('no Relic Chunky magic at ' + off);
    const v = dv(buf);
    out.push({ depth: 0, off, kind: 'HEADER', fileVersion: v.getUint32(off + 16, true), platform: v.getUint32(off + 20, true) });
    const endOff = parseChunks(buf, off + 24, buf.length, 0, out);
    return { chunks: out, endOff };
  }

  // ---------------- 統計檔（lib/stats-parse.js） ----------------
  class R {
    constructor(buf, off, end) { this.b = buf; this.v = dv(buf); this.o = off; this.end = end; }
    chk(n) { if (this.o + n > this.b.length) throw new RangeError('The value of "offset" is out of range.'); }
    u8() { this.chk(1); const x = this.v.getUint8(this.o); this.o += 1; return x; }
    i16() { this.chk(2); const x = this.v.getInt16(this.o, true); this.o += 2; return x; }
    i32() { this.chk(4); const x = this.v.getInt32(this.o, true); this.o += 4; return x; }
    f32() { this.chk(4); const x = this.v.getFloat32(this.o, true); this.o += 4; return Math.round(x * 1000) / 1000; }
    str() { const n = this.i32(); if (n < 0 || n > 100000) throw new Error('bad str len ' + n + ' @' + (this.o - 4)); const s = latin1(this.b, this.o, this.o + n); this.o += n; return s.replace(/\0+$/, ''); }
    ustr() { const n = this.i32(); if (n < 0 || n > 100000) throw new Error('bad ustr len ' + n + ' @' + (this.o - 4)); const s = utf16(this.b, this.o, this.o + 2 * n); this.o += 2 * n; return s.replace(/\0+$/, ''); }
    bytes(n) { const s = this.b.subarray(this.o, this.o + n); this.o += n; return s; }
    peek32() { this.chk(4); return this.v.getInt32(this.o, true); }
    dict() { const n = this.i32(); if (n < 0 || n > 64) throw new Error('bad dict len ' + n + ' @' + (this.o - 4)); const d = {}; for (let i = 0; i < n; i++) { const k = this.str(); d[k] = this.f32(); } return d; }
    rem() { return this.end - this.o; }
  }

  function nz(d) { const o = {}; for (const [k, v] of Object.entries(d)) if (v) o[k] = v; return o; }

  function parseSTLS(r) {
    const h = { unknown1: r.u8(), unknown2: r.i32(), unknown3: r.i32(), gameLengthSec: r.i32(), unknown5: r.i32() };
    const created = [];
    const cc = r.i32();
    for (let i = 0; i < cc; i++) {
      const e = { t: r.f32(), player: r.i32(), entityId: r.i32() };
      r.u8(); e.type = r.str(); r.i16(); e.cat = r.i16();
      e.items1 = nz(r.dict()); e.items2 = nz(r.dict()); e.x = r.f32(); e.y = r.f32();
      created.push(e);
    }
    const lost = [];
    const lc = r.i32();
    for (let i = 0; i < lc; i++) {
      const e = { t: r.f32(), targetPlayer: r.i32(), targetEntityId: r.i32() };
      r.u8(); e.targetType = r.str(); r.i16(); r.i16();
      e.attackerPlayer = r.i32(); e.attackerEntityId = r.i32();
      const hasAttacker = r.u8(); e.attackerType = r.str();
      if (hasAttacker) { r.i16(); r.i16(); e.weapon = r.str(); }
      e.tx = r.f32(); e.ty = r.f32(); e.ax = r.f32(); e.ay = r.f32();
      lost.push(e);
    }
    h.trailing = r.i32();
    return { header: h, created, lost };
  }

  function parseSTPD(r, ver) {
    const p = { version: ver };
    p.playerId = r.i32(); p.name = r.ustr(); p.outcome = r.i32(); p.unknown3 = r.i32(); p.eliminatedAt = r.i32();
    if (ver >= 2033) p.unknown4 = r.i32();
    const a = []; for (let i = 0; i < 24; i++) a.push(r.i32());
    p.unitsProduced = a[2]; p.unitsProducedInfantry = a[4]; p.unitsProducedInfantryResources = a[5]; p.largestArmy = a[12]; p.ints1 = a;
    p.unknownItems1 = nz(r.dict());
    const b = []; for (let i = 0; i < 12; i++) b.push(r.i32());
    p.buildingsLost = b[0]; p.unitsLost = b[2]; p.unitsLostResources = b[3]; p.techResearched = b[10]; p.ints2 = b;
    p.unknownItems2a = nz(r.dict()); p.spentResourcesForUpgrades = nz(r.dict()); p.unknownItems2c = nz(r.dict()); p.unknownItems2d = nz(r.dict());
    const c = []; for (let i = 0; i < 11; i++) c.push(r.i32());
    p.unitsKilled = c[0]; p.unitsKilledResources = c[1]; p.buildingsRazed = c[4]; p.ints3 = c;
    p.totalResourcesGathered = nz(r.dict()); p.totalResourcesSpent = nz(r.dict());
    p.unknownItems3b = nz(r.dict()); p.unknownItems3c = nz(r.dict()); p.unknownItems3d = nz(r.dict()); p.unknownItems3e = nz(r.dict());
    const d = []; for (let i = 0; i < 18; i++) d.push(r.i32());
    p.sacredCaptured = d[6]; p.sacredLost = d[7]; p.sacredNeutralized = d[8]; p.ints4 = d;
    p.unknownItems4 = nz(r.dict());
    p.unknown12 = [r.i32(), r.i32(), r.i32(), r.i32()];
    p.unknown13 = r.u8();
    p.civ = r.str();
    p.unknown14a = r.i32(); p.unknown14b = r.i32(); p.profileId = r.i32(); p.unknown14d = r.i32();
    const rc = r.i32();
    p.resourceTimeline = [];
    for (let i = 0; i < rc; i++) {
      const e = { t: r.i32() };
      e.current = r.dict();
      const dicts = [];
      while (r.peek32() >= 8 && r.peek32() <= 32) dicts.push(r.dict());
      if (dicts.length === 3) { e.cumulative = dicts[0]; e.perMinute = dicts[1]; e.units = dicts[2]; }
      else if (dicts.length === 2) { e.perMinute = dicts[0]; e.units = dicts[1]; }
      else e.dicts = dicts;
      e.unknown1 = r.i32();
      p.resourceTimeline.push(e);
    }
    const sc = r.i32();
    p.scoreTimeline = [];
    for (let i = 0; i < sc; i++) p.scoreTimeline.push({ t: r.i32(), economy: r.f32(), military: r.f32(), society: r.f32(), technology: r.f32(), total: r.f32() });
    const u15 = r.i32(); p.unknown15 = [];
    for (let i = 0; i < u15; i++) p.unknown15.push(ver >= 2034 ? [r.i32(), r.i32(), r.i32(), r.i32()] : [r.i32(), r.i32(), r.i32()]);
    p.unknown16 = [r.i32(), r.i32(), r.i32(), r.i32()];
    const uc = r.i32();
    p.unitTimeline = [];
    for (let i = 0; i < uc; i++) {
      const e = {};
      const idType = r.u8();
      if (idType === 1) e.pbgid = r.i32(); else if (idType === 2) e.modid = hex(r.bytes(20));
      r.i16(); r.i16();
      e.t = r.i32(); e.icon = r.str(); e.label = r.ustr(); e.u4 = r.ustr(); e.res = nz(r.dict()); e.u5 = r.ustr(); e.kind = r.i32();
      p.unitTimeline.push(e);
    }
    const u17 = r.i32(); p.unknown17 = []; for (let i = 0; i < u17; i++) p.unknown17.push([r.i32(), r.i32(), r.i32(), r.f32()]);
    const tail = {};
    tail.u18_23 = [r.i32(), r.i32(), r.i32(), r.i32(), r.i32(), r.i32(), r.i32(), r.i32()];
    tail.relicsCaptured = r.f32(); tail.unknown25 = r.f32();
    tail.u26 = [r.i32(), r.i32(), r.i32(), r.i32(), r.i32(), r.i32()];
    tail.u27a = r.u8(); tail.u27b = r.f32(); if (ver >= 2034) tail.u27c = r.i32();
    tail.u28 = [r.i32(), r.f32(), r.i32(), r.f32(), r.f32(), r.i32(), r.f32()];
    tail.u29 = [r.i32(), r.i32(), r.i32(), r.i32(), r.i32(), r.i32(), r.i32(), r.i32()];
    tail.age2AvailableMs = r.i32(); tail.age3AvailableMs = r.i32(); tail.age4AvailableMs = r.i32();
    tail.u29lm = [r.i32(), r.i32()];
    tail.u30 = [r.i32(), r.f32(), r.i32(), r.f32()];
    if (ver >= 2030) tail.playerColor = r.i32();
    if (ver >= 2033) tail.u31_33 = [r.i32(), r.i32(), r.i32()];
    if (ver >= 2034) { tail.u34_49 = []; for (let i = 0; i < 16; i++) tail.u34_49.push(r.f32()); }
    p.tail = tail;
    p.bytesRemaining = r.rem();
    return p;
  }

  function parseSTLU(r) {
    const e = { pbgid: r.i32(), cost: nz(r.dict()) };
    e.produced = r.i32(); e.u3 = r.i32(); e.lost = r.i32(); e.remaining = r.i32(); e.present = r.i32();
    const rest = []; for (let i = 0; i < 12; i++) rest.push(r.i32()); e.rest = rest;
    const gc = r.i32(); e.groups = [];
    for (let i = 0; i < gc; i++) { r.u8(); const g = { type: r.str() }; r.i16(); r.i16(); g.a = r.i32(); g.b = r.i32(); e.groups.push(g); }
    for (let i = 0; i < 12; i++) r.i32();
    e.total = r.i32();
    const ec = r.i32(); e.entries = []; for (let i = 0; i < ec; i++) e.entries.push([r.i32(), r.i32()]);
    e.bytesRemaining = r.rem();
    return e;
  }
  function parseSTLB(r) { r.u8(); const e = { type: r.str() }; r.i16(); r.i16(); e.damageDealt = r.f32(); e.created = r.i32(); e.destroyed = r.i32(); e.bytesRemaining = r.rem(); return e; }
  function parseSTLP(r) {
    const e = { unknown1: r.u8(), command: r.str() }; r.i16(); e.category = r.i16(); e.amount = r.i32(); e.firstUse = r.i32();
    const dc = r.i32(); e.uses = []; for (let i = 0; i < dc; i++) e.uses.push({ x: r.f32(), y: r.f32(), t: r.i32() });
    e.bytesRemaining = r.rem(); return e;
  }

  function parseStatsBuffer(buf) {
    const { chunks } = parseFile(buf, 0);
    const res = { rootVersion: null, stls: null, players: [] };
    let cur = null;
    const errors = [];
    for (const c of chunks) {
      if (c.kind === 'FOLD' && c.id === 'STLI') res.rootVersion = c.ver;
      if (c.kind === 'FOLD' && c.id === 'STLP') { cur = { STLU: [], STLB: [], STLP: [], other: {} }; res.players.push(cur); }
      if (c.kind !== 'DATA') continue;
      const r = new R(buf, c.dataOff, c.dataEnd);
      try {
        switch (c.id) {
          case 'STLS': res.stls = parseSTLS(r, c.ver); res.stls.bytesRemaining = r.rem(); break;
          case 'STPD': cur.STPD = parseSTPD(r, c.ver); break;
          case 'STLU': cur.STLU.push(parseSTLU(r, c.ver)); break;
          case 'STLB': cur.STLB.push(parseSTLB(r)); break;
          case 'STLP': cur.STLP.push(parseSTLP(r)); break;
          default: cur.other[c.id] = { ver: c.ver, size: c.size };
        }
      } catch (e) { errors.push(`${c.id}@${c.off}: ${e.message}`); }
    }
    res.errors = errors;
    return res;
  }

  // ---------------- 單場 detail（lib/local-detail.js） ----------------
  const NON_ARMY = /villager|fishing|trade|trader|merchant|scout|monk|imam|prelate|scholar|shaman|dervish|priest|transport|sheep|cattle|pilgrim/i;
  const ARMY_CLASSES = ['spear', 'archer', 'horseman', 'knight', 'maa', 'crossbow', 'horsearcher', 'gunner', 'siege', 'springald'];
  const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
  function num(dict, key) { const v = dict && dict[key]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
  function oilKey(sample) {
    if (sample && sample.oliveoil != null) return 'oliveoil';
    if (sample && sample.merc_byz != null) return 'merc_byz';
    return 'oliveoil';
  }
  function resourceValue(dict, key, oil) {
    if (!dict) return 0;
    if (key === 'oliveoil') return num(dict, oil);
    return num(dict, key);
  }
  function integrate(times, rates) {
    let acc = 0;
    return times.map((time, i) => {
      if (i) acc += ((rates[i] || 0) + (rates[i - 1] || 0)) / 2 * (time - times[i - 1]) / 60;
      return Math.round(acc);
    });
  }
  function alignScores(times, scores, key) {
    let i = 0;
    return times.map((t) => {
      while (i + 1 < scores.length && scores[i + 1].t <= t + 0.5) i++;
      if (!scores.length || scores[i].t > t + 0.5) return 0;
      return round(scores[i][key]);
    });
  }
  function aliveAt(times, born, died) {
    const b = born.slice().sort((a, c) => a - c);
    const d = died.slice().sort((a, c) => a - c);
    const countLE = (arr, t) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; } return lo; };
    return times.map((t) => Math.max(0, countLE(b, t) - countLE(d, t)));
  }
  function stlsPlayerId(playerId, stls) {
    const ids = new Set(((stls && stls.created) || []).map((e) => e.player));
    if (ids.has(playerId)) return playerId;
    if (ids.has(playerId + 1000)) return playerId + 1000;
    return playerId;
  }
  function eventsFor(stls, playerId) {
    const empty = { bornV: [], diedV: [], bornA: [], diedA: [] };
    if (!stls) return empty;
    const id = stlsPlayerId(playerId, stls);
    const vill = (type) => /villager/i.test(type || '');
    const army = (type) => type && /unit_/i.test(type) && !NON_ARMY.test(type);
    const bornV = [], diedV = [], bornA = [], diedA = [];
    for (const e of stls.created || []) {
      if (e.player !== id) continue;
      if (vill(e.type)) bornV.push(e.t);
      else if (army(e.type)) bornA.push(e.t);
    }
    for (const e of stls.lost || []) {
      if (e.targetPlayer !== id) continue;
      if (vill(e.targetType)) diedV.push(e.t);
      else if (army(e.targetType)) diedA.push(e.t);
    }
    if (!bornV.some((t) => t <= 1)) for (let i = 0; i < 6; i++) bornV.push(0);
    return { bornV, diedV, bornA, diedA };
  }
  function ageSeconds(unitTimeline, eliminatedAt) {
    const ages = { feudal: null, castle: null, imperial: null };
    const name = { 2: 'feudal', 3: 'castle', 4: 'imperial' };
    for (const u of unitTimeline || []) {
      const m = /age_display_persistent_([234])/.exec(u.icon || '');
      if (!m) continue;
      const t = round(u.t);
      if (eliminatedAt >= 0 && t >= eliminatedAt - 3) continue;
      const key = name[m[1]];
      if (ages[key] == null || t < ages[key]) ages[key] = t;
    }
    return ages;
  }
  function armyClass(type) {
    if (!type || type.indexOf('unit_') !== 0) return null;
    if (/villager|fishing|trade|trader|merchant|scout|monk|imam|prelate|scholar|shaman|dervish|priest|sheep|cattle|transport/.test(type)) return null;
    if (/springald|culverin/.test(type)) return 'springald';
    if (/mangonel|trebuchet|bombard|ribauld|cannon|nest_of_bees/.test(type)) return 'siege';
    if (/handcannon|streltsy|janissary|militia_gunner/.test(type)) return 'gunner';
    if (/horsearcher|horse_archer|mangudai/.test(type)) return 'horsearcher';
    if (/crossbow/.test(type)) return 'crossbow';
    if (/knight|lancer|cataphract|riddari|keshik|sofa/.test(type)) return 'knight';
    if (/horseman|sipahi|raider|camel_rider/.test(type)) return 'horseman';
    if (/manatarms|palace_guard|varangian|ghulam|musofadi|landsknecht/.test(type)) return 'maa';
    if (/spearman|atgeir|donso|limitanei/.test(type)) return 'spear';
    if (/archer|longbow|bogmadr|zhuge|yumi/.test(type)) return 'archer';
    if (/militia/.test(type)) return 'maa';
    return null;
  }
  function baseUnit(type) {
    const m = /^unit_([a-z0-9_]+?)_\d+(?:_cw)?(?:_[a-z0-9_]+)?$/.exec(type || '');
    return m ? m[1] : null;
  }
  function armyProfile(stls, playerId, times) {
    const id = stlsPlayerId(playerId, stls);
    const made = {}, lost = {}, born = {}, died = {};
    const note = (bucket, cls, t) => { if (!bucket[cls]) bucket[cls] = []; bucket[cls].push(t); };
    for (const e of (stls && stls.created) || []) {
      if (e.player !== id) continue;
      const cls = armyClass(e.type), base = baseUnit(e.type);
      if (!cls || !base) continue;
      note(born, cls, e.t);
      made[base] = (made[base] || 0) + 1;
    }
    for (const e of (stls && stls.lost) || []) {
      if (e.targetPlayer !== id) continue;
      const cls = armyClass(e.targetType), base = baseUnit(e.targetType);
      if (!cls || !base) continue;
      note(died, cls, e.t);
      lost[base] = (lost[base] || 0) + 1;
    }
    const army = { t: times.map(round) };
    for (const cls of ARMY_CLASSES) army[cls] = aliveAt(times, born[cls] || [], died[cls] || []);
    const units = [...new Set(Object.keys(made).concat(Object.keys(lost)))]
      .map((unitId) => ({ id: unitId, made: made[unitId] || 0, lost: lost[unitId] || 0 }))
      .filter((u) => u.made || u.lost)
      .sort((a, b) => b.made - a.made || b.lost - a.lost);
    return { army, units };
  }
  function buildEvents(unitTimeline) {
    const out = [];
    const packedAt = new Map();
    for (const u of unitTimeline || []) {
      if (u.pbgid == null || !u.icon) continue;
      const icon = String(u.icon).replace(/\\/g, '/');
      const building = icon.includes('/buildings/');
      if (!building && !icon.includes('/units/') && !/\/upr?ades\//.test(icon)) continue;
      const t = Math.max(0, round(u.t));
      let code = null;
      if (u.kind === 1 || u.kind === 8 || u.kind === 12) code = 0;
      else if (u.kind === 2 || u.kind === 4) code = 2;
      else if (u.kind === 3) { if (building) packedAt.set(u.pbgid, (packedAt.get(u.pbgid) || 0) + 1); else code = 0; }
      else if (u.kind === 5) {
        const packed = packedAt.get(u.pbgid) || 0;
        if (building && packed > 0) packedAt.set(u.pbgid, packed - 1);
        else code = 1;
      } else if (u.kind === 6 && building) code = 2;
      if (code != null) out.push([t, u.pbgid, code]);
    }
    out.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    return out;
  }
  function sumResources(dict, oil) {
    if (!dict) return 0;
    return round(num(dict, 'food') + num(dict, 'wood') + num(dict, 'gold') + num(dict, 'stone') + resourceValue(dict, 'oliveoil', oil));
  }
  function toPlayer(parsedPlayer, stls, duration, sideInfo) {
    const d = parsedPlayer.STPD;
    const entries = d.resourceTimeline || [];
    if (!entries.length) return null;
    const times = entries.map((e) => e.t);
    const oil = oilKey(entries[0].current);
    const col = (dictName, key) => entries.map((e) => round(resourceValue(e[dictName], key, oil)));
    const rates = { food: col('perMinute', 'food'), wood: col('perMinute', 'wood'), gold: col('perMinute', 'gold'), stone: col('perMinute', 'stone'), oliveoil: col('perMinute', 'oliveoil') };
    const ev = eventsFor(stls, d.playerId);
    const troops = armyProfile(stls, d.playerId, times);
    const last = d.scoreTimeline[d.scoreTimeline.length - 1] || {};
    return {
      id: d.profileId || sideInfo.id || null,
      name: d.name || sideInfo.name || null,
      civ: d.civ || sideInfo.civ || null,
      team: sideInfo.team != null ? sideInfo.team : null,
      side: sideInfo.side,
      result: sideInfo.result || (d.eliminatedAt === -1 ? 'win' : 'loss'),
      apm: null,
      scores: { total: round(last.total), military: round(last.military), economy: round(last.economy), technology: round(last.technology), society: round(last.society) },
      gathered: {
        food: round(num(d.totalResourcesGathered, 'food')), wood: round(num(d.totalResourcesGathered, 'wood')),
        gold: round(num(d.totalResourcesGathered, 'gold')), stone: round(num(d.totalResourcesGathered, 'stone')),
        oliveoil: round(resourceValue(d.totalResourcesGathered, 'oliveoil', oil)), total: sumResources(d.totalResourcesGathered, oil),
      },
      spent: { total: sumResources(d.totalResourcesSpent, oil) },
      stats: { kills: d.unitsKilled || 0, deaths: d.unitsLost || 0, unitsMade: d.unitsProduced || 0, buildingsLost: d.buildingsLost || 0 },
      ages: ageSeconds(d.unitTimeline, d.eliminatedAt),
      villagersMade: ev.bornV.length,
      villagersLost: ev.diedV.length,
      upgradesDone: (d.unitTimeline || []).filter((u) => u.kind === 8 && !/age_display/.test(u.icon || '')).length,
      relics: round(d.tail && d.tail.relicsCaptured),
      gatheredEstimated: true,
      army: troops.army,
      units: troops.units,
      events: buildEvents(d.unitTimeline),
      timeline: {
        t: times.map(round),
        villagers: aliveAt(times, ev.bornV, ev.diedV),
        army: aliveAt(times, ev.bornA, ev.diedA),
        food: col('current', 'food'), wood: col('current', 'wood'), gold: col('current', 'gold'), stone: col('current', 'stone'), oliveoil: col('current', 'oliveoil'),
        foodRate: rates.food, woodRate: rates.wood, goldRate: rates.gold, stoneRate: rates.stone, oliveoilRate: rates.oliveoil,
        foodGathered: integrate(times, rates.food), woodGathered: integrate(times, rates.wood), goldGathered: integrate(times, rates.gold),
        stoneGathered: integrate(times, rates.stone), oliveoilGathered: integrate(times, rates.oliveoil),
        score: alignScores(times, d.scoreTimeline || [], 'total'), military: alignScores(times, d.scoreTimeline || [], 'military'),
        economy: alignScores(times, d.scoreTimeline || [], 'economy'), technology: alignScores(times, d.scoreTimeline || [], 'technology'),
        society: alignScores(times, d.scoreTimeline || [], 'society'),
      },
    };
  }
  function sideFor(d, match, profileId) {
    const known = ((match && match.players) || []).find((p) => p.id && p.id === d.profileId)
      || ((match && match.players) || []).find((p) => p.name && d.name && p.name === d.name)
      || {};
    let side = known.side;
    if (!side) side = d.profileId === profileId ? 'me' : 'opp';
    return { side, id: known.id || d.profileId || null, name: known.name || d.name, civ: known.civ || d.civ, team: known.team, result: known.result };
  }
  function detailFromParsed(res, match, profileId) {
    const duration = (res.stls && res.stls.header && res.stls.header.gameLengthSec) || (match && match.duration) || 0;
    const players = [];
    for (const p of res.players) {
      if (!p.STPD || !p.STPD.name) continue;
      const row = toPlayer(p, res.stls, duration, sideFor(p.STPD, match, profileId));
      if (row) players.push(row);
    }
    if (!players.some((p) => p.side === 'me')) return null;
    return { winReason: null, source: 'local-replay', players };
  }

  // ---------------- 對局清單（sync-local-matches.js 的掃描部分） ----------------
  // 重播檔頭：開始時間（遊戲語言的日期字串）、地圖、玩家（名稱、文明、Steam ID、玩家 ID）
  function parseReplayHeader(buf) {
    const v = dv(buf);
    const info = { build: v.getUint16(2, true), startedAtLocal: utf16(buf, 12, 12 + 80).split('\u0000')[0] };
    const head = latin1(buf, 0, Math.min(buf.length, 8000));
    const map = /\x01?([\x01-\x40])\x00\x00\x00(map_size_\d+)\x00[\s\S]{0,6}?\x01([\x01-\x40])\x00\x00\x00([a-z0-9_]+)\x00[\s\S]{0,6}?\x01([\x01-\x40])\x00\x00\x00([a-z0-9_]+)/.exec(head);
    if (map) info.map = map[4];
    info.players = [];
    const fold = indexOf(buf, 'FOLDINFO');
    if (fold < 0) return info;
    const region = buf.subarray(fold, Math.min(buf.length, fold + 30000));
    const rv = dv(region);
    const text = latin1(region, 0, region.length);
    const re = /\x01([\x01-\x40])\x00\x00\x00((?:[\s\S][\s\S]){1,64}?)[\s\S]{0,24}?\x01([\x02-\x30])\x00\x00\x00([a-z_]{2,48})\x00\x00\x22\x00\x7f\x00\x00\x00/g;
    let match;
    while ((match = re.exec(text))) {
      const nameLen = match[1].charCodeAt(0);
      const civLen = match[3].charCodeAt(0);
      if (match[4].length !== civLen) continue;
      const name = utf16(region, match.index + 5, match.index + 5 + nameLen * 2);
      const player = { name, civ: match[4] };
      const after = match.index + match[0].length;
      const seg = latin1(region, after, Math.min(region.length, after + 700));
      const steam = /((?:[0-9]\x00){17})/.exec(seg);
      if (steam) {
        const steamAt = after + steam.index;
        player.steamId = utf16(region, steamAt, steamAt + 34);
        const pidAt = steamAt - 13;
        if (pidAt > 0) player.profileId = Number(rv.getBigInt64(pidAt, true));
      }
      info.players.push(player);
      re.lastIndex = match.index + match[0].length;
    }
    return info;
  }

  // 統計檔的快速摘要（只要玩家、文明、勝負、長度；完整解析用 parseStatsBuffer）
  function statsSummary(buf) {
    const players = [];
    const v = dv(buf);
    let at = -1;
    while ((at = indexOf(buf, 'DATASTPD', at + 1)) >= 0) {
      const version = v.getUint32(at + 8, true);
      const size = v.getUint32(at + 12, true);
      const nameLen = v.getUint32(at + 16, true);
      const data = at + 20 + nameLen;
      const chunk = buf.subarray(data, Math.min(buf.length, data + size));
      const cv = dv(chunk);
      const player = { version };
      try {
        const n = cv.getUint32(4, true);
        if (n > 0 && n < 64) player.name = utf16(chunk, 8, 8 + n * 2).replace(/\0+$/, '');
        const elimAt = 8 + n * 2;
        player.eliminatedAtSec = cv.getInt32(elimAt + 8, true);
      } catch (e) { /* 這一段格式不合就略過細節 */ }
      const text = latin1(chunk, 0, chunk.length);
      const civ = /\x01([\x02-\x30])\x00\x00\x00([a-z_]{2,48})\x00\x00\x22\x00\x7f\x00\x00\x00([\s\S]{8})/.exec(text);
      if (civ) {
        player.civ = civ[2];
        const off = civ.index + civ[0].length - 8;
        player.profileId = Number(cv.getBigInt64(off, true));
      }
      players.push(player);
    }
    let durationSec = null;
    if (buf.length > 97) durationSec = v.getUint32(93, true);
    return { players, durationSec };
  }

  const resultFromElim = (sec) => (sec == null || sec === '' ? 'unknown' : sec === -1 ? 'win' : 'loss');

  // 重播的日期字串跟著遊戲語言，例如「2026/11/3 下午 9:15」「2026/11/4 18:54」「11/4/2026 3:54 PM」
  // 「06.11.2024 20:07」「04-Nov-26 7:11 AM」。用瀏覽器的當地時間解讀（就是錄下這場的電腦的時間）；讀不懂就用檔案時間。
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function parseLocalStamp(text, fallbackIso) {
    const s = String(text || '').trim();
    const out = (y, mo, d, hh, mi, ampm) => {
      let h = Number(hh);
      if (ampm) {
        const pm = /^(pm|下午|午後)$/i.test(ampm);
        if (pm && h < 12) h += 12;
        if (!pm && h === 12) h = 0;
      }
      let year = Number(y);
      if (year < 100) year += 2000;
      const month = Number(mo), day = Number(d);
      if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31 && h >= 0 && h < 24)) return fallbackIso || null;
      const dt = new Date(year, month - 1, day, h, Number(mi));
      return isNaN(dt) ? fallbackIso || null : dt.toISOString();
    };
    let m;
    // 年在前：2026/11/3 下午 9:15、2026-11-04 18:54、2026.11.4 9:39
    if ((m = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\s+(AM|PM|上午|下午|午前|午後)?\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i.exec(s)))
      return out(m[1], m[2], m[3], m[5], m[6], m[4] || m[7]);
    // 日-英文月-年：04-Nov-26 7:11 AM
    if ((m = /^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ](\d{2,4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i.exec(s)) && MONTHS[m[2].toLowerCase()])
      return out(m[3], MONTHS[m[2].toLowerCase()], m[1], m[4], m[5], m[6]);
    // 日.月.年：06.11.2024 20:07（歐洲）
    if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s+(\d{1,2}):(\d{2})/.exec(s))) return out(m[3], m[2], m[1], m[4], m[5]);
    // 斜線、年在後：預設美式 月/日/年；第一個數字大於 12 時一定是 日/月/年
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i.exec(s))) {
      return Number(m[1]) > 12 ? out(m[3], m[2], m[1], m[4], m[5], m[6]) : out(m[3], m[1], m[2], m[4], m[5], m[6]);
    }
    return fallbackIso || null;
  }

  function prettyMap(name) {
    if (!name || name.includes(' ')) return name || null;
    return name.split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // 找出「我」：本機的每一場都有自己，出現最多次的玩家 ID 就是資料夾主人
  function guessOwner(records) {
    const count = new Map();
    const names = new Map();
    for (const r of records) {
      const seen = new Set();
      for (const p of r.players) {
        if (!p.profileId || p.profileId < 0 || seen.has(p.profileId)) continue;
        seen.add(p.profileId);
        count.set(p.profileId, (count.get(p.profileId) || 0) + 1);
        if (p.name) names.set(p.profileId, p.name);
      }
    }
    let best = null;
    count.forEach((n, id) => { if (!best || n > best.n) best = { id, n }; });
    return best ? { profileId: best.id, name: names.get(best.id) || null, games: best.n } : null;
  }

  // files：[{ path: 'network/M_123_abcd.gz', lastModified: 毫秒, read: async () => Uint8Array }]
  // gunzip：async (Uint8Array) => Uint8Array
  // 回傳 { owner, matches }，matches 已含 detail（讀得到統計檔的場次）
  async function scanFolder(files, opts) {
    const o = opts || {};
    const gunzip = o.gunzip;
    const progress = o.onProgress || (() => {});
    const groups = new Map();
    const hist = new Map();
    for (const f of files) {
      const parts = f.path.replace(/\\/g, '/').split('/');
      const name = parts[parts.length - 1];
      const dir = parts[parts.length - 2] || '';
      const net = /^([MS])_(\d+)_[0-9a-fA-F]+\.gz$/.exec(name);
      if (net && dir === 'network') {
        const key = net[1] + net[2];
        if (!groups.has(key)) groups.set(key, { kind: net[1], id: Number(net[2]), files: [] });
        groups.get(key).files.push(f);
      } else if (parts[parts.length - 3] === 'matchhistory' && (name === 'match_history.jsn' || name === 'stats.rgs')) {
        if (!hist.has(dir)) hist.set(dir, {});
        hist.get(dir)[name === 'stats.rgs' ? 'stats' : 'json'] = f;
      }
    }
    const total = groups.size + hist.size;
    let done = 0;
    const records = [];

    for (const g of groups.values()) {
      let replay = null, statsBuf = null, mtime = 0;
      for (const f of g.files) {
        mtime = Math.max(mtime, f.lastModified || 0);
        let buf;
        try { buf = await gunzip(await f.read()); } catch (e) { continue; }
        if (latin1(buf, 4, 11) === 'AOE4_RE') { try { replay = parseReplayHeader(buf); } catch (e) { /* 略過 */ } }
        else if (latin1(buf, 0, 12) === 'Relic Chunky') {
          const at = indexOf(buf.subarray(0, 140), 'StatLoggingInternal');
          if (at >= 0 && at < 120) statsBuf = buf;
        }
      }
      const summary = statsBuf ? statsSummary(statsBuf) : null;
      const players = (summary && summary.players.length ? summary.players : (replay && replay.players) || []).map((p) => ({
        name: p.name || null, civ: p.civ || null, profileId: p.profileId || null, result: resultFromElim(p.eliminatedAtSec),
      }));
      records.push({ kind: g.kind, gameId: g.id, source: g.kind === 'S' ? 'network-skirmish' : 'network', replay, statsBuf, summary, players, mtime });
      progress(++done, total);
    }

    for (const [folder, h] of hist) {
      let doc = null;
      try { doc = JSON.parse(new TextDecoder().decode(await h.json.read()).replace(/\u0000+$/, '')); } catch (e) { /* 略過 */ }
      const statsBuf = h.stats ? await h.stats.read().catch(() => null) : null;
      const reports = (doc && doc.matchHistoryReportResults) || [];
      records.push({
        kind: 'H', gameId: (doc && doc.matchHistoryID) || folder, source: 'matchhistory', doc, statsBuf,
        players: reports.map((r) => ({ name: null, civ: null, profileId: r.profileID || null, result: r.resultType === 1 ? 'win' : r.resultType === 0 ? 'loss' : 'unknown' })),
        mtime: (h.json && h.json.lastModified) || 0,
      });
      progress(++done, total);
    }

    const owner = o.owner || guessOwner(records);
    const meId = owner && owner.profileId;
    const isMe = (p) => p && ((meId && p.profileId === meId) || (owner && owner.name && p.name === owner.name));
    const matches = [];
    const skirmishTimes = [];
    for (const r of records) {
      if (r.kind === 'H') continue;
      if (!r.players.some(isMe) && !(r.replay && r.replay.players.some(isMe))) continue;
      const iso = r.mtime ? new Date(r.mtime).toISOString() : null;
      const m = buildMatch(r, owner, {
        id: r.kind === 'S' ? 'S' + r.gameId : r.gameId,
        startedAt: parseLocalStamp(r.replay && r.replay.startedAtLocal, iso),
        duration: (r.summary && r.summary.durationSec) || null,
        map: prettyMap(r.replay && r.replay.map),
        mode: r.kind === 'S' ? 'skirmish' : 'custom',
      });
      if (r.kind === 'S') skirmishTimes.push({ map: m.map, t: r.mtime });
      matches.push(m);
    }
    for (const r of records) {
      if (r.kind !== 'H') continue;
      const doc = r.doc || {};
      const map = prettyMap(doc.mapName || null);
      // 同一場離線對電腦會同時出現在 network（S_）和 matchhistory：3 小時內、同地圖視為同一場
      if (skirmishTimes.some((s) => s.map === map && r.mtime && s.t && Math.abs(s.t - r.mtime) < 3 * 3600000)) continue;
      const mine = r.players.find((p) => p.profileId === meId) || r.players[0] || {};
      matches.push(buildMatch(r, owner, {
        id: 'H' + String(r.gameId),
        startedAt: r.mtime ? new Date(r.mtime).toISOString() : null,
        duration: Number.isFinite(doc.completionTime) && Number.isFinite(doc.startGameTime) && doc.startGameTime > 1000000000 ? doc.completionTime - doc.startGameTime : null,
        map,
        mode: 'skirmish',
        result: mine.result,
      }));
    }

    // 統計檔 → 逐時數據（失敗的場次只是沒有 detail）
    for (const m of matches) {
      const r = m._record;
      delete m._record;
      if (!r.statsBuf) continue;
      try {
        const res = parseStatsBuffer(r.statsBuf);
        if (res.errors && res.errors.length) continue;
        m.detail = detailFromParsed(res, m, meId);
      } catch (e) { /* 這場沒有 detail */ }
    }
    matches.sort((a, b) => Date.parse(a.startedAt || 0) - Date.parse(b.startedAt || 0));
    return { owner, matches };
  }

  function buildMatch(r, owner, base) {
    const meId = owner && owner.profileId;
    const players = r.players.map((p) => {
      const mine = (meId && p.profileId === meId) || (owner && owner.name && p.name === owner.name);
      return {
        id: p.profileId || null, name: p.name || (mine ? (owner && owner.name) || '我' : '電腦'), civ: p.civ || null,
        team: mine ? 0 : 1, side: mine ? 'me' : 'opp', result: p.result || null, rating: null, ratingChange: null,
      };
    });
    const me = players.find((p) => p.side === 'me') || {};
    return Object.assign({
      server: null, patch: null, state: 'local', averageRating: null,
      civ: me.civ || null, rating: null, ratingChange: null, players, detail: null, _record: r,
    }, base, { result: me.result || base.result || 'unknown' });
  }

  return { parseFile, parseStatsBuffer, detailFromParsed, buildEvents, parseReplayHeader, statsSummary, parseLocalStamp, guessOwner, scanFolder };
});
