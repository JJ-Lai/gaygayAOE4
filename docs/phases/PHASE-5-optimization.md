# Phase 5：優化與擴充

| 項目 | 內容 |
|------|------|
| 預估時間 | 持續進行 |
| 前置條件 | Phase 4 完成（MVP 可上線） |
| 範例 profile_id | `10861747` + 支援任意 ID |
| 狀態 | ✅ 核心完成（持續迭代） |

## 目標

提升效能、可靠性與功能完整度，並視需求擴充分析維度與部署方式。

## 任務清單

### 效能優化

- [x] 分析常用查詢的 SQL 執行計畫檢視（`GET /ops/query-plans` + V11 索引 + 文件）
- [x] 新增複合索引（profile_id + civ 等，V8 migration）
- [x] 建立預聚合表：
  - [x] `agg_player_civ_stats`（玩家×文明勝率）
  - [x] `agg_matchup_matrix`（文明對戰矩陣）
  - [x] `agg_resource_timeline`（平均資源曲線）
- [x] 排程定期刷新預聚合表（每 6 小時 + 同步後觸發）
- [x] API 回應快取（Caffeine，5 分鐘）
- [x] 前端圖表資料懶加載 / 虛擬化長列表（路由 lazy loading + code split）

### 資料庫遷移（視需要）

- [x] 評估 H2 資料量與查詢效能瓶頸（見 `scripts/load-test.ps1`）
- [x] 若需要：建立 PostgreSQL 遷移方案（`application-postgres.yml` + `docker-compose.postgres.yml`）
- [x] 抽象資料源設定（H2 / PostgreSQL 可切換）
- [x] 資料遷移腳本（`scripts/migrate-h2-to-postgres.ps1` + `docs/POSTGRES-MIGRATION.md`）

### 同步可靠性

- [x] Summary 失敗重試（排除 NOT_FOUND，最多 3 次）
- [x] 同步失敗重試機制（dead letter queue — 重試次數用盡後可 reset + 手動重試 API）
- [x] 同步狀態 Dashboard（管理用）
- [x] 告警：連續 N 次同步失敗時通知（Ops API `alerts` + 前端 Alert 橫幅）
- [x] 支援多 profile_id 批次追蹤清單（Ops 批次同步）
- [x] 使用者「我的最愛玩家」功能（localStorage）

### 功能擴充

- [x] 支援更多模式（qm_2v2, rm_2v2 等 — 模式分析頁）
- [x] 地圖維度分析頁
- [x] 補丁版本比較（補丁分析頁）
- [x] Rating 區間篩選
- [x] 匯出功能（CSV — matchup、對戰列表、地圖、補丁；JSON — matchup、地圖、補丁）
- [x] 比較模式：兩個 profile_id 並排分析
- [x] 私人對戰：使用者輸入 `api_key` 設定頁

### 搜尋體驗強化

- [x] 玩家名稱搜尋（`GET /players/search?query=`）
- [x] 搜尋建議 / Autocomplete
- [x] 最近搜尋紀錄（localStorage）
- [x] 分享連結：`/player/10861747/resources?civ=en`

### 軍事分析深化

- [x] `fact_military_loss` 表實作與填充（`fact_player_combat_stats` + Summary `_stats`）
- [x] 單位層級損失統計（`buildOrder.destroyed` → `fact_build_event` + `/unit-loss-stats`）
- [x] 軍事分數 vs 對手文明熱力圖細化（軍事分差頁，依終局軍事分）

### 維運與部署

- [x] Docker Compose（後端 + H2 volume + 前端）
- [x] 生產環境 `application-prod.yml`
- [x] 日誌集中（JSON 格式，prod profile）
- [x] 健康檢查與 metrics（Micrometer / Prometheus）
- [x] Grafana Dashboard 範本 + `docker-compose.monitoring.yml`
- [x] 同步告警 Webhook（Slack 相容 JSON）
- [x] 備份策略（H2 檔案定期備份腳本）

### 測試與品質

- [x] 提高單元測試覆蓋率（QueryPlanService、OpsService、Analytics combat/unit-loss）
- [x] Spring Boot 整合測試（`ApiIntegrationTest` + H2 in-memory）
- [x] 整合測試 CI 流程（GitHub Actions）
- [x] GitHub Actions CI（Maven test + frontend build + Playwright E2E）
- [x] E2E 測試（搜尋 → 儀表板完整流程，Playwright + mock API）
- [x] 負載測試（`scripts/load-test.ps1`）

### 文件

- [x] 部署指南 `docs/DEPLOYMENT.md`
- [x] API 變更紀錄（`docs/CHANGELOG.md`）
- [x] 使用者操作說明（如何找 profile_id，`/help` 頁）

## 產出物

| 產出 | 說明 |
|------|------|
| 預聚合表 | 加速查詢 |
| 部署方案 | Docker / 生產設定 |
| 擴充功能 | 依優先級實作 |
| 維運文件 | 部署、備份、監控 |

## 完成標準（Definition of Done）

依實際選定的子項目而定。建議優先完成：

- [x] 預聚合表生效，matchup 查詢 < 500ms（無日期篩選時走預聚合 + 快取）
- [x] Docker Compose 一鍵啟動
- [x] 玩家名稱搜尋可用
- [x] H2 備份腳本

## 優先級建議

| 優先級 | 項目 | 原因 |
|--------|------|------|
| P0 | 預聚合表 + 索引 | 資料量增長後查詢變慢 |
| P0 | 同步失敗重試 | 資料完整性 |
| P1 | 玩家名稱搜尋 | 改善 UX，不必記 ID |
| P1 | Docker 部署 | 方便分享與部署 |
| P2 | PostgreSQL 遷移 | H2 瓶頸出現時 |
| P2 | 多模式支援 | 擴大分析範圍 |
| P3 | 比較模式、匯出 | 進階功能 |

## 如何找到 profile_id

可在 AoE4 World 玩家頁面 URL 取得：

```
https://aoe4world.com/players/10861747
                              ^^^^^^^^
                              即 profile_id
```

未來可在前端說明頁加入此指引。

## 備註

- Phase 5 為持續迭代，不需一次完成所有項目
- 每完成一項可在本文件打勾並記錄完成日期

## 版本紀錄

| 日期 | 完成項目 | 備註 |
|------|----------|------|
| 2026-07-15 | 玩家搜尋、Docker、索引、同步重試、部署文件 | Phase 5 首批 |
| 2026-07-15 | 預聚合表 V9、刷新服務、API 快取 | 無日期篩選時加速 matchup / 資源曲線 |
| 2026-07-15 | Prometheus metrics、Playwright E2E | 同步/聚合可觀測；前端 mock API 測試 |
| 2026-07-15 | GitHub Actions CI、CSV 匯出 | matchup / games 下載 |
| 2026-07-15 | 玩家比較、API Key 設定 | `/compare`、`/settings` |
| 2026-07-15 | 地圖分析、JSON 匯出 | `/player/:id/maps`、export JSON |
| 2026-07-15 | 補丁分析、Rating 篩選、最愛玩家、說明頁 | `/patches`、`/help`、JSON 日誌 |
| 2026-07-15 | 同步 Dashboard、模式/軍事分析、lazy loading | `/ops`、`/modes`、`/military` |
| 2026-07-15 | 單位損失、H2 遷移腳本、Ops 告警 | destroyed[] 解析、migrate-h2-to-postgres |
| 2026-07-15 | SQL 執行計畫、Prometheus 告警 gauges | query-plans API、V11 索引 |
| 2026-07-15 | 整合測試、Webhook、Grafana | ApiIntegrationTest、MONITORING.md |
