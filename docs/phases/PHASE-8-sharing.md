# Phase 8：分享與多人對戰

| 項目 | 內容 |
|------|------|
| 預估時間 | 持續進行 |
| 前置條件 | Phase 7 核心完成 |
| 狀態 | ✅ 核心完成 |

## 目標

支援 2v2 / 多人對戰的對手切換，並提供爬蟲可讀的分享預覽頁（OG HTML）。

## 任務清單

### 分享

- [x] `GET /share/player/{profileId}/games/{gameId}` — 伺服器端 OG HTML + 自動導向 SPA
- [x] 複製分享連結改用 `/share/...` 路徑
- [x] Vite dev proxy `/share` → 8080

### 多人對戰

- [x] `GameTimelineView.availableOpponents` — 可選對手清單
- [x] `GET /timeline?opponentProfileId=` — 指定對比對手
- [x] 前端對手下拉選單 + URL `?opponent=`

### 測試

- [x] 整合測試：多對手、分享預覽 HTML
- [x] E2E：對手選擇器

### 待迭代

- [ ] `og:image` 動態圖表截圖（依對戰資料生成）

## 完成標準

- 多人對戰可切換對比對手
- 分享連結在 Discord / Slack 可顯示標題與描述（透過 `/share` 頁）
