# Phase 2：Summary 解析與入庫

| 項目 | 內容 |
|------|------|
| 預估時間 | 3 週 |
| 前置條件 | Phase 1 完成 |
| 範例 profile_id | `10861747` |
| 狀態 | ⬜ 未開始 |

## 目標

實作 Game Summary API 的限速抓取、JSON 解析，並將資源時間序列、建造事件、分數等寫入 H2。

## 任務清單

### 資料庫擴充

- [ ] `V4__dim_game_objects.sql`：dim_resource_type, dim_unit, dim_building, dim_technology, dim_time_bucket
- [ ] `V5__fact_detail_tables.sql`：fact_game_player_score, fact_game_player_resource, fact_game_player_army_value, fact_build_event
- [ ] `V6__raw_summary.sql`：raw_game_summary
- [ ] 建立對應 JPA Entity 與 Repository
- [ ] 建立必要索引（game_id, player_id, minute 等）

### 靜態遊戲資料匯入

- [ ] 建立 `StaticDataImportService`
- [ ] 從 data.aoe4world.com 下載單位清單（`/units/all-unified.json` 或類似）
- [ ] 從 data.aoe4world.com 下載建築、科技清單
- [ ] 匯入 `dim_unit`, `dim_building`, `dim_technology`
- [ ] 匯入 `dim_resource_type`（food, wood, gold, stone）
- [ ] 建立 `dim_civilization` 種子資料（若 Phase 1 尚未完整）

### Summary API Client

- [ ] 實作 `getGameSummary(profileId, gameId)` — `?camelize=true`
- [ ] 整合 Caffeine 本地快取（TTL 7 天）
- [ ] 實作 Summary 請求佇列（限速 ≥ 2 秒/請求）
- [ ] 處理 429：指數退避 + negative cache（3 分鐘）
- [ ] 支援可選 `api_key` 參數（私人對戰）
- [ ] 原始 JSON 寫入 `raw_game_summary`

### Summary 解析器

- [ ] 建立 `SummaryParser`（依 Phase 0 樣本 JSON 設計）
- [ ] 解析玩家終局分數 → `fact_game_player_score`
- [ ] 解析資源時間序列 → `fact_game_player_resource`
- [ ] 解析軍隊價值時間序列 → `fact_game_player_army_value`
- [ ] 解析建造事件 → `fact_build_event`
- [ ] 處理欄位缺失 / 格式異常（記錄 log，不阻斷整批）
- [ ] 單元測試：使用 `samples/` 內真實 JSON

### Summary 同步服務

- [ ] 建立 `SummarySyncService`
- [ ] 掃描 `fact_game` 中尚未有 summary 的對戰
- [ ] 佇列化處理，避免重複請求（in-flight 去重）
- [ ] 整合至現有排程或獨立 Worker
- [ ] 記錄每場同步狀態（成功/失敗/待重試）

### 歷史資料（可選）

- [ ] 評估從 [dumps](https://aoe4world.com/dumps) 匯入季賽 JSON
- [ ] 建立 `DumpImportService`（若決定使用）
- [ ] 匯入 `10861747` 相關歷史對戰（若有）

### REST API 擴充

- [ ] `GET /api/v1/players/{profileId}/sync-status` — 同步進度（清單/synced/summary pending）
- [ ] `GET /api/v1/games/{gameId}?profileId=` — 單場基本資料 + 是否有 summary

### 測試

- [ ] 單元測試：SummaryParser 各欄位解析
- [ ] 整合測試：同步 `10861747` 一場對戰的完整 Summary
- [ ] 驗證 `fact_game_player_resource` 有分鐘級資料
- [ ] 驗證快取命中時不重複呼叫 API

## 產出物

| 產出 | 說明 |
|------|------|
| Summary 同步管線 | 限速、快取、佇列、入庫 |
| 靜態遊戲物件維度 | 單位、建築、科技、資源 |
| 時間序列事實表 | 資源、軍值、建造事件 |
| 同步狀態 API | 前端可查詢進度 |

## 完成標準（Definition of Done）

- [ ] `10861747` 至少 5 場對戰有完整 Summary 入庫
- [ ] `fact_game_player_resource` 可查詢分鐘級 wood/gold 等資料
- [ ] `fact_build_event` 有單位/建築建造紀錄
- [ ] Summary 請求有快取，重複查詢不打 API
- [ ] 429 時系統不崩潰，會延遲重試

## 資料表（本階段新增）

```
dim_resource_type
dim_unit
dim_building
dim_technology
dim_time_bucket
fact_game_player_score
fact_game_player_resource
fact_game_player_army_value
fact_build_event
raw_game_summary
```

## 風險提醒

| 風險 | 因應 |
|------|------|
| Summary API 未公開文件 | 保留 raw JSON，Parser 版本化 |
| 429 封鎖 | 嚴格限速、快取、必要時聯繫官方 |
| JSON 結構變動 | 以 samples 為基準寫測試，變動時測試會失敗 |

## 備註

- Summary 是 CPU 密集端點，**絕不可** bulk crawl
- 使用者日後在網頁輸入新 `profile_id` 時，Summary 同步會在背景佇列執行

## 下一步

完成後進入 [Phase 3：分析 API](./PHASE-3-analytics-api.md)
