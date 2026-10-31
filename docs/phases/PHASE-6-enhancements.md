# Phase 6：體驗深化與維運整合

| 項目 | 內容 |
|------|------|
| 預估時間 | 持續進行 |
| 前置條件 | Phase 5 核心完成 |
| 狀態 | 🔄 進行中 → 核心完成 |

## 目標

在 MVP 與 Phase 5 維運基礎上，深化單場對戰分析體驗，並完善生產部署與資料修復工具。

## 任務清單

### 單場對戰回放

- [x] 建造/損失事件顯示名稱（`TimelineBuildEvent.displayName`）
- [x] 單場戰鬥統計（`GameDetailView.combatStats`）
- [x] 前端單場詳情：事件類型著色、損失事件篩選
- [x] 單場資源/軍隊圖表匯出 PNG
- [x] 對戰詳情分享連結
- [x] 建造事件「僅損失」篩選

### 資料修復

- [x] 重新解析已入庫 Summary（`POST /ops/reparse-summaries`）
- [x] 批次為歷史對戰補抓 destroyed 事件（文件說明）

### 部署與監控

- [x] `docker-compose.full.yml`（應用 + Prometheus + Grafana）
- [x] GitHub Actions 建置 Docker image
- [x] 健康檢查告警與 Slack 整合範例

### 文件

- [x] Phase 6 追蹤文件
- [x] TRACKING / CHANGELOG 更新

## 完成標準

- 玩家 `1224481` 單場詳情可看到資源曲線、軍隊價值、建造/損失時間軸
- Ops 可一鍵重新解析 Summary 以補齊 `destroyed[]` 資料
- `docker compose -f docker-compose.full.yml up` 可同時啟動應用與監控
