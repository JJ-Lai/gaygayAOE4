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
        const req = indexedDB.open(DB_NAME, 2);
        req.onupgradeneeded = () => {
          const d = req.result;
          const make = (name) => { if (!d.objectStoreNames.contains(name)) d.createObjectStore(name); };
          make('players');   // key: profileId → { player, matches（不含 detail）, updatedAt }
          make('details');   // key: 'profileId:gameId' → { detail | null, replay, fetchedAt }
          make('local');     // key: profileId → { owner, matches（含 detail）, scannedAt }：讀本機 AoE4 資料夾的結果
          make('handles');   // key: 'aoe4-folder' → 上次選的資料夾（Chrome／Edge 才有）
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
  // 每次開始載入一位玩家拿一個序號；之後又選了別人或回到預設，舊的載入回來就丟掉，不蓋掉畫面
  let openSeq = 0;

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
    const seq = ++openSeq;
    const current = () => seq === openSeq;
    dash.cancelDefault();
    if (session && session.bulk) session.bulk.abort();
    dash.banner('正在讀取玩家 ' + profileId + ' 的資料…');
    try {
      const [cached, cat, store, local] = await Promise.all([idbGet('players', profileId), catalog(), idbDetails(profileId), idbGet('local', profileId)]);
      let player;
      let matches = (cached && cached.matches) || [];
      if (!current()) return false;
      const showCached = () => {
        if (!cached || !cached.player) return;
        session = { profileId, player: cached.player, matches, store, local, catalog: cat, bulk: null };
        render('AoE4 World（離線快取）');
      };
      // 先秀快取，再更新
      if (cached && !o.silent) showCached();
      try {
        player = await W.fetchPlayer(profileId).catch((e) => {
          // AoE4 World 上沒有這位玩家（例如只打自訂、對電腦），有本機資料就只看本機
          if (local && e instanceof W.HttpError && e.status === 404) return null;
          throw e;
        });
        if (!player) {
          if (!current()) return false;
          session = { profileId, player: localPlayer(local), matches: [], store, local, catalog: cat, bulk: null };
          remember({ id: profileId, name: session.player.name });
          setUrl(profileId);
          render('本機資料夾');
          dash.banner('');
          return true;
        }
        const known = new Set(matches.map((m) => m.id));
        const fresh = await W.fetchMatches(profileId, {
          known,
          onProgress: ({ loaded, total }) => current() && dash.banner('正在向 AoE4 World 讀取 ' + (player.name || profileId) + ' 的對局清單…（' + fmtNum(known.size + loaded) + (total ? ' / ' + fmtNum(total) : '') + ' 場）'),
        });
        if (fresh.length || !cached) {
          const byId = new Map(matches.map((m) => [m.id, m]));
          fresh.forEach((m) => byId.set(m.id, m));
          matches = [...byId.values()];
        }
        await idbPut('players', profileId, { player, matches, updatedAt: new Date().toISOString() });
      } catch (e) {
        if (!current()) return false;
        if (!cached && !local) throw e;
        dash.banner('無法連到 AoE4 World（' + e.message + '），顯示上次存下的資料。');
        player = cached ? cached.player : localPlayer(local);
      }
      if (!current()) return false;
      session = { profileId, player, matches, store, local, catalog: cat, bulk: null };
      remember({ id: profileId, name: player.name, country: player.country });
      setUrl(profileId);
      render('AoE4 World');
      if (!matches.length && !local) dash.banner(player.name + ' 在 AoE4 World 沒有線上對局紀錄。可以在「看別人的戰績」裡讀取這台電腦的 AoE4 資料夾，看自訂與對電腦的對局。');
      else if (/正在|讀取/.test($('#banner').textContent)) dash.banner('');
      return true;
    } catch (e) {
      if (!current()) return false;
      dash.banner('讀取玩家 ' + profileId + ' 失敗：' + (e && e.message ? e.message : e) + '。');
      return false;
    }
  }

  function localPlayer(local) {
    const o = (local && local.owner) || {};
    return { id: o.profileId || null, name: o.name || '本機玩家', country: null, ratings: {} };
  }

  // 線上（AoE4 World）＋本機資料夾：
  //   同一場兩邊都有（線上配對、排位在這台電腦打的）→ 用線上的對局資訊；沒下載摘要時用本機統計檔的逐時數據
  //   只有本機有（自訂、對電腦）→ 直接加進來
  function buildData() {
    const s = session;
    const localById = new Map(((s.local && s.local.matches) || []).map((m) => [m.id, m]));
    const onlineIds = new Set(s.matches.map((m) => m.id));
    const matches = s.matches.map((m) => {
      const rec = s.store.get(m.id);
      const loc = localById.get(m.id);
      return Object.assign({}, m, { detail: rec && rec.detail ? rec.detail : loc && loc.detail ? loc.detail : null });
    });
    localById.forEach((m, id) => { if (!onlineIds.has(id)) matches.push(Object.assign({}, m)); });
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      source: s.local ? (s.matches.length ? 'aoe4world.com + local' : 'local') : 'aoe4world.com',
      player: s.player,
      matches,
      catalog: s.catalog.items,
    };
  }

  function render(sourceLabel) {
    const dash = Dash();
    const data = buildData();
    session.data = data;
    const where = session.matches.length ? 'aoe4world.com/players/' + session.profileId : '玩家 ID ' + session.profileId;
    const localNote = session.local ? ' ＋ 本機資料夾（' + fmtNum(session.local.matches.length) + ' 場，讀取於 ' + new Date(session.local.scannedAt).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' }) + '）' : '';
    dash.load(data, sourceLabel + '：' + session.player.name + '（' + where + '）' + localNote, provider);
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
      if (m.state === 'local') return { text: '這場沒有逐時數據：這台電腦上沒有這場的統計檔（遊戲只保留最近一段時間的檔案）。', canFetch: false };
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
    const localDetail = new Set(((s.local && s.local.matches) || []).filter((m) => m.detail).map((m) => m.id));
    return s.matches
      .filter((m) => { if (localDetail.has(m.id)) return false; const rec = s.store.get(m.id); return !rec || (!rec.detail && Date.now() - rec.fetchedAt > RETRY_MISSING_DAYS * 86400000); })
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
      const loc = (s.local && s.local.matches) || [];
      const online = c.total ? ' 的線上對局（' + fmtNum(c.total) + ' 場）。已下載 ' + fmtNum(c.have) + ' 場的詳細數據' +
        (c.have ? '，其中 ' + fmtNum(c.replay) + ' 場有重播檔（佇列呆料精確計算）' : '') + '。' : ' 的對局。';
      const local = loc.length ? '這台電腦的資料夾另外讀到 ' + fmtNum(loc.length) + ' 場（' + fmtNum(loc.filter((m) => m.detail).length) + ' 場有逐時數據）。' : '';
      kids.push(h('span', { class: 'grow' }, '正在看 ', h('b', null, s.player.name), online + local + '「勝負關鍵」只用有詳細數據的場次。'));
      if (loc.length) kids.push(h('button', { type: 'button', class: 'btn', onclick: () => (canPickDir ? rescanSaved() : pickFolder()) }, '重新讀取本機資料夾'));
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

  // ---------------- 讀本機 AoE4 資料夾 ----------------
  // 檔案只在瀏覽器裡解析，不會上傳。Chrome／Edge 用資料夾選擇器並記住資料夾；其他瀏覽器每次選資料夾（會列出整個資料夾的檔案）。
  const Local = window.AOE4LocalStats;
  const HANDLE_KEY = 'aoe4-folder';
  const canPickDir = typeof window.showDirectoryPicker === 'function';

  // 重播檔只需要檔頭（玩家、地圖、時間），先解壓前 256 KB；統計檔要整份
  async function gunzip(bytes) {
    const head = await inflate(bytes, 256 * 1024);
    const isReplay = head.length >= 11 && String.fromCharCode(...head.subarray(4, 11)) === 'AOE4_RE';
    return isReplay || head.length < 256 * 1024 ? head : inflate(bytes, 0);
  }
  async function inflate(bytes, maxBytes) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      n += value.length;
      if (maxBytes && n >= maxBytes) { reader.cancel().catch(() => {}); break; }
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  // 選到上層資料夾（文件、My Games）也找得到
  async function aoeRoot(dir) {
    const sub = async (d, name) => { try { return await d.getDirectoryHandle(name); } catch (e) { return null; } };
    if ((await sub(dir, 'network')) || (await sub(dir, 'matchhistory'))) return dir;
    for (const path of [['Age of Empires IV'], ['My Games', 'Age of Empires IV']]) {
      let d = dir;
      for (const p of path) d = d && (await sub(d, p));
      if (d) return d;
    }
    return null;
  }
  async function filesFromHandle(dir) {
    const root = await aoeRoot(dir);
    if (!root) return null;
    const out = [];
    const add = async (path, handle) => {
      const file = await handle.getFile();
      out.push({ path, lastModified: file.lastModified, read: async () => new Uint8Array(await (await handle.getFile()).arrayBuffer()) });
    };
    for (const name of ['network', 'matchhistory']) {
      let d;
      try { d = await root.getDirectoryHandle(name); } catch (e) { continue; }
      for await (const [entry, h] of d.entries()) {
        if (name === 'network' && h.kind === 'file' && /^[MS]_\d+_[0-9a-fA-F]+\.gz$/.test(entry)) await add('network/' + entry, h);
        if (name === 'matchhistory' && h.kind === 'directory') {
          for await (const [f, fh] of h.entries()) if (fh.kind === 'file' && (f === 'match_history.jsn' || f === 'stats.rgs')) await add('matchhistory/' + entry + '/' + f, fh);
        }
      }
    }
    return out;
  }
  function filesFromInput(list) {
    return [...list]
      .filter((f) => /(^|\/)network\/[MS]_\d+_[0-9a-fA-F]+\.gz$|(^|\/)matchhistory\/[^/]+\/(match_history\.jsn|stats\.rgs)$/.test(f.webkitRelativePath || f.name))
      .map((f) => ({ path: f.webkitRelativePath || f.name, lastModified: f.lastModified, read: async () => new Uint8Array(await f.arrayBuffer()) }));
  }

  function localMsg(text) {
    const el = $('#pLocalMsg');
    el.textContent = text || '';
    el.hidden = !text;
  }

  async function scanLocal(files) {
    const dash = Dash();
    if (!files) { localMsg('這個資料夾裡找不到 AoE4 的對局檔。請選「文件 → My Games → Age of Empires IV」。'); return; }
    if (!files.length) { localMsg('資料夾裡沒有對局檔（network、matchhistory 都是空的）。打過幾場之後再試。'); return; }
    $('#playerDlg').close();
    const seq = ++openSeq;
    dash.cancelDefault();
    const t0 = Date.now();
    dash.banner('正在讀取本機對局…（0 / ' + fmtNum(files.length) + ' 個檔案）');
    let res;
    try {
      res = await Local.scanFolder(files, {
        gunzip,
        onProgress: (n, total) => { if (seq === openSeq && (n % 10 === 0 || n === total)) dash.banner('正在讀取本機對局…（' + fmtNum(n) + ' / ' + fmtNum(total) + ' 場）'); },
      });
    } catch (e) {
      dash.banner('讀取本機資料夾失敗：' + (e && e.message ? e.message : e));
      return;
    }
    if (seq !== openSeq) return;
    if (!res.owner || !res.matches.length) { dash.banner('這個資料夾裡沒有讀得懂的對局（可能是很舊的遊戲版本）。'); return; }
    const pid = res.owner.profileId;
    await idbPut('local', pid, { owner: res.owner, matches: res.matches, scannedAt: new Date().toISOString() });
    const withDetail = res.matches.filter((m) => m.detail).length;
    await open(pid);
    dash.banner('讀到這台電腦上 ' + (res.owner.name || '玩家 ' + pid) + ' 的 ' + fmtNum(res.matches.length) + ' 場對局（' + fmtNum(withDetail) + ' 場有逐時數據），花了 ' + Math.round((Date.now() - t0) / 1000) + ' 秒。檔案只在你的瀏覽器裡解析，沒有上傳。');
  }

  async function pickFolder() {
    localMsg('');
    if (!canPickDir) { $('#pLocalInput').click(); return; }
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'aoe4', mode: 'read', startIn: 'documents' }); }
    catch (e) { if (e && e.name !== 'AbortError') localMsg('無法開啟資料夾：' + e.message); return; }
    await idbPut('handles', HANDLE_KEY, dir);
    renderLocalButtons();
    scanLocal(await filesFromHandle(dir));
  }

  async function rescanSaved() {
    localMsg('');
    const dir = await idbGet('handles', HANDLE_KEY);
    if (!dir) { pickFolder(); return; }
    try {
      let perm = await dir.queryPermission({ mode: 'read' });
      if (perm !== 'granted') perm = await dir.requestPermission({ mode: 'read' });
      if (perm !== 'granted') { localMsg('沒有取得讀取權限。'); return; }
    } catch (e) { pickFolder(); return; }
    scanLocal(await filesFromHandle(dir));
  }

  async function renderLocalButtons() {
    const saved = canPickDir ? await idbGet('handles', HANDLE_KEY) : null;
    $('#pLocalAgain').hidden = !saved;
    if (saved) $('#pLocalAgain').textContent = '重新讀取「' + saved.name + '」';
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
    renderLocalButtons();
    localMsg('');
    const dlg = $('#playerDlg');
    if (!dlg.open) dlg.showModal();
    $('#pSearch').focus();
  }

  function init() {
    $('#playerBtn').addEventListener('click', openDialog);
    $('#pLocalPick').addEventListener('click', pickFolder);
    $('#pLocalAgain').addEventListener('click', rescanSaved);
    $('#pLocalInput').addEventListener('change', (e) => { const list = [...e.target.files]; e.target.value = ''; scanLocal(filesFromInput(list)); });
    $('#pSearchForm').addEventListener('submit', (e) => { e.preventDefault(); search($('#pSearch').value); });
    $('#pDefault').addEventListener('click', () => {
      openSeq++;
      $('#playerDlg').close();
      if (session && session.bulk) session.bulk.abort();
      session = null;
      setUrl(null);
      renderBar();
      Dash().loadDefault();
    });
    $('#importFile').addEventListener('change', () => { openSeq++; $('#playerDlg').close(); if (session && session.bulk) session.bulk.abort(); session = null; setUrl(null); setTimeout(renderBar, 0); });
    // 點對話框外面關閉
    $('#playerDlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.AOE4Player = { fromUrl, openFromUrl: () => open(fromUrl()), open, openDialog };
})();
