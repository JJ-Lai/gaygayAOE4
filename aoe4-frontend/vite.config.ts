import { createReadStream, existsSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 開發時讓網址和部署後一樣：/ 是儀表板（../dashboard/index.html），/simulate 是戰術模擬（React）。
// 部署用的網站由 scripts/build-site.mjs 組成。
function dashboardDevPlugin(): Plugin {
  const dir = resolve(__dirname, '..', 'dashboard')
  return {
    name: 'aoe4-dashboard-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '/').split('?')[0])
        // 部署後由 worker/index.js 轉接 AoE4 World 單場摘要；開發時在這裡做同樣的事（不快取）
        const proxy = /^\/proxy\/summary\/(\d{1,12})\/(\d{1,12})$/.exec(path)
        if (proxy) {
          fetch(`https://aoe4world.com/players/${proxy[1]}/games/${proxy[2]}/summary?camelize=true`, {
            headers: { 'User-Agent': 'gaygayaoe4-dashboard/1.0 (dev; +https://github.com/JJ-Lai/gaygayAOE4)', Accept: 'application/json' },
          })
            .then(async (up) => {
              res.statusCode = up.status === 200 || up.status === 404 || up.status === 429 ? up.status : 502
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(up.status === 200 ? Buffer.from(await up.arrayBuffer()) : JSON.stringify({ error: 'AoE4 World HTTP ' + up.status }))
            })
            .catch(() => { res.statusCode = 502; res.end('{"error":"連不到 AoE4 World"}') })
          return
        }
        let file: string | null = null
        if (path === '/' || path === '/index.html') file = join(dir, 'index.html')
        else if (path === '/catalog.json') file = join(dir, 'catalog.json')
        else if (path.startsWith('/data/') || path.startsWith('/js/')) {
          const target = normalize(join(dir, path))
          if (target.startsWith(join(dir, 'data')) || target.startsWith(join(dir, 'js'))) file = target
        }
        if (!file || !existsSync(file)) return next()
        res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.json') ? 'application/json' : 'text/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), dashboardDevPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/share': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
