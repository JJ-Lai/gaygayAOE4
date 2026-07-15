# Phase 1：基礎骨架與對戰清單同步

| 項目 | 內容 |
|------|------|
| 預估時間 | 2 週 |
| 前置條件 | Phase 0 完成 |
| 範例 profile_id | `10861747` |
| 狀態 | ⬜ 未開始 |

## 目標

建立 Maven 多模組專案、H2 資料庫、Flyway migration，並實作對戰清單的增量同步。

## 任務清單

### 專案骨架

- [ ] 建立 parent `pom.xml`（Java 21, Spring Boot 3.x）
- [ ] 建立子模組：`aoe4-common`
- [ ] 建立子模組：`aoe4-persistence`
- [ ] 建立子模組：`aoe4-ingest`
- [ ] 建立子模組：`aoe4-analytics-service`
- [ ] 建立子模組：`aoe4-api`（Spring Boot 主程式）
- [ ] 設定模組間依賴關係

### 資料庫與 Migration

- [ ] 設定 H2 File Mode（`jdbc:h2:file:./data/aoe4db`）
- [ ] 整合 Flyway
- [ ] `V1__dim_tables.sql`：dim_player, dim_civilization, dim_map, dim_leaderboard, dim_patch
- [ ] `V2__fact_game_tables.sql`：fact_game, fact_game_player
- [ ] `V3__sync_meta_tables.sql`：sync_cursor, api_request_log
- [ ] 建立 JPA Entity 與 Repository
- [ ] 啟用 H2 Console（開發用，`/h2-console`）

### AoE4 World API Client

- [ ] 建立 `Aoe4WorldClient`（WebClient）
- [ ] 設定 Base URL、User-Agent、Timeout
- [ ] 實作 `getPlayer(profileId)`
- [ ] 實作 `getPlayerGames(profileId, params)`
- [ ] 實作 `getGames(updatedSince, profileIds)`
- [ ] 實作 API 請求日誌寫入 `api_request_log`
- [ ] 處理 429 / 5xx 重試與指數退避

### 同步服務

- [ ] 建立 `GameSyncService`
- [ ] 實作增量同步邏輯（讀取/更新 `sync_cursor`）
- [ ] UPSERT `dim_player`（從 API 回應）
- [ ] UPSERT `fact_game`、`fact_game_player`
- [ ] 支援指定 `profile_id` 列表同步（預設含 `10861747`）
- [ ] 建立 `@Scheduled` 排程（建議每 30 分鐘）

### REST API（基礎）

- [ ] `GET /api/v1/players/{profileId}` — 回傳玩家資料（先查本地，無則拉 API）
- [ ] `GET /api/v1/games?profileId={id}&page=&size=` — 對戰列表
- [ ] `POST /api/v1/players/{profileId}/sync` — 手動觸發同步
- [ ] `GET /actuator/health` — 健康檢查
- [ ] 整合 SpringDoc OpenAPI

### 設定檔

- [ ] `application.yml`：資料庫、API、同步排程設定
- [ ] `application-dev.yml`：開發環境覆寫
- [ ] 設定 `aoe4.sync.default-profile-ids: [10861747]`

### 測試

- [ ] 單元測試：API Client（Mock WebClient）
- [ ] 整合測試：同步 `10861747` 對戰清單入庫
- [ ] 驗證 H2 內 `fact_game` 有資料

## 產出物

| 產出 | 說明 |
|------|------|
| Maven 多模組專案 | 可 `mvn clean install` |
| Flyway migrations | `aoe4-persistence/src/main/resources/db/migration/` |
| 同步排程 | 自動增量同步 |
| 基礎 REST API | 玩家查詢、對戰列表、手動同步 |

## 完成標準（Definition of Done）

- [ ] `mvn spring-boot:run` 可啟動後端
- [ ] 呼叫 `POST /api/v1/players/10861747/sync` 後，H2 有該玩家對戰紀錄
- [ ] `GET /api/v1/games?profileId=10861747` 回傳 JSON 列表
- [ ] `sync_cursor` 表有更新時間戳
- [ ] OpenAPI UI 可瀏覽（`/swagger-ui.html`）

## 資料表（本階段）

```
dim_player
dim_civilization
dim_map
dim_leaderboard
dim_patch
fact_game
fact_game_player
sync_cursor
api_request_log
```

## 備註

- 本階段**不**拉取 Summary，僅同步對戰清單與基本欄位
- `profile_id` 同步邏輯需設計成可動態新增（為 Phase 4 網頁輸入 ID 做準備）

## 下一步

完成後進入 [Phase 2：Summary 解析與入庫](./PHASE-2-summary-ingest.md)
