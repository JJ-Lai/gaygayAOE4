# Phase 7：分析深化與生產部署

| 項目 | 內容 |
|------|------|
| 預估時間 | 持續進行 |
| 前置條件 | Phase 6 核心完成 |
| 狀態 | 🔄 進行中 |

## 目標

補齊 REFERENCE 規劃的單場雙方對比體驗，並完善 PostgreSQL 生產堆疊與部署自動化。

## 任務清單

### 單場分析深化

- [x] `GameTimelineView.opponent` — 對手資源/軍隊時間軸
- [x] 前端單場詳情：雙方資源/軍隊疊圖（實線 vs 虛線）
- [x] 分享頁面 title / description meta
- [x] 雙方建造事件並排時間軸
- [x] 單場詳情 OG meta（`og:title` / `og:description` / `og:url`，客戶端）

### 生產部署

- [x] `docker-compose.postgres.full.yml`（PostgreSQL + 應用 + 監控）
- [x] GitHub Actions 推送 GHCR image（main 分支）
- [x] `scripts/smoke-test.ps1` — 部署後健康檢查
- [x] 正式環境 secrets 與備份排程文件（`docs/PRODUCTION-SECRETS.md`）
- [x] `scripts/verify-player-sample.ps1` — 公開樣本玩家驗證

### 測試

- [x] 整合測試：timeline 含 opponent
- [x] E2E：雙方對比圖表標題
- [x] E2E：雙方建造事件並排

## 完成標準

- 1v1 對戰且雙方皆有 Summary 時，單場詳情可並排比較資源、軍隊與建造事件
- `docker compose -f docker-compose.postgres.full.yml up` 可啟動完整生產堆疊
- push 至 `main` 後 GHCR 可取得 `latest` image

| 狀態 | ✅ 核心完成 |
