// 「看別人的戰績」：用 AoE4 World 搜尋任何玩家，在瀏覽器裡組出儀表板資料（格式同 data/aoe4-data.json）。
//   對局清單一次抓完；單場詳細數據（摘要＋重播檔）在打開那場時、或按「下載最近 N 場」時才抓。
//   全部存在這個瀏覽器的 IndexedDB，下次只抓新的對局。網址 ?player=玩家ID 可以直接分享。
// 依賴 js/aoe4world.js（window.AOE4World）與儀表板主程式的 window.AOE4Dashboard。
(function () {
  'use strict';

  const W = window.AOE4World;
  const Dash = () => window.AOE4Dashboard;
  const $ = (s) => document.querySelector(s);
  const DB_NAME = 'aoe4-dashboard';
  const RECENT_KEY = 'aoe4-recent-players';
  const PAUSE_MS = 1100;           // AoE4 World 的摘要有流量限制，連續下載時每場間隔 1 秒以上
  const RETRY_MISSING_DAYS = 3;    // 沒有摘要的場次，隔幾天再試（剛打完的對局摘要可能還沒產生）
  const BULK_SIZES = [20, 50];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }

  // ---------------- IndexedDB ----------------
  let dbP = null;
  function db() {
    if (!dbP) {
      dbP = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          d.createObjectStore('players');   // key: profileId → { player, matches（不含 detail）, updatedAt }
          d.createObjectStore('details');   // key: 'profileId:gameId' → { detail | null, replay, fetchedAt }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch((e) => { console.warn('IndexedDB 無法使用，資料不會保留', e); return null; });
    }
    return dbP;
  }
  async function idb(store, mode, fn) {
    const d = await db();
    if (!d) return undefined;
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  const idbGet = (store, key) => idb(store, 'readonly', (s) => s.get(key)).catch(() => undefined);
  const idbPut = (store, key, value) => idb(store, 'readwrite', (s) => s.put(value, key)).catch((e) => console.warn('儲存失敗', e));
  async function idbDetails(profileId) {
    const range = IDBKeyRange.bound(profileId + ':', profileId + ':￿');
    const d = await db();
    if (!d) return new Map();
    return new Promise((resolve) => {
      const out = new Map();
      const req = d.transaction('details').objectStore('details').openCursor(range);
      req.onsuccess = () => {
        const c = req.result;
        if (!c) { resolve(out); return; }
        out.set(Number(String(c.key).split(':')[1]), c.value);
        c.continue();
      };
      req.onerror = () => resolve(out);
    });
  }

  // ---------------- 成本表 ----------------
  let catalogP = null;
  function catalog() {
    if (!catalogP) catalogP = fetch('catalog.json').then((r) => { if (!r.ok) throw new Error('成本表 HTTP ' + r.status); return r.json(); })
      .catch((e) => { catalogP = null; throw e; });
    return catalogP;
  }

  // ---------------- 最近看過 ----------------
  function recent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }
  function remember(card) {
    const list = recent().filter((x) => x.id !== card.id);
    list.unshift({ id: card.id, name: card.name, country: card.country || null, avatar: card.avatar || null });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch (e) { /* 空間不足就算了 */ }
  }

  // ---------------- 載入某位玩家 ----------------
  let session = null;   // { profileId, player, matches, store: Map(gameId → 紀錄), catalog, bulk }

  function fromUrl() {
    const v = new URLSearchParams(location.search).get('player');
    return v && /^\d+$/.test(v) ? Number(v) : null;
  }
  function setUrl(profileId) {
    const u = new URL(location.href);
    if (profileId) u.searchParams.set('player', profileId); else u.searchParams.delete('player');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }

  const fmtNum = (n) => Number(n).toLocaleString('zh-TW');
  function detailNote(rec) {
    if (!rec) return null;
    return rec.detail ? null : '這場 AoE4 World 沒有摘要（自訂對局、太舊，或剛打完還在處理）。';
  }

  async function open(profileId, opts) {
    const o = opts || {};
    const dash = Dash();
    if (session && session.bulk) session.bulk.abort();
    dash.banner('正在讀取玩家 ' + profileId + ' 的資料…');
    try {
      const [cached, cat, store] = await Promise.all([idbGet('players', profileId), catalog(), idbDetails(profileId)]);
      let player;
      let matches = (cached && cached.matches) || [];
      const showCached = () => {
        if (!cached || !cached.player) return;
        session = { profileId, player: cached.player, matches, store, catalog: cat, bulk: null };
        render('AoE4 World（離線快取）');
      };
      // 先秀快取，再更新
      if (cached && !o.silent) showCached();
      try {
        player = await W.fetchPlayer(profileId);
        const known = new Set(matches.map((m) => m.id));
        const fresh = await W.fetchMatches(profileId, {
          known,
          onProgress: ({ loaded, total }) => dash.banner('正在向 AoE4 World 讀取 ' + (player.name || profileId) + ' 的對局清單…（' + fmtNum(known.size + loaded) + (total ? ' / ' + fmtNum(total) : '') + ' 場）'),
        });
        if (fresh.length || !cached) {
          const byId = new Map(matches.map((m) => [m.id, m]));
          fresh.forEach((m) => byId.set(m.id, m));
          matches = [...byId.values()];
        }
        await idbPut('players', profileId, { player, matches, updatedAt: new Date().toISOString() });
      } catch (e) {
        if (!cached) throw e;
        dash.banner('無法連到 AoE4 World（' + e.message + '），顯示上次存下的資料。');
        player = cached.player;
      }
      session = { profileId, player, matches, store, catalog: cat, bulk: null };
      remember({ id: profileId, name: player.name, country: player.country });
      setUrl(profileId);
      render('AoE4 World');
      if (!matches.length) dash.banner(player.name + ' 在 AoE4 World 沒有線上對局紀錄。');
      else dash.banner('');
      return true;
    } catch (e) {
      dash.banner('讀取玩家 ' + profileId + ' 失敗：' + (e && e.message ? e.message : e) + '。');
      return false;
    }
  }

  function buildData() {
    const s = session;
    const matches = s.matches.map((m) => {
      const rec = s.store.get(m.id);
      return Object.assign({}, m, { detail: rec && rec.detail ? rec.detail : null });
    });
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      source: 'aoe4world.com',
      player: s.player,
      matches,
      catalog: s.catalog.items,
    };
  }

  function render(sourceLabel) {
    const dash = Dash();
    const data = buildData();
    session.data = data;
    dash.load(data, sourceLabel + '：' + session.player.name + '（aoe4world.com/players/' + session.profileId + '）', provider);
    $('#reloadBtn').hidden = false;
    renderBar();
  }

  // 補上一場的詳細數據到目前畫面上的資料（不整個重載，保留目前的分頁與篩選）
  function applyDetail(gameId, rec) {
    session.store.set(gameId, rec);
    const m = session.data && session.data.matches.find((x) => x.id === gameId);
    if (m) m.detail = rec.detail || null;
  }

  async function downloadDetail(m) {
    const s = session;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await W.fetchDetail(s.profileId, m, s.catalog, s.bulk && s.bulk.signal);
        const rec = { detail: res.detail, replay: res.replay, fetchedAt: Date.now() };
        await idbPut('details', s.profileId + ':' + m.id, rec);
        if (session === s) applyDetail(m.id, rec);
        return rec;
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        lastErr = e;
        if (!(e instanceof W.HttpError) || e.status !== 429) break;
        await sleep(8000 * (attempt + 1));   // 被限流：等一下再試
      }
    }
    if (lastErr instanceof W.HttpError && lastErr.status === 429) throw new Error('AoE4 World 暫時限制請求次數，請過一兩分鐘再試');
    if (lastErr instanceof TypeError) throw new Error('連不到 AoE4 World（網路問題，或瀏覽器擋下了跨網站請求）');
    throw lastErr;
  }

  const provider = {
    kind: 'aoe4world',
    reload: () => session && open(session.profileId, { silent: true }),
    detailStatus(m) {
      if (!session || typeof m.id !== 'number') return null;
      const rec = session.store.get(m.id);
      if (rec && !rec.detail) {
        const stale = Date.now() - rec.fetchedAt > RETRY_MISSING_DAYS * 86400000;
        return { text: detailNote(rec), canFetch: stale, note: stale ? '可以再試一次。' : '' };
      }
      return { text: '這場的詳細數據（逐時曲線、建造順序、資源利用）還沒下載。', canFetch: true, note: '佇列呆料要有重播檔才算得精確；官方只保留最近一段時間的重播，玩家也要在遊戲裡開啟分享對戰紀錄。' };
    },
    async fetchDetail(m) {
      const rec = await downloadDetail(m);
      Dash().refresh();
      renderBar();
      return !!rec.detail;
    },
  };

  // ---------------- 上方提示列：詳細數據下載進度 ----------------
  function counts() {
    const s = session;
    let have = 0, replay = 0, missing = 0;
    for (const m of s.matches) {
      const rec = s.store.get(m.id);
      if (!rec) continue;
      if (rec.detail) { have++; if (rec.replay) replay++; } else missing++;
    }
    return { total: s.matches.length, have, replay, missing };
  }

  function pending(limit) {
    const s = session;
    return s.matches
      .filter((m) => { const rec = s.store.get(m.id); return !rec || (!rec.detail && Date.now() - rec.fetchedAt > RETRY_MISSING_DAYS * 86400000); })
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .slice(0, limit);
  }

  function renderBar() {
    const bar = $('#pBar');
    if (!session || Dash().current().provider !== provider) { bar.hidden = true; bar.replaceChildren(); return; }
    const c = counts();
    const s = session;
    const kids = [];
    if (s.bulk) {
      kids.push(h('span', { class: 'grow' }, '正在下載詳細數據：' + s.bulk.done + ' / ' + s.bulk.total + ' 場' + (s.bulk.note ? '（' + s.bulk.note + '）' : '') + '。每場間隔約 1 秒，避免被 AoE4 World 限流。'));
      kids.push(h('progress', { max: s.bulk.total, value: s.bulk.done }));
      kids.push(h('button', { type: 'button', class: 'btn', onclick: () => s.bulk && s.bulk.abort() }, '停止'));
    } else {
      kids.push(h('span', { class: 'grow' },
        '正在看 ', h('b', null, s.player.name), ' 的線上對局（' + fmtNum(c.total) + ' 場）。已下載 ' + fmtNum(c.have) + ' 場的詳細數據' +
        (c.have ? '，其中 ' + fmtNum(c.replay) + ' 場有重播檔（佇列呆料精確計算）' : '') + '。「勝負關鍵」只用有詳細數據的場次。'));
      const left = pending(Infinity).length;
      BULK_SIZES.filter((n, i) => i === 0 || left > BULK_SIZES[i - 1]).forEach((n) => {
        if (!left) return;
        kids.push(h('button', { type: 'button', class: 'btn btn-gold', onclick: () => bulk(Math.min(n, left)) }, '下載最近 ' + Math.min(n, left) + ' 場'));
      });
    }
    bar.replaceChildren(h('div', null, ...kids));
    bar.hidden = false;
  }

  async function bulk(n) {
    const s = session;
    if (!s || s.bulk) return;
    const list = pending(n);
    const ctl = new AbortController();
    s.bulk = { total: list.length, done: 0, note: '', signal: ctl.signal, abort: () => ctl.abort() };
    renderBar();
    let failed = 0;
    let stopMsg = '';
    for (const m of list) {
      if (ctl.signal.aborted) break;
      try { await downloadDetail(m); }
      catch (e) {
        if (e && e.name === 'AbortError') break;
        failed++;
        if (/限制請求/.test(e.message) || /連不到/.test(e.message)) { stopMsg = e.message; break; }
      }
      s.bulk.done++;
      s.bulk.note = failed ? failed + ' 場失敗' : '';
      renderBar();
      if (s.bulk.done % 5 === 0) Dash().refresh();
      await sleep(PAUSE_MS);
    }
    s.bulk = null;
    if (session !== s) return;
    Dash().refresh();
    renderBar();
    if (stopMsg) Dash().banner('下載暫停：' + stopMsg + '。已下載的場次都存起來了，之後按「下載最近…」會接著抓。');
  }

  // ---------------- 對話框 ----------------
  function playerItem(card, onPick) {
    const boards = (card.boards || []).slice(0, 3).map((b) => b.mode.replace(/_/g, ' ') + ' ' + b.rating).join(' · ');
    return h('li', null, h('button', { type: 'button', class: 'p-item', onclick: () => onPick(card) },
      card.avatar ? h('img', { src: card.avatar, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'p-ph' }),
      h('span', null, h('b', null, card.name || '（無名稱）'), h('small', null, [card.country ? card.country.toUpperCase() : null, boards || null, card.lastGameAt ? '最後一場 ' + card.lastGameAt.slice(0, 10) : null].filter(Boolean).join(' · ') || '—')),
      h('span', { class: 'p-id' }, '#' + card.id)));
  }

  function pick(card) {
    $('#playerDlg').close();
    open(card.id);
  }

  function renderRecent() {
    const list = recent();
    $('#pRecentSec').hidden = !list.length;
    $('#pRecent').replaceChildren(...list.map((c) => playerItem(c, pick)));
  }

  let searchCtl = null;
  async function search(q) {
    const out = $('#pResults');
    if (searchCtl) searchCtl.abort();
    searchCtl = new AbortController();
    out.replaceChildren(h('li', { class: 'p-msg' }, '搜尋中…'));
    try {
      const list = await W.searchPlayers(q, searchCtl.signal);
      out.replaceChildren(...(list.length ? list.slice(0, 30).map((c) => playerItem(c, pick)) : [h('li', { class: 'p-msg' }, '找不到「' + q + '」。名稱要和遊戲裡一樣，也可以直接輸入 AoE4 World 的玩家 ID。')]));
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      out.replaceChildren(h('li', { class: 'p-msg' }, '搜尋失敗：' + (e && e.message ? e.message : e)));
    }
  }

  function openDialog() {
    renderRecent();
    const dlg = $('#playerDlg');
    if (!dlg.open) dlg.showModal();
    $('#pSearch').focus();
  }

  function init() {
    $('#playerBtn').addEventListener('click', openDialog);
    $('#pSearchForm').addEventListener('submit', (e) => { e.preventDefault(); search($('#pSearch').value); });
    $('#pDefault').addEventListener('click', () => {
      $('#playerDlg').close();
      if (session && session.bulk) session.bulk.abort();
      session = null;
      setUrl(null);
      renderBar();
      Dash().loadDefault();
    });
    $('#importFile').addEventListener('change', () => { $('#playerDlg').close(); if (session && session.bulk) session.bulk.abort(); session = null; setUrl(null); setTimeout(renderBar, 0); });
    // 點對話框外面關閉
    $('#playerDlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.AOE4Player = { fromUrl, openFromUrl: () => open(fromUrl()), open, openDialog };
})();
