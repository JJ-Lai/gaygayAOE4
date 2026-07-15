# Phase 4：前端儀表板

| 項目 | 內容 |
|------|------|
| 預估時間 | 3 週 |
| 前置條件 | Phase 3 完成 |
| 範例 profile_id | `10861747`（開發預設值，正式支援任意輸入） |
| 狀態 | ⬜ 未開始 |

## 目標

建立 React 前端，提供 **profile_id 輸入搜尋**，並以圖表呈現多維度對戰分析。

## 任務清單

### 專案初始化

- [ ] 建立 `aoe4-frontend/`（Vite + React 18 + TypeScript）
- [ ] 設定 ESLint、Prettier
- [ ] 安裝 UI 函式庫（Ant Design 或 shadcn/ui）
- [ ] 安裝 ECharts（`echarts-for-react`）或 Recharts
- [ ] 安裝 axios 或 fetch wrapper
- [ ] 設定 API Base URL（proxy 或 env：`VITE_API_BASE_URL`）
- [ ] 設定路由（React Router）

### 核心：玩家搜尋

- [ ] 建立 `ProfileSearchBar` 元件
  - [ ] 輸入框：接受 `profile_id`（純數字）
  - [ ] 搜尋按鈕
  - [ ] 開發期預填 `10861747`（可用 env 控制）
  - [ ] Enter 鍵觸發搜尋
- [ ] 搜尋流程：
  1. [ ] 呼叫 `GET /api/v1/players/{profileId}` 驗證玩家
  2. [ ] 若無資料或過舊 → 呼叫 `POST /api/v1/players/{profileId}/sync`
  3. [ ] 輪詢 `GET /api/v1/players/{profileId}/sync-status` 顯示進度
  4. [ ] 完成後導向該玩家儀表板 `/player/{profileId}`
- [ ] 錯誤處理：無效 ID、API 失敗、同步逾時
- [ ] （可選）玩家名稱搜尋：呼叫 search API → 選取後帶入 profileId

### 版面與導覽

- [ ] 建立 `AppLayout`（頂部搜尋列 + 側邊導覽）
- [ ] 路由規劃：
  - [ ] `/` — 首頁（搜尋 + 說明）
  - [ ] `/player/:profileId` — 總覽
  - [ ] `/player/:profileId/resources` — 資源曲線
  - [ ] `/player/:profileId/matchups` — 文明對戰
  - [ ] `/player/:profileId/games` — 對戰列表
  - [ ] `/player/:profileId/games/:gameId` — 單場詳情
- [ ] URL 中的 `profileId` 為唯一真實來源（可分享連結）

### 全域篩選器

- [ ] 建立 `FilterPanel` 元件
- [ ] 篩選項：文明、對手文明、模式、地圖、補丁、時間範圍
- [ ] 篩選變更時重新 fetch 分析 API
- [ ] 從 `GET /api/v1/meta/filters` 載入選項

### 頁面：總覽

- [ ] `OverviewPage`
- [ ] KPI 卡片：總場次、勝率、最常用文明
- [ ] 近期勝負趨勢（簡易折線或長條）
- [ ] 資料來源：`GET /api/v1/analytics/overview`

### 頁面：資源曲線

- [ ] `ResourceTimelinePage`
- [ ] 多線折線圖（X=分鐘, Y=累積資源花費）
- [ ] 可切換資源類型（wood, gold, food, stone）
- [ ] 可選文明篩選
- [ ] 資料來源：`GET /api/v1/analytics/resource-timeline`
- [ ] 圖表標註：「資源為估算值」

### 頁面：文明 Matchup

- [ ] `MatchupPage`
- [ ] 熱力圖：文明 vs 文明勝率
- [ ] 表格：對手文明、場次、勝率、軍事分數差
- [ ] 資料來源：`GET /api/v1/analytics/matchup-matrix`
- [ ] 資料來源：`GET /api/v1/analytics/military-loss-ratio`

### 頁面：建造偏好（可選 MVP）

- [ ] `BuildPreferencesPage`
- [ ] 時間區間滑桿（分鐘）
- [ ] 長條圖或樹狀圖顯示常造單位
- [ ] 資料來源：`GET /api/v1/analytics/build-preferences`

### 頁面：對戰列表

- [ ] `GameListPage`
- [ ] 表格：日期、對手、文明、勝負、地圖
- [ ] 分頁
- [ ] 點擊進入單場詳情
- [ ] 資料來源：`GET /api/v1/games?profileId=`

### 頁面：單場詳情

- [ ] `GameDetailPage`
- [ ] 雙方資源曲線疊圖
- [ ] 雙方軍值曲線疊圖
- [ ] 建造事件時間軸
- [ ] 資料來源：`GET /api/v1/games/{gameId}/timeline`

### 共用元件

- [ ] `LoadingSpinner` / 骨架屏
- [ ] `ErrorAlert`
- [ ] `EmptyState`（無資料提示）
- [ ] `SyncProgressBar`（同步中顯示）

### 狀態管理

- [ ] 選定方案：React Context 或 Zustand（輕量）
- [ ] 儲存：當前 profileId、篩選條件
- [ ] （可選）localStorage 記住最近搜尋的 profileId

### 樣式與 UX

- [ ] 響應式版面（桌機優先，平板可用）
- [ ] 深色/淺色主題（可選）
- [ ] 載入與錯誤狀態友善提示

### 建置與部署

- [ ] `npm run build` 產出靜態檔
- [ ] 設定 Spring Boot 靜態資源服務或獨立部署
- [ ] CORS 設定（若前後端分離）

### 測試

- [ ] 手動測試：輸入 `10861747` 完整流程
- [ ] 手動測試：輸入無效 ID
- [ ] 手動測試：輸入其他有效 profileId
- [ ] （可選）Playwright / Cypress E2E

## 產出物

| 產出 | 說明 |
|------|------|
| React SPA | 可 build 並部署 |
| Profile ID 搜尋 | 核心入口功能 |
| 分析儀表板 | 總覽、資源、matchup、列表、單場 |
| 圖表元件 | ECharts 整合 |

## 完成標準（Definition of Done）

- [ ] 首頁可輸入任意 `profile_id` 並搜尋
- [ ] 輸入 `10861747` 可看到完整儀表板
- [ ] 資源曲線頁有互動圖表
- [ ] Matchup 頁有勝率資料
- [ ] 對戰列表可點入單場詳情
- [ ] 同步中顯示進度，完成後自動載入
- [ ] 無效 ID 有清楚錯誤提示

## 頁面線框（簡述）

```
┌─────────────────────────────────────────────────────┐
│  [ 輸入 Profile ID ________ ]  [ 搜尋 ]              │
├──────────┬──────────────────────────────────────────┤
│ 總覽     │  KPI: 勝率 62% | 場次 150 | 主文明: 英格蘭  │
│ 資源曲線 │  ┌─────────────────────────────────────┐  │
│ Matchup  │  │     📈 資源累積曲線圖               │  │
│ 對戰列表 │  └─────────────────────────────────────┘  │
│          │  [文明▼] [模式▼] [時間範圍]              │
└──────────┴──────────────────────────────────────────┘
```

## 備註

- **profile_id 輸入是核心 UX**，所有分析頁面皆從 URL `/player/:profileId` 取得 ID
- 開發期可在 `.env.development` 設定 `VITE_DEFAULT_PROFILE_ID=10861747` 方便測試
- 圖表資料格式應與 Phase 3 API 回傳一致，避免前端再做複雜轉換

## 下一步

完成後進入 [Phase 5：優化與擴充](./PHASE-5-optimization.md)
