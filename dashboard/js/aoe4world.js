// 從 AoE4 World（公開 API）與官方戰績網站（重播檔）讀任何玩家的對局，轉成儀表板的資料格式（見 資料格式.md）。
// 瀏覽器直接呼叫（兩邊都允許跨來源請求）；Node 測試時也能 require 這個檔案（需要 Node 18 以上的 fetch）。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rec-parse.js'));
  else root.AOE4World = factory(root.AOE4RecParse);
})(typeof self !== 'undefined' ? self : this, function (Rec) {
  'use strict';

  const API = 'https://aoe4world.com/api/v0';
  const SITE = 'https://aoe4world.com';
  const REPLAY = 'https://api.ageofempires.com/api/GameStats/AgeIV/GetMatchReplay/';
  const PAGE_SIZE = 50;
  const MAX_PAGES = 20;            // 最多 1000 場（最近的）
  const NON_ARMY = /villager|fishing|trade|trader|merchant|scout|monk|imam|prelate|scholar|shaman|dervish|priest|transport|sheep|cattle|pilgrim/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const round = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v) : 0);

  class HttpError extends Error {
    constructor(status, url) { super('HTTP ' + status); this.status = status; this.url = url; }
  }

  async function getJson(url, signal) {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new HttpError(res.status, url);
    return res.json();
  }

  // ---------- 玩家 ----------
  async function searchPlayers(query, signal) {
    const q = String(query || '').trim();
    if (!q) return [];
    if (/^\d{3,}$/.test(q)) {
      try { const p = await getJson(API + '/players/' + q, signal); return [playerCard(p)]; }
      catch (e) { if (!(e instanceof HttpError) || e.status !== 404) throw e; }
    }
    const res = await getJson(API + '/players/search?query=' + encodeURIComponent(q), signal);
    return (res.players || []).map(playerCard);
  }

  function playerCard(p) {
    const boards = p.leaderboards || p.modes || {};
    const best = Object.keys(boards)
      .filter((k) => boards[k] && typeof boards[k].rating === 'number')
      .map((k) => ({ mode: k, rating: boards[k].rating, games: boards[k].games_count || 0 }))
      .sort((a, b) => b.games - a.games);
    return { id: p.profile_id, name: p.name, country: p.country || null, avatar: (p.avatars && p.avatars.small) || null, lastGameAt: p.last_game_at || null, boards: best };
  }

  async function fetchPlayer(profileId, signal) {
    const p = await getJson(API + '/players/' + profileId, signal);
    const ratings = {};
    for (const [k, v] of Object.entries(p.modes || {})) {
      if (!v || typeof v.rating !== 'number') continue;
      ratings[k] = {
        rating: v.rating, maxRating: v.max_rating == null ? null : v.max_rating, rank: v.rank == null ? null : v.rank,
        games: v.games_count || 0, wins: v.wins_count || 0, losses: v.losses_count || 0,
        winRate: v.win_rate == null ? null : v.win_rate, streak: v.streak == null ? null : v.streak,
      };
    }
    return { id: p.profile_id, name: p.name, country: p.country || null, ratings };
  }

  // ---------- 對局清單 ----------
  function toMatch(g, profileId) {
    const teams = (g.teams || []).map((t) => t.map((x) => x.player || x));
    const myTeam = teams.findIndex((t) => t.some((p) => p.profile_id === profileId));
    const players = [];
    teams.forEach((t, ti) => t.forEach((p) => {
      players.push({
        id: p.profile_id, name: p.name, civ: p.civilization, team: ti,
        side: p.profile_id === profileId ? 'me' : ti === myTeam ? 'ally' : 'opp',
        result: p.result || null, rating: p.rating == null ? null : p.rating, ratingChange: p.rating_diff == null ? null : p.rating_diff,
      });
    }));
    const me = players.find((p) => p.side === 'me') || {};
    return {
      id: g.game_id, startedAt: g.started_at, duration: g.duration, map: g.map, mode: g.leaderboard || g.kind,
      server: g.server || null, patch: g.patch || null, state: g.state || null, averageRating: g.average_rating == null ? null : g.average_rating,
      result: me.result === 'win' || me.result === 'loss' ? me.result : 'unknown', civ: me.civ || null,
      rating: me.rating == null ? null : me.rating, ratingChange: me.ratingChange == null ? null : me.ratingChange,
      players, detail: null,
    };
  }

  // known：已經有的對局 id；翻頁時遇到全部都已知的一頁就停（增量更新）
  async function fetchMatches(profileId, opts) {
    const o = opts || {};
    const known = o.known || new Set();
    const out = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await getJson(API + '/players/' + profileId + '/games?limit=' + PAGE_SIZE + '&page=' + page, o.signal);
      const games = (res.games || []).filter((g) => !g.ongoing);
      const fresh = games.filter((g) => !known.has(g.game_id));
      fresh.forEach((g) => out.push(toMatch(g, profileId)));
      if (o.onProgress) o.onProgress({ page, loaded: out.length, total: res.total_count });
      if (!res.next_page || (known.size && fresh.length < games.length)) break;
      await sleep(250);
    }
    return out;
  }

  // ---------- 單場摘要 → detail ----------
  // 摘要網址不允許其他網站直接呼叫（沒有 CORS），網頁上改走同網域的轉接（aoe4-frontend/worker/index.js）；
  // Node 測試時直接打 AoE4 World。
  const config = {
    summaryUrl: typeof window !== 'undefined'
      ? (profileId, gameId) => '/proxy/summary/' + profileId + '/' + gameId
      : (profileId, gameId) => SITE + '/players/' + profileId + '/games/' + gameId + '/summary?camelize=true',
  };
  async function fetchSummary(profileId, gameId, signal) {
    try { return await getJson(config.summaryUrl(profileId, gameId), signal); }
    catch (e) { if (e instanceof HttpError && e.status === 404) return null; throw e; }
  }

  function aliveAt(times, born, died) {
    const b = born.slice().sort((x, y) => x - y);
    const d = died.slice().sort((x, y) => x - y);
    const le = (arr, t) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; } return lo; };
    return times.map((t) => Math.max(0, le(b, t) - le(d, t)));
  }

  const iconName = (icon) => String(icon || '').split('/').pop();

  // events：[秒, pbgid, 代碼]，代碼 0 = 完成（單位、科技）、1 = 建築蓋好、2 = 被摧毀（只收成本表裡有的項目）
  function eventsFromBuildOrder(buildOrder, items) {
    const out = [];
    for (const item of buildOrder || []) {
      if (!items[item.pbgid]) continue;
      [['finished', 0], ['constructed', 1], ['destroyed', 2]].forEach(([key, code]) => {
        for (const t of item[key] || []) if (typeof t === 'number' && t >= 0) out.push([Math.round(t), item.pbgid, code]);
      });
    }
    out.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    return out;
  }

  function summaryPlayer(sp, match, catalog) {
    const known = ((match && match.players) || []).find((p) => p.id === sp.profileId) || {};
    const r = sp.resources || {};
    const T = (r.timestamps || []).map(round);
    const col = (k) => (Array.isArray(r[k]) ? r[k].map(round) : null);
    const s = sp._stats || {};
    const bo = sp.buildOrder || [];
    const units = bo.filter((b) => b.type === 'Unit');
    const vill = units.filter((b) => /villager/i.test(iconName(b.icon)));
    const army = units.filter((b) => !NON_ARMY.test(iconName(b.icon)));
    const flat = (list, key) => [].concat(...list.map((b) => b[key] || []));
    const act = sp.actions || {};
    const first = (k) => (Array.isArray(act[k]) && act[k].length ? round(act[k][0]) : null);
    const hasGathered = Array.isArray(r.foodGathered) && r.foodGathered.length === T.length;
    const integrate = (rates) => { if (!rates) return null; let acc = 0; return T.map((t, i) => { if (i) acc += ((rates[i] || 0) + (rates[i - 1] || 0)) / 2 * (t - T[i - 1]) / 60; return Math.round(acc); }); };
    const rate = { food: col('foodPerMin'), wood: col('woodPerMin'), gold: col('goldPerMin'), stone: col('stonePerMin'), oliveoil: col('oliveoilPerMin') };
    const gathered = (k) => (hasGathered ? col(k + 'Gathered') : integrate(rate[k]));
    const tg = sp.totalResourcesGathered || {}, ts = sp.totalResourcesSpent || {};
    return {
      id: sp.profileId, name: sp.name, civ: sp.civilization, team: sp.team,
      side: known.side || 'opp', result: sp.result || known.result || 'unknown', apm: sp.apm || null,
      scores: { total: round((sp.scores || {}).total), military: round((sp.scores || {}).military), economy: round((sp.scores || {}).economy), technology: round((sp.scores || {}).technology), society: round((sp.scores || {}).society) },
      gathered: { food: round(tg.food), gold: round(tg.gold), stone: round(tg.stone), wood: round(tg.wood), oliveoil: round(tg.oliveoil), total: round(tg.total) },
      spent: { food: round(ts.food), gold: round(ts.gold), stone: round(ts.stone), wood: round(ts.wood), oliveoil: round(ts.oliveoil), total: round(ts.total) },
      stats: {
        kills: s.ekills || 0, deaths: s.edeaths || 0, squadsKilled: s.sqkill || 0, squadsLost: s.sqlost || 0, squadsMade: s.sqprod || 0,
        unitsMade: s.unitprod || 0, buildingsMade: s.bprod || 0, buildingsLost: s.blost || 0, structureDamage: s.structdmg || 0,
        upgrades: s.upg || 0, idlePeriods: s.inactperiod || 0, commands: s.totalcmds || 0,
        holySitesCaptured: s.pcap || 0, holySitesRecaptured: s.precap || 0,
      },
      ages: { feudal: first('feudalAge'), castle: first('castleAge'), imperial: first('imperialAge') },
      landmarks: (((sp.analysis || {}).landmarks) || []).filter((l) => l.newAge != null).map((l) => ({ t: round(l.gameTime), age: l.newAge, name: l.name })),
      relics: (act.monkStatetreeDepositRelic || []).length,
      villagersMade: flat(vill, 'finished').length,
      villagersLost: flat(vill, 'destroyed').length,
      upgradesDone: bo.filter((b) => b.type === 'Upgrade').reduce((n, b) => n + (b.finished || []).length, 0),
      gatheredEstimated: !hasGathered,
      timeline: {
        t: T,
        villagers: aliveAt(T, flat(vill, 'finished'), flat(vill, 'destroyed')),
        army: aliveAt(T, flat(army, 'finished'), flat(army, 'destroyed')),
        food: col('food'), wood: col('wood'), gold: col('gold'), stone: col('stone'), oliveoil: col('oliveoil'),
        foodRate: rate.food, woodRate: rate.wood, goldRate: rate.gold, stoneRate: rate.stone, oliveoilRate: rate.oliveoil,
        foodGathered: gathered('food'), woodGathered: gathered('wood'), goldGathered: gathered('gold'), stoneGathered: gathered('stone'),
        oliveoilGathered: Array.isArray(r.oliveoil) ? gathered('oliveoil') : null,
        score: col('total'), military: col('military'), economy: col('economy'), technology: col('technology'), society: col('society'),
      },
      events: catalog ? eventsFromBuildOrder(bo, catalog.items) : undefined,
    };
  }

  function detailFromSummary(summary, match, catalog) {
    if (!summary || !Array.isArray(summary.players)) return null;
    const players = summary.players.map((sp) => summaryPlayer(sp, match, catalog));
    if (!players.some((p) => p.side === 'me')) return null;
    return { winReason: summary.winReason || null, mapBiome: summary.mapBiome || null, mapSize: summary.mapSize || null, players };
  }

  // ---------- 重播檔 → 生產指令 ----------
  async function inflate(raw, format) {
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unpack(raw) {
    if (raw[0] === 0x1f && raw[1] === 0x8b) return inflate(raw, 'gzip');
    if (raw[0] === 0x50 && raw[1] === 0x4b) {
      // ZIP：只有一個檔案，讀本地檔頭後的壓縮內容
      const u16 = (o) => raw[o] | (raw[o + 1] << 8);
      const u32 = (o) => (raw[o] | (raw[o + 1] << 8) | (raw[o + 2] << 16)) + raw[o + 3] * 0x1000000;
      const method = u16(8), csize = u32(18), start = 30 + u16(26) + u16(28);
      const body = raw.subarray(start, csize ? start + csize : undefined);
      return method === 8 ? inflate(body, 'deflate-raw') : body;
    }
    return raw;
  }

  // 回傳解析好的重播，沒有（玩家沒開分享、重播過期）時回傳 null
  async function fetchReplay(profileId, gameId, signal) {
    const url = REPLAY + '?gameId=' + gameId + '&profileId=' + profileId + '&matchId=' + gameId;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const raw = new Uint8Array(await res.arrayBuffer());
    if (raw.length < 1000) return null;
    const buf = await unpack(raw);
    return Rec.parseRec(buf);
  }

  const ORDERS_VERSION = 2;
  function attachOrders(detail, rec) {
    const used = new Set();
    let any = false;
    for (const p of detail.players) {
      const rp = Rec.replayPlayerFor(rec, p, used);
      if (!rp) continue;
      used.add(rp);
      p.orders = Rec.ordersFor(rec, rp.pid);
      any = true;
    }
    if (any) { detail.replayBuild = rec.build; detail.ordersVersion = ORDERS_VERSION; }
    return any;
  }

  // 一場的完整 detail：摘要（逐時數據、建造事件）＋重播（生產指令）
  async function fetchDetail(profileId, match, catalog, signal) {
    const summary = await fetchSummary(profileId, match.id, signal);
    const detail = detailFromSummary(summary, match, catalog);
    if (!detail) return { detail: null, replay: false };
    let replay = false;
    try {
      const rec = await fetchReplay(profileId, match.id, signal);
      if (rec) replay = attachOrders(detail, rec);
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
    }
    return { detail, replay };
  }

  // 只用到的成本表項目放進資料（和 enrich-summaries.js 一樣）
  function compactCatalog(matches, catalog) {
    const used = {};
    for (const m of matches) for (const p of (m.detail && m.detail.players) || []) {
      for (const e of p.events || []) if (catalog.items[e[1]]) used[e[1]] = catalog.items[e[1]];
      for (const o of p.orders || []) if (o[1] && catalog.items[o[1]]) used[o[1]] = catalog.items[o[1]];
    }
    return used;
  }

  return { config, searchPlayers, fetchPlayer, fetchMatches, fetchSummary, detailFromSummary, fetchReplay, attachOrders, fetchDetail, compactCatalog, toMatch, HttpError };
});
