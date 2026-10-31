# 世紀帝國 IV 對戰數據分析系統 — 技術參考文件

> 最後更新：2026-07-15  
> 範例玩家 `profile_id`：`10861747`（開發測試用；正式產品支援任意 ID 輸入搜尋）

---

## 1. 系統目標

建立可持續運作的數據平台，具備以下能力：

1. 從 AoE4 World 增量抓取對戰與詳細 Summary 數據
2. 存入自建 H2 資料庫（維度化、階層化設計）
3. 以 Maven 後端提供查詢與聚合 API
4. 前端支援多維度篩選與圖表（資源曲線、文明對戰軍損比等）
5. **網頁提供 `profile_id` 輸入框**，使用者輸入 ID 後即可搜尋並分析該玩家數據

---

## 2. 技術棧

| 層級 | 技術 | 說明 |
|------|------|------|
| 建置工具 | Maven 3.9+ | 多模組專案管理 |
| 後端框架 | Spring Boot 3.x (Java 21) | REST API、排程、依賴注入 |
| 資料存取 | Spring Data JPA + Hibernate | ORM、查詢抽象 |
| 資料庫 | H2 (File Mode) | 開發與個人分析；可後續換 PostgreSQL |
| Schema 管理 | Flyway | 版本化 migration |
| HTTP 客戶端 | Spring WebClient | 非同步呼叫 AoE4 World API |
| 排程 | Spring `@Scheduled` | 增量同步任務 |
| 快取 | Caffeine (本地) | Summary 回應快取，降低 API 壓力 |
| 前端 | React 18 + TypeScript + Vite | SPA 儀表板 |
| 圖表 | Apache ECharts 或 Recharts | 時間序列、熱力圖、對比圖 |
| UI 元件 | Ant Design 或 shadcn/ui | 篩選器、表格、下拉選單 |
| API 文件 | SpringDoc OpenAPI | Swagger UI |
| 靜態遊戲資料 | data.aoe4world.com | 單位、建築、科技階層與成本 |

### H2 使用建議

- 適合個人研究與原型階段
- 若資料量超過數十萬場、或需多人同時查詢，建議 Phase 5 後遷移至 PostgreSQL
- JPA 層在遷移時幾乎不需改動

---

## 3. Maven 多模組結構

```
aoe4-analytics/
├── pom.xml                    (parent)
├── aoe4-common/               (DTO, enums, utils)
├── aoe4-ingest/               (API client, sync jobs)
├── aoe4-persistence/          (JPA entities, repositories)
├── aoe4-analytics-service/    (聚合查詢邏輯)
├── aoe4-api/                  (Spring Boot 主程式 + REST)
└── aoe4-frontend/             (React, 可獨立 npm)
```

---

## 4. AoE4 World 資料來源

### 4.1 API 端點分層

| 層級 | 端點 | 用途 | 負載 |
|------|------|------|------|
| Layer 1 | `GET /api/v0/games` | 對戰清單增量同步 | 輕 |
| Layer 1 | `GET /api/v0/players/{id}/games` | 指定玩家對戰清單 | 輕 |
| Layer 2 | `GET /api/v0/players/{id}/games/{game_id}` | 單場詳情 | 中 |
| Layer 3 | `GET https://aoe4world.com/players/{id}/games/{game_id}/summary?camelize=true` | 建造歷史、資源、軍值曲線 | **重（CPU 密集）** |
| Layer 4 | `GET /api/v0/stats/{leaderboard}/civilizations` | 文明聚合統計 | 輕 |
| Layer 4 | `GET /api/v0/stats/{leaderboard}/matchups` | 文明對戰矩陣 | 輕 |
| Layer 4 | `GET /api/v0/stats/{leaderboard}/maps` | 地圖統計 | 輕 |

Base URL：`https://aoe4world.com/api/v0/`

### 4.2 範例 API 請求（profile_id = 10861747）

```
# 玩家資料
GET https://aoe4world.com/api/v0/players/10861747

# 玩家對戰清單
GET https://aoe4world.com/api/v0/players/10861747/games?leaderboard=rm_1v1&limit=10

# 最新一場（高效檢查是否有新對戰）
GET https://aoe4world.com/api/v0/players/10861747/games/last?include_stats=true

# 單場詳情（game_id 需從清單取得）
GET https://aoe4world.com/api/v0/players/10861747/games/{game_id}

# 單場 Summary（詳細分析數據）— 注意：不在 /api/v0/ 下
GET https://aoe4world.com/players/10861747/games/{game_id}/summary?camelize=true
# 私人對戰可加：&api_key=... 或 &sig=...
# 詳見 docs/SUMMARY-API-GUIDE.md

# 增量同步（全域）
GET https://aoe4world.com/api/v0/games?profile_ids=10861747&order=updated_at&updated_since=2026-07-01T00:00:00Z
```

### 4.3 使用規範（必須遵守）

| 規範 | 說明 |
|------|------|
| User-Agent | 必須標明應用名稱與聯絡方式，不可偽造瀏覽器 UA |
| 增量同步 | 使用 `updated_since` / `since`，禁止全量爬取 |
| Summary 限速 | 每場需動態解析，大量請求會被 429 封鎖；必須本地快取 + 請求佇列 + 指數退避 |
| 歷史資料 | 可從 [dumps](https://aoe4world.com/dumps) 下載季賽 JSON 做初次種子 |
| 私人對戰 | 需玩家 `api_key`（AoE4 World 帳號設定） |
| 官方聯繫 | 研究/社群專案建議聯繫 AoE4 World Discord |

### 4.4 Summary 可取得的分析維度

- 遊戲分數：Total / Military / Technology / Economy / Society
- 資源花費總量、軍隊價值
- 建造歷史（單位、建築、科技，含時間戳）
- 分鐘級經濟/軍事進展曲線

> 注意：資源花費為估算值，不含文明折扣（法國、蒙古 Ovoo 等）與 Wololo 轉換單位。

---

## 5. 資料庫設計（星型架構）

### 5.1 維度表（Dimension）

| 表名 | 主要欄位 | 說明 |
|------|----------|------|
| `dim_player` | profile_id, name, country, last_seen | 玩家 |
| `dim_civilization` | civ_id, civ_code, civ_name | 文明（en, fr, hre...） |
| `dim_map` | map_id, map_name, map_type | 地圖 |
| `dim_leaderboard` | leaderboard_id, code, name | 模式（rm_1v1, qm_2v2...） |
| `dim_patch` | patch_id, patch_number | 補丁版本 |
| `dim_resource_type` | resource_type_id, code, name | food, wood, gold, stone |
| `dim_unit` | unit_id, base_id, name, age, classes | 軍事單位階層 |
| `dim_building` | building_id, name, age | 建築 |
| `dim_technology` | tech_id, name, age | 科技 |
| `dim_time_bucket` | minute_index | 遊戲內分鐘（0, 1, 2...） |

### 5.2 事實表（Fact）

| 表名 | 說明 |
|------|------|
| `fact_game` | 對戰主檔（game_id, started_at, duration, map, patch, leaderboard） |
| `fact_game_player` | 每場每位玩家（player, civ, team, rating, won） |
| `fact_game_player_score` | 終局分數（total, military, technology, economy, society） |
| `fact_game_player_resource` | **資源時間序列**（game, player, minute, resource_type, accumulated） |
| `fact_game_player_army_value` | **軍隊價值時間序列**（game, player, minute, army_value） |
| `fact_build_event` | 建造事件明細（time, entity_type, entity_id, count） |
| `fact_military_loss` | 軍事損失（player, opponent_civ, unit, lost_count） |

### 5.3 元資料表

| 表名 | 說明 |
|------|------|
| `sync_cursor` | 各端點最後同步時間戳 |
| `api_request_log` | API 請求紀錄（url, status, latency, cached） |
| `raw_game_summary` | 原始 Summary JSON（備查、重解析用） |

### 5.4 ER 關係概覽

```
dim_civilization ──< fact_game_player >── dim_player
dim_map ──< fact_game >── fact_game_player
fact_game_player ──< fact_game_player_resource >── dim_resource_type
fact_game_player ──< fact_game_player_army_value
fact_game_player ──< fact_build_event >── dim_unit / dim_building / dim_technology
```

---

## 6. 系統架構

```
┌─────────────┐     ┌──────────────────┐     ┌─────────┐
│ AoE4 World  │────▶│  Ingest Service  │────▶│ H2 DB   │
│ API + Dumps │     │  + Summary Parser│     │         │
└─────────────┘     └──────────────────┘     └────┬────┘
                                                  │
┌─────────────┐     ┌──────────────────┐          │
│ React 前端  │◀───▶│ Analytics API    │◀─────────┘
│ (輸入 ID)   │     │ (Spring Boot)    │
└─────────────┘     └──────────────────┘
```

### 玩家搜尋流程（最終產品）

1. 使用者在網頁輸入 `profile_id`（例如 `10861747`）
2. 前端呼叫 `GET /api/v1/players/{profileId}` 驗證玩家存在
3. 若本地無資料或資料過舊，觸發背景同步該玩家對戰
4. 同步完成後，前端載入分析儀表板（資源曲線、matchup 等）

---

## 7. 同步策略

```
排程（建議每 30–60 分鐘）：
1. 讀取 sync_cursor.last_updated_since
2. GET /games?profile_ids={追蹤中的IDs}&order=updated_at&updated_since={cursor-1min}
3. 對每場新/更新 game：
   a. UPSERT fact_game, fact_game_player
   b. 若尚無 summary → 加入 Summary 佇列
4. Summary Worker（限速，建議 ≥ 2 秒/請求）：
   a. 查本地快取
   b. 無快取 → 呼叫 API → 解析入庫 → 寫快取
5. 更新 sync_cursor

使用者觸發（輸入新 profile_id）：
1. GET /players/{id} 驗證
2. GET /players/{id}/games 拉取近期對戰清單
3. 背景佇列拉取 Summary
4. 前端輪詢或 WebSocket 通知同步進度
```

**初次全量**：優先用 dumps 匯入歷史，再用 API 補近期；不要對 Summary 做 bulk crawl。

---

## 8. 後端 API 設計（規劃）

### 8.1 玩家與同步

```
GET  /api/v1/players/{profileId}           # 玩家基本資料
POST /api/v1/players/{profileId}/sync      # 觸發該玩家資料同步
GET  /api/v1/players/{profileId}/sync-status  # 同步進度
```

### 8.2 分析查詢

```
GET /api/v1/analytics/resource-timeline
  ?profileId=10861747&civ=en&resources=wood,gold&dateFrom=...&dateTo=...

GET /api/v1/analytics/military-loss-ratio
  ?profileId=10861747&playerCiv=fr&opponentCivs=en,hre&leaderboard=rm_1v1

GET /api/v1/analytics/matchup-matrix
  ?profileId=10861747&leaderboard=rm_1v1&patch=10257

GET /api/v1/games?profileId=10861747&page=0&size=20

GET /api/v1/meta/filters
  → 回傳可選文明、地圖、補丁清單
```

### 8.3 單場詳情

```
GET /api/v1/games/{gameId}?profileId=10861747
GET /api/v1/games/{gameId}/timeline?profileId=10861747
```

---

## 9. 前端頁面規劃

### 9.1 全域元件

| 元件 | 說明 |
|------|------|
| **ProfileId 搜尋列** | 輸入框 + 搜尋按鈕，支援直接輸入 ID 或玩家名稱（名稱需先呼叫 search API） |
| 篩選器列 | 文明、對手文明、模式、地圖、補丁、時間範圍、Rating 區間 |

### 9.2 核心頁面

| 頁面 | 圖表 | 查詢範例 |
|------|------|----------|
| 總覽 | KPI 卡片 | 勝率、場次、常用文明 |
| 資源曲線 | 多線折線圖 | 選文明後，wood/gold 隨分鐘變化 |
| 文明對戰軍損 | 堆疊長條 / 熱力圖 | 用法國 vs 各文明軍事分數差 |
| 建造偏好 | 樹狀圖 / Sankey | 第 8–12 分鐘常造哪些單位 |
| Matchup Matrix | 熱力圖 | civ A vs civ B 勝率 |
| 對戰列表 | 表格 | 近 50 場，可點入單場 |
| 單場詳情 | 時間軸疊圖 | 雙方資源/軍值對比 |

---

## 10. 風險與因應

| 風險 | 影響 | 因應 |
|------|------|------|
| Summary API 限速/封鎖 | 資料不完整 | 快取、佇列、聯繫官方、優先同步關注玩家 |
| Summary 非公開 API | 介面變動 | 保留 `raw_game_summary` 原始 JSON |
| 文明加成影響資源計算 | 數據有偏差 | UI 標註「估算值」 |
| H2 效能瓶頸 | 查詢變慢 | 索引優化、預聚合、遷 PostgreSQL |
| 私人對戰無法取得 | 樣本偏誤 | 需使用者提供 api_key |
| 輸入無效 profile_id | 使用者體驗差 | 前端驗證 + 友善錯誤訊息 |

---

## 11. 環境設定（規劃）

```yaml
# application.yml 範例
aoe4:
  api:
    base-url: https://aoe4world.com/api/v0
    user-agent: "AOE4-Analytics/1.0 (contact: your@email.com)"
    summary-rate-limit-ms: 2000
  sync:
    default-profile-ids:
      - 10861747
    cron: "0 */30 * * * *"  # 每 30 分鐘
  cache:
    summary-ttl-hours: 168  # 7 天

spring:
  datasource:
    url: jdbc:h2:file:./data/aoe4db
    driver-class-name: org.h2.Driver
  h2:
    console:
      enabled: true
      path: /h2-console
```

---

## 12. 相關連結

- [AoE4 World API 文件](https://www.aoe4world.com/api)
- [AoE4 World FAQ（Summary 說明）](https://aoe4world.com/faq)
- [AoE4 World Data（單位/建築 JSON）](https://data.aoe4world.com/)
- [AoE4 World Data Dumps](https://aoe4world.com/dumps)
- [aoe4world/data GitHub](https://github.com/aoe4world/data)
