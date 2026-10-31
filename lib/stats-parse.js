// Parse AoE4 stats.rgs (Relic Chunky "StatLoggingInternal") into JSON.
// Field layout follows aoe4world/replays-api docs/replaySummary.bt (010 Editor template), re-implemented here in Node.
// Usage: node stats_parse.js <stats.rgs> <out.json>
const fs = require('fs');
const { parseFile } = require('./chunky');

class R {
  constructor(buf, off, end) { this.b = buf; this.o = off; this.end = end; }
  u8() { const v = this.b.readUInt8(this.o); this.o += 1; return v; }
  i16() { const v = this.b.readInt16LE(this.o); this.o += 2; return v; }
  i32() { const v = this.b.readInt32LE(this.o); this.o += 4; return v; }
  f32() { const v = this.b.readFloatLE(this.o); this.o += 4; return Math.round(v * 1000) / 1000; }
  str() { const n = this.i32(); if (n < 0 || n > 100000) throw new Error('bad str len ' + n + ' @' + (this.o - 4)); const s = this.b.toString('latin1', this.o, this.o + n); this.o += n; return s.replace(/\0+$/, ''); }
  ustr() { const n = this.i32(); if (n < 0 || n > 100000) throw new Error('bad ustr len ' + n + ' @' + (this.o - 4)); const s = this.b.toString('utf16le', this.o, this.o + 2 * n); this.o += 2 * n; return s.replace(/\0+$/, ''); }
  bytes(n) { const s = this.b.subarray(this.o, this.o + n); this.o += n; return s; }
  peek32() { return this.b.readInt32LE(this.o); }
  dict() { const n = this.i32(); if (n < 0 || n > 64) throw new Error('bad dict len ' + n + ' @' + (this.o - 4)); const d = {}; for (let i = 0; i < n; i++) { const k = this.str(); d[k] = this.f32(); } return d; }
  rem() { return this.end - this.o; }
}

function nz(d) { const o = {}; for (const [k, v] of Object.entries(d)) if (v) o[k] = v; return o; }

function parseSTLS(r, ver) {
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
    const hasTarget = r.u8(); e.targetType = r.str(); r.i16(); r.i16();
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
    // observed order (template warning): cumulative, perMinute, units  (older builds: perMinute, units)
    if (dicts.length === 3) { e.cumulative = dicts[0]; e.perMinute = dicts[1]; e.units = dicts[2]; }
    else if (dicts.length === 2) { e.perMinute = dicts[0]; e.units = dicts[1]; }
    else e.dicts = dicts;
    e.unknown1 = r.i32();
    p.resourceTimeline.push(e);
  }
  const sc = r.i32();
  p.scoreTimeline = [];
  for (let i = 0; i < sc; i++) p.scoreTimeline.push({ t: r.i32(), economy: r.f32(), military: r.f32(), society: r.f32(), technology: r.f32(), total: r.f32() });
  // v2034 entries are 4 x int32 (sec, tick, a, b); v2033 entries are 3 x int32 (observed in 2023-2024 files)
  const u15 = r.i32(); p.unknown15 = [];
  for (let i = 0; i < u15; i++) p.unknown15.push(ver >= 2034 ? [r.i32(), r.i32(), r.i32(), r.i32()] : [r.i32(), r.i32(), r.i32()]);
  p.unknown16 = [r.i32(), r.i32(), r.i32(), r.i32()];
  const uc = r.i32();
  p.unitTimeline = [];
  for (let i = 0; i < uc; i++) {
    const e = {};
    const idType = r.u8();
    if (idType === 1) e.pbgid = r.i32(); else if (idType === 2) e.modid = r.bytes(20).toString('hex');
    r.i16(); r.i16();
    e.t = r.i32(); e.icon = r.str(); e.label = r.ustr(); e.u4 = r.ustr(); e.res = nz(r.dict()); e.u5 = r.ustr(); e.kind = r.i32();
    p.unitTimeline.push(e);
  }
  const u17 = r.i32(); p.unknown17 = []; for (let i = 0; i < u17; i++) p.unknown17.push([r.i32(), r.i32(), r.i32(), r.f32()]);
  // fixed tail
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

function parseSTLU(r, ver) {
  const e = { pbgid: r.i32(), cost: nz(r.dict()) };
  e.produced = r.i32(); e.u3 = r.i32(); e.lost = r.i32(); e.remaining = r.i32(); e.present = r.i32();
  const rest = []; for (let i = 0; i < 12; i++) rest.push(r.i32()); e.rest = rest;
  const gc = r.i32(); e.groups = [];
  for (let i = 0; i < gc; i++) { r.u8(); const g = { type: r.str() }; r.i16(); r.i16(); g.a = r.i32(); g.b = r.i32(); e.groups.push(g); }
  const u19 = []; for (let i = 0; i < 12; i++) u19.push(r.i32());
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

function parseStats(file) {
  return parseStatsBuffer(fs.readFileSync(file));
}

module.exports = { parseStats, parseStatsBuffer };

if (require.main === module) {
  const res = parseStats(process.argv[2]);
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(res, null, 1));
  const s = res.stls;
  console.log('root v', res.rootVersion, 'errors', res.errors);
  if (s) console.log('STLS header', JSON.stringify(s.header), 'created', s.created.length, 'lost', s.lost.length, 'rem', s.bytesRemaining);
  for (const p of res.players) {
    const d = p.STPD;
    if (!d) { console.log('player without STPD'); continue; }
    console.log(`player ${d.playerId} name=${JSON.stringify(d.name)} civ=${d.civ} profileId=${d.profileId} outcome=${d.outcome} elimAt=${d.eliminatedAt} color=${d.tail.playerColor} res=${d.resourceTimeline.length} scores=${d.scoreTimeline.length} units=${d.unitTimeline.length} STLU=${p.STLU.length} STLB=${p.STLB.length} STLP=${p.STLP.length} remaining=${d.bytesRemaining}`);
    console.log('   gathered', JSON.stringify(d.totalResourcesGathered), 'spent', JSON.stringify(d.totalResourcesSpent));
    console.log('   unitsProduced', d.unitsProduced, 'unitsLost', d.unitsLost, 'unitsKilled', d.unitsKilled, 'buildingsRazed', d.buildingsRazed, 'tech', d.techResearched, 'largestArmy', d.largestArmy, 'age2/3/4 avail ms', d.tail.age2AvailableMs, d.tail.age3AvailableMs, d.tail.age4AvailableMs);
    const last = d.scoreTimeline[d.scoreTimeline.length - 1];
    console.log('   last score', JSON.stringify(last));
  }
}
