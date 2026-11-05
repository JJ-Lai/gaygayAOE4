// Cloudflare Worker（gaygayaoe4）：網站本身是靜態檔（dist），這裡只多做一件事——
// 轉接 AoE4 World 的單場摘要。摘要網址不允許其他網站直接呼叫（沒有 CORS），儀表板的「看別人的戰績」
// 改打同網域的 /proxy/summary/玩家ID/對局ID，由這裡向 AoE4 World 取回並快取。
//   - 只接受數字 ID，只轉這一個網址，不是開放的代理
//   - 成功的摘要快取 30 天（對局打完就不會變），404 快取 1 天，429（被限流）原樣回傳不快取
const UA = 'gaygayaoe4-dashboard/1.0 (+https://github.com/JJ-Lai/gaygayAOE4)';
const OK_TTL = 30 * 86400;
const MISSING_TTL = 86400;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const m = /^\/proxy\/summary\/(\d{1,12})\/(\d{1,12})$/.exec(url.pathname);
    if (m) return summary(m[1], m[2], request, ctx);
    return env.ASSETS.fetch(request);
  },
};

async function summary(profileId, gameId, request, ctx) {
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
  const cache = caches.default;
  const key = new Request('https://summary-cache.internal/' + gameId + '/' + profileId);
  const hit = await cache.match(key);
  if (hit) return hit;

  let up;
  try {
    up = await fetch('https://aoe4world.com/players/' + profileId + '/games/' + gameId + '/summary?camelize=true', {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
  } catch (e) {
    return json({ error: '連不到 AoE4 World' }, 502);
  }

  if (up.status === 200) {
    const res = new Response(up.body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=' + OK_TTL } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  }
  if (up.status === 404) {
    const res = json({ error: 'AoE4 World 沒有這場的摘要' }, 404, MISSING_TTL);
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  }
  const headers = {};
  const retry = up.headers.get('Retry-After');
  if (retry) headers['Retry-After'] = retry;
  return json({ error: 'AoE4 World 回應 HTTP ' + up.status }, up.status === 429 ? 429 : 502, 0, headers);
}

function json(body, status, ttl, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': ttl ? 'public, max-age=' + ttl : 'no-store' }, extra || {}),
  });
}
