# Phase 3：分析 API

| 項目 | 內容 |
|------|------|
| 預估時間 | 2 週 |
| 前置條件 | Phase 2 完成（至少 `10861747` 有 Summary 資料） |
| 範例 profile_id | `10861747` |
| 狀態 | ⬜ 未開始 |

## 目標

實作聚合查詢服務與 REST API，支援多維度分析查詢，供前端圖表使用。

## 任務清單

### 分析服務層

- [ ] 建立 `AnalyticsService`（或按領域拆分）
- [ ] 建立查詢 DTO / 回應 DTO
- [ ] 建立共用的篩選條件物件 `AnalyticsFilter`（profileId, civ, dateRange, leaderboard, patch...）

### 資源時間序列

- [ ] 實作 `getResourceTimeline(filter)`
- [ ] 支援參數：profileId, civ, resources[], dateFrom, dateTo, leaderboard
- [ ] 聚合邏輯：多場對戰取平均或中位數曲線
- [ ] 回傳格式：`[{ minute, resource, value, gameCount }]`
- [ ] 建立 Repository 查詢（JPA Criteria 或 `@Query` native SQL）

### 文明 Matchup 分析

- [ ] 實作 `getMatchupMatrix(filter)`
- [ ] 計算：玩家文明 vs 對手文明 → 勝率、場次、平均軍事分數差
- [ ] 回傳格式：二維矩陣或 `{ playerCiv, opponentCiv, wins, losses, winRate, avgMilitaryDiff }`
- [ ] 可選：直接代理 AoE4 World `/stats/{leaderboard}/matchups` 作為參考對照

### 軍事損失 / 分數比

- [ ] 實作 `getMilitaryLossRatio(filter)`
- [ ] 依對手文明分組，計算軍事分數差、勝率
- [ ] 若有 `fact_build_event` 資料，可擴充單位層級損失統計

### 勝率與總覽統計

- [ ] 實作 `getPlayerOverview(profileId)`
- [ ] 回傳：總場次、勝率、最常用文明、近期趨勢
- [ ] 實作 `getCivStats(profileId)` — 各文明勝率、場次

### 建造偏好

- [ ] 實作 `getBuildPreferences(filter)`
- [ ] 依時間區間（例如 8–12 分鐘）統計常造單位/建築
- [ ] 回傳格式適合 Sankey 或樹狀圖

### 單場時間軸

- [ ] 實作 `getGameTimeline(gameId, profileId)`
- [ ] 回傳雙方資源曲線、軍值曲線、關鍵建造事件

### 元資料 API

- [ ] `GET /api/v1/meta/filters` — 可選文明、地圖、補丁、模式清單
- [ ] `GET /api/v1/meta/civilizations`
- [ ] `GET /api/v1/meta/maps`

### REST Controllers

- [ ] `AnalyticsController` — 上述分析端點
- [ ] 統一錯誤處理（無資料、無效 profileId、參數驗證）
- [ ] 分頁支援（對戰列表）
- [ ] 更新 OpenAPI 文件

### 效能

- [ ] 為常用查詢欄位加索引確認
- [ ] 評估是否需要預聚合表（可延後至 Phase 5）
- [ ] 查詢逾時設定

### 測試

- [ ] 單元測試：聚合邏輯（使用測試資料）
- [ ] 整合測試：`profileId=10861747` 各 API 端點
- [ ] Postman / HTTP 檔案集合（`docs/api/` 或 `http/`）

## API 端點清單

```
GET /api/v1/analytics/overview?profileId=10861747
GET /api/v1/analytics/resource-timeline?profileId=10861747&civ=en&resources=wood,gold
GET /api/v1/analytics/matchup-matrix?profileId=10861747&leaderboard=rm_1v1
GET /api/v1/analytics/military-loss-ratio?profileId=10861747&playerCiv=fr
GET /api/v1/analytics/build-preferences?profileId=10861747&minuteFrom=8&minuteTo=12
GET /api/v1/games/{gameId}/timeline?profileId=10861747
GET /api/v1/meta/filters
```

## 產出物

| 產出 | 說明 |
|------|------|
| Analytics Service | 聚合查詢邏輯 |
| REST API | 前端可直接串接 |
| OpenAPI 文件 | 完整端點說明 |
| API 測試集合 | 方便回歸測試 |

## 完成標準（Definition of Done）

- [ ] 所有上述端點對 `10861747` 可回傳有效 JSON
- [ ] `resource-timeline` 回傳分鐘級曲線資料
- [ ] `matchup-matrix` 回傳文明對戰勝率
- [ ] 無效 `profileId` 回傳 404 與清楚錯誤訊息
- [ ] OpenAPI UI 可測試所有端點

## 查詢維度支援矩陣

| 維度 | overview | resource-timeline | matchup | military-loss | build-pref |
|------|----------|-------------------|---------|---------------|------------|
| profileId | ✅ | ✅ | ✅ | ✅ | ✅ |
| 文明 | — | ✅ | ✅ | ✅ | ✅ |
| 對手文明 | — | — | ✅ | ✅ | — |
| 時間範圍 | ✅ | ✅ | ✅ | ✅ | ✅ |
| leaderboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| 補丁 | — | ✅ | ✅ | — | — |
| 分鐘區間 | — | — | — | — | ✅ |

## 備註

- 所有分析 API 皆以 `profileId` 為必要或主要參數，對應網頁輸入 ID 的使用情境
- 回傳格式設計需考慮 ECharts 直接可用的結構

## 下一步

完成後進入 [Phase 4：前端儀表板](./PHASE-4-frontend.md)
