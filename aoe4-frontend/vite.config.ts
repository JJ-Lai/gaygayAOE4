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
        let file: string | null = null
        if (path === '/' || path === '/index.html') file = join(dir, 'index.html')
        else if (path.startsWith('/data/')) {
          const target = normalize(join(dir, path))
          if (target.startsWith(join(dir, 'data'))) file = target
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
