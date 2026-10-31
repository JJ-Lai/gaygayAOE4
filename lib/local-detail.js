// 從本機重播統計（network/*.gz 與 matchhistory/stats.rgs）做出儀表板的 detail。
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { parseStatsBuffer } = require('./stats-parse');

const NON_ARMY = /villager|fishing|trade|trader|merchant|scout|monk|imam|prelate|scholar|shaman|dervish|priest|transport|sheep|cattle|pilgrim/i;
const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);

function num(dict, key) {
  const v = dict && dict[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

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
  const countLE = (arr, t) => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (arr[m] <= t) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
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
  const bornV = [];
  const diedV = [];
  const bornA = [];
  const diedA = [];
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
  if (!bornV.some((t) => t <= 1)) {
    for (let i = 0; i < 6; i++) bornV.push(0);
  }
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
  const rates = {
    food: col('perMinute', 'food'),
    wood: col('perMinute', 'wood'),
    gold: col('perMinute', 'gold'),
    stone: col('perMinute', 'stone'),
    oliveoil: col('perMinute', 'oliveoil'),
  };
  const ev = eventsFor(stls, d.playerId);
  const last = d.scoreTimeline[d.scoreTimeline.length - 1] || {};
  return {
    id: d.profileId || sideInfo.id || null,
    name: d.name || sideInfo.name || null,
    civ: d.civ || sideInfo.civ || null,
    team: sideInfo.team != null ? sideInfo.team : null,
    side: sideInfo.side,
    result: sideInfo.result || (d.eliminatedAt === -1 ? 'win' : 'loss'),
    apm: null,
    scores: {
      total: round(last.total), military: round(last.military), economy: round(last.economy),
      technology: round(last.technology), society: round(last.society),
    },
    gathered: {
      food: round(num(d.totalResourcesGathered, 'food')),
      wood: round(num(d.totalResourcesGathered, 'wood')),
      gold: round(num(d.totalResourcesGathered, 'gold')),
      stone: round(num(d.totalResourcesGathered, 'stone')),
      oliveoil: round(resourceValue(d.totalResourcesGathered, 'oliveoil', oil)),
      total: sumResources(d.totalResourcesGathered, oil),
    },
    spent: { total: sumResources(d.totalResourcesSpent, oil) },
    stats: {
      kills: d.unitsKilled || 0,
      deaths: d.unitsLost || 0,
      unitsMade: d.unitsProduced || 0,
      buildingsLost: d.buildingsLost || 0,
    },
    ages: ageSeconds(d.unitTimeline, d.eliminatedAt),
    villagersMade: ev.bornV.length,
    villagersLost: ev.diedV.length,
    upgradesDone: (d.unitTimeline || []).filter((u) => u.kind === 8 && !/age_display/.test(u.icon || '')).length,
    relics: round(d.tail && d.tail.relicsCaptured),
    gatheredEstimated: true,
    timeline: {
      t: times.map(round),
      villagers: aliveAt(times, ev.bornV, ev.diedV),
      army: aliveAt(times, ev.bornA, ev.diedA),
      food: col('current', 'food'),
      wood: col('current', 'wood'),
      gold: col('current', 'gold'),
      stone: col('current', 'stone'),
      oliveoil: col('current', 'oliveoil'),
      foodRate: rates.food,
      woodRate: rates.wood,
      goldRate: rates.gold,
      stoneRate: rates.stone,
      oliveoilRate: rates.oliveoil,
      foodGathered: integrate(times, rates.food),
      woodGathered: integrate(times, rates.wood),
      goldGathered: integrate(times, rates.gold),
      stoneGathered: integrate(times, rates.stone),
      oliveoilGathered: integrate(times, rates.oliveoil),
      score: alignScores(times, d.scoreTimeline || [], 'total'),
      military: alignScores(times, d.scoreTimeline || [], 'military'),
      economy: alignScores(times, d.scoreTimeline || [], 'economy'),
      technology: alignScores(times, d.scoreTimeline || [], 'technology'),
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
  return {
    side,
    id: known.id || d.profileId || null,
    name: known.name || d.name,
    civ: known.civ || d.civ,
    team: known.team,
    result: known.result,
  };
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

function attachLocalDetails(data, gameDir, profileId) {
  const byId = new Map(data.matches.map((m) => [String(m.id), m]));
  const details = new Map();
  let files = 0;
  let failed = 0;

  const take = (key, buf, match) => {
    files++;
    let res;
    try { res = parseStatsBuffer(buf); } catch (e) { failed++; return; }
    if (res.errors && res.errors.length) { failed++; return; }
    const detail = detailFromParsed(res, match, profileId);
    if (!detail) { failed++; return; }
    details.set(key, detail);
  };

  const net = path.join(gameDir, 'network');
  if (fs.existsSync(net)) {
    const groups = new Map();
    for (const name of fs.readdirSync(net)) {
      const id = /^([MS])_(\d+)_[0-9a-fA-F]+\.gz$/.exec(name);
      if (!id) continue;
      const key = id[1] + id[2];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(path.join(net, name));
    }
    for (const [key, paths] of groups) {
      const kind = key[0];
      const numeric = key.slice(1);
      const match = byId.get(numeric) || byId.get(kind + numeric) || null;
      for (const file of paths) {
        let buf;
        try { buf = zlib.gunzipSync(fs.readFileSync(file)); } catch (e) { continue; }
        if (buf.subarray(0, 12).toString('latin1') !== 'Relic Chunky') continue;
        take(kind === 'S' ? 'S' + numeric : numeric, buf, match);
        break;
      }
    }
  }

  const hist = path.join(gameDir, 'matchhistory');
  if (fs.existsSync(hist)) {
    for (const folder of fs.readdirSync(hist)) {
      const file = path.join(hist, folder, 'stats.rgs');
      if (!fs.existsSync(file)) continue;
      const key = 'H' + folder;
      take(key, fs.readFileSync(file), byId.get(key) || null);
    }
  }

  let filled = 0;
  for (const m of data.matches) {
    if (m.detail) continue;
    const d = details.get(String(m.id));
    if (!d) continue;
    m.detail = d;
    filled++;
  }
  return { filled, files, failed, parsed: details.size };
}

module.exports = { attachLocalDetails, detailFromParsed, parseStatsBuffer };
