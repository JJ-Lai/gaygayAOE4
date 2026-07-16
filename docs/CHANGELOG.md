# API 變更紀錄

## 0.1.0-SNAPSHOT（2026-07-15，續 10）

### 新增

- `GET /share/player/{profileId}/games/{gameId}` — 伺服器端 OG HTML 分享頁
- `GameTimelineView.availableOpponents` + `?opponentProfileId=` 指定對比對手
- 前端：對手下拉選單、URL `?opponent=`、分享連結改為 `/share/...`
- Vite proxy `/share`；WebConfig 排除 share 路徑的 SPA fallback

## 0.1.0-SNAPSHOT（2026-07-15，續 9）

### 新增

- `TimelineOpponentView.buildEvents` — 對手建造/損失事件
- 前端單場詳情：雙方建造事件並排時間軸
- `useOgMeta` — 客戶端 `og:title` / `og:description` / `og:url`
- `scripts/verify-player-sample.ps1` — 公開樣本玩家（預設 1224481）驗證
- `docs/PRODUCTION-SECRETS.md` — 正式環境 secrets 與備份排程
- E2E：雙方建造事件並排

## 0.1.0-SNAPSHOT（2026-07-15，續 8）

### 新增

- `GameTimelineView.opponent` — 對手資源/軍隊時間軸（1v1 自動帶入）
- 前端單場詳情：雙方資源/軍隊疊圖（實線我方、虛線對手）
- `usePageMeta`：動態頁面 title 與 description
- `docker-compose.postgres.full.yml` — PostgreSQL + 應用 + 監控
- GitHub Actions：main 分支推送 `ghcr.io/<repo>:latest`
- `scripts/smoke-test.ps1` — 部署後 API 健康檢查
- 整合測試：timeline opponent 驗證

## 0.1.0-SNAPSHOT（2026-07-15，續 7）

### 新增

- 單場詳情：資源/軍隊圖表「匯出 PNG」、複製分享連結、建造事件「僅損失」篩選
- E2E：`game-detail-page.spec.ts`（戰鬥統計、事件篩選、匯出按鈕）
- GitHub Actions：`.github/workflows/docker.yml`（驗證 Docker image 建置）
- Prometheus 告警規則：`monitoring/prometheus/alert.rules.yml`（含 API down 健康檢查）
- Alertmanager Slack 範例：`alertmanager.example.yml`、`docker-compose.alerting.yml`
- `docs/SUMMARY-API-GUIDE.md` §13：歷史 Summary 重新解析流程

## 0.1.0-SNAPSHOT（2026-07-15，續 6）

### 新增

- `GameDetailView.combatStats` — 單場戰鬥統計（建築/單位損失、擊殺）
- `TimelineBuildEvent.displayName` — 建造/損失事件顯示名稱
- `POST /api/v1/ops/reparse-summaries` — 從已入庫 payload 重新解析 Summary
- `SummaryReparseService` — 補齊歷史 `destroyed[]` 與戰鬥統計
- 前端單場詳情：戰鬥統計卡片、事件類型著色（FINISHED/CONSTRUCTED/DESTROYED）
- Ops 頁「重新解析 Summary」區塊
- `docker-compose.full.yml` — 應用 + Prometheus + Grafana 一鍵啟動

## 0.1.0-SNAPSHOT（2026-07-15，續 5）

### 新增

- Spring Boot 整合測試：`ApiIntegrationTest`（H2 in-memory + `@ActiveProfiles("test")`）
- 同步告警 Webhook：`aoe4.ops.alert-webhook-*` + 排程 + `POST /api/v1/ops/notify-alerts`
- Grafana Dashboard：`monitoring/grafana/aoe4-overview.json`
- `docker-compose.monitoring.yml`（Prometheus + Grafana）
- `docs/MONITORING.md`
- Ops 頁「推送告警 Webhook」按鈕

## 0.1.0-SNAPSHOT（2026-07-15，續 4）

### 新增

- `GET /api/v1/ops/query-plans?profileId=` — 常用分析 SQL 的 EXPLAIN + 耗時
- V11 migration：`idx_fbe_profile_kind`（加速單位損失查詢）
- Prometheus gauges：`aoe4.sync.games_without_summary`、`aoe4.sync.alert.count{code=...}`
- 前端 Ops 頁「SQL 查詢計畫檢視」區塊
- `scripts/explain-queries.ps1`、`docs/SQL-QUERY-PLANS.md`

## 0.1.0-SNAPSHOT（2026-07-15，續 3）

### 新增

- `buildOrder.destroyed[]` 解析入庫（`fact_build_event` event_kind=DESTROYED）
- `GET /api/v1/analytics/unit-loss-stats` — 單位/建築損失聚合
- 匯出：`/api/v1/export/combat-stats.{csv,json}`、`/api/v1/export/unit-loss-stats.{csv,json}`
- Ops `sync-overview` 回傳 `alerts`（重試用盡、高失敗率、大量待抓 Summary）
- 前端 `/player/:id/unit-losses` 單位損失頁；Ops 頁告警橫幅
- `scripts/migrate-h2-to-postgres.ps1` + `docs/POSTGRES-MIGRATION.md`
- E2E：`ops-page.spec.ts`

## 0.1.0-SNAPSHOT（2026-07-15，續 2）

### 新增

- PostgreSQL profile：`spring.profiles.active=postgres` + `docker-compose.postgres.yml`
- `fact_player_combat_stats`（V10）— 從 Summary `_stats` 解析建築/單位損失與擊殺
- `GET /api/v1/analytics/combat-stats` — 各文明平均戰鬥統計
- `POST /api/v1/ops/batch-sync` — 批次同步追蹤玩家（最多 10 位）
- `POST /api/v1/ops/retry-failed-summaries` — 重置用盡重試次數並重試
- 前端 `/player/:id/combat` 戰鬥統計頁；Ops 頁批次操作按鈕
- `scripts/load-test.ps1` — 簡易 API 負載測試

## 0.1.0-SNAPSHOT（2026-07-15，續）

### 新增

- `GET /api/v1/ops/sync-overview` — 全域同步概況
- `GET /api/v1/ops/failed-summaries` — 近期 Summary 失敗清單
- `GET /api/v1/ops/players/sync-status?profileIds=` — 批次玩家同步狀態
- `GET /api/v1/analytics/mode-stats` — 各模式（leaderboard）勝率
- 前端 `/ops` 同步 Dashboard、`/player/:id/modes` 模式分析、`/player/:id/military` 軍事分差
- 前端路由 lazy loading（Vite code splitting）

## 0.1.0-SNAPSHOT（2026-07-15）

### 新增

- `GET /api/v1/analytics/patch-stats` — 各補丁版本勝率統計
- `GET /api/v1/export/patch-stats.csv` / `.json` — 補丁分析匯出
- 分析 API 支援 `ratingMin`、`ratingMax` 查詢參數（所有維度統計與匯出）

### 變更

- `GET /api/v1/analytics/overview` 現支援 `civ`、`patch`、`ratingMin`、`ratingMax` 篩選
- 設定 Rating 篩選時，預聚合快取自動跳過，改走即時查詢
- 生產環境（`spring.profiles.active=prod`）啟用 JSON 結構化日誌

### 先前版本（Phase 4–5 核心）

- 玩家搜尋、同步、分析 API（overview、資源曲線、matchup、建造偏好、地圖分析）
- 匯出（matchup / games / map CSV+JSON）
- 設定 API Key、Prometheus metrics
