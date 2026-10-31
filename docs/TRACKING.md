# 專案進度追蹤

> 範例玩家：`10861747` | 最終產品：網頁輸入任意 `profile_id` 搜尋分析

## 階段總覽

| 階段 | 名稱 | 預估時間 | 狀態 | 開始日期 | 完成日期 |
|------|------|----------|------|----------|----------|
| [Phase 0](./phases/PHASE-0-preparation.md) | 前期準備 | 1 週 | ✅ 完成 | 2026-07-15 | 2026-07-15 |
| [Phase 1](./phases/PHASE-1-foundation.md) | 基礎骨架與對戰清單同步 | 2 週 | ✅ 完成 | 2026-07-15 | 2026-07-15 |
| [Phase 2](./phases/PHASE-2-summary-ingest.md) | Summary 解析與入庫 | 3 週 | ✅ 完成 | 2026-07-15 | 2026-07-15 |
| [Phase 3](./phases/PHASE-3-analytics-api.md) | 分析 API | 2 週 | ✅ 完成 | 2026-07-15 | 2026-07-15 |
| [Phase 4](./phases/PHASE-4-frontend.md) | 前端儀表板 | 3 週 | ✅ 完成 | 2026-07-15 | 2026-07-15 |
| [Phase 5](./phases/PHASE-5-optimization.md) | 優化與擴充 | 持續 | ✅ 核心完成 | 2026-07-15 | 2026-07-15 |
| [Phase 6](./phases/PHASE-6-enhancements.md) | 體驗深化與維運整合 | 持續 | ✅ 核心完成 | 2026-07-15 | 2026-07-15 |
| [Phase 7](./phases/PHASE-7-production.md) | 分析深化與生產部署 | 持續 | ✅ 核心完成 | 2026-07-15 | 2026-07-15 |
| [Phase 8](./phases/PHASE-8-sharing.md) | 分享與多人對戰 | 持續 | ✅ 核心完成 | 2026-07-15 | 2026-07-15 |
| [Phase 9](./phases/PHASE-9-kubernetes.md) | 2v2 分組與 Kubernetes | 持續 | ✅ 核心完成 | 2026-07-15 | 2026-07-15 |

**狀態圖例：** ⬜ 未開始 | 🔄 進行中 | ✅ 完成 | ⏸️ 暫停

## MVP 里程碑

- [x] **M1**：`10861747` 對戰清單可同步入 H2（Phase 1）— 已同步 47 場
- [x] **M2**：至少 5 場對戰有完整 Summary 時間序列（Phase 2）— 公開對戰樣本 5 場入庫驗證
- [x] **M3**：分析 API 可回傳資源曲線與 matchup（Phase 3）
- [x] **M4**：網頁可輸入 profile_id 並看到儀表板（Phase 4）

## 當前焦點

```
Phase 9 核心已完成；可選迭代：動態 og:image、Helm 監控 subchart、External Secrets
```

測試狀態（2026-07-15）：`mvn -pl aoe4-api -am test` 通過；`npm run test:e2e` 10/10 通過。

## 決策紀錄

| 日期 | 決策 | 說明 |
|------|------|------|
| 2026-07-15 | 範例 profile_id = 10861747 | 開發測試用 |
| 2026-07-15 | 支援網頁輸入任意 ID | 正式產品核心 UX |
| 2026-07-15 | MVP 模式先支援 rm_1v1 | 可後續擴充 |
| 2026-07-15 | 資料庫先用 H2 File Mode | 個人分析足夠，可遷 PG |
| 2026-07-15 | Java 17（非 21） | 本機環境可用 JDK 17 |
| 2026-07-15 | Summary 端點路徑 | `/players/{id}/games/{gid}/summary`（非 `/api/v0/`） |

## 本地啟動

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
cd aoe4-api
mvn spring-boot:run
```

- API：http://localhost:8080
- Swagger：http://localhost:8080/swagger-ui.html
- H2 Console：http://localhost:8080/h2-console

### 前端（開發）

```powershell
cd aoe4-frontend
npm install
npm run dev   # http://localhost:5173，/api 代理至 8080
```

- 預設 profile_id：`.env.development` 的 `VITE_DEFAULT_PROFILE_ID=10861747`
- 正式建置：`npm run build` → `aoe4-frontend/dist/`

## 相關文件

- [技術參考文件](./REFERENCE.md)
- [Summary API 指南](./SUMMARY-API-GUIDE.md)
- [文件索引](./README.md)

## 更新日誌

| 日期 | 更新內容 |
|------|----------|
| 2026-07-15 | 建立專案文件與 Phase 0–5 追蹤檔 |
| 2026-07-15 | 完成 Phase 3：分析 API（overview、資源曲線、matchup、建造偏好、單場時間軸、meta） |
| 2026-07-15 | 完成 Phase 4：React 儀表板（搜尋、總覽、資源曲線、matchup、對戰列表、單場詳情、建造偏好） |
| 2026-07-15 | Phase 5 啟動：玩家名稱搜尋、Docker Compose、V8 索引、Summary 同步重試、部署文件 |
| 2026-07-15 | Phase 5：預聚合表 V9、刷新排程、分析 API 快取、同步後自動刷新 |
| 2026-07-15 | Phase 5：Prometheus 指標、Playwright E2E（3 項通過） |
| 2026-07-15 | Phase 5：GitHub Actions CI、CSV 匯出（matchup / 對戰列表） |
| 2026-07-15 | Phase 5：玩家比較頁、Summary API Key 設定 |
| 2026-07-15 | Phase 5 收尾：地圖分析頁、JSON 匯出、Phase 5 核心標記完成 |
| 2026-07-15 | Phase 5：補丁分析、Rating 篩選、最愛玩家、說明頁、JSON 日誌 |
| 2026-07-15 | Phase 5：同步 Dashboard、模式/軍事分析頁、前端 code split |
| 2026-07-15 | Phase 5：PostgreSQL、戰鬥統計 V10、Ops 批次同步、負載測試腳本 |
| 2026-07-15 | Phase 6：單場戰鬥統計、建造事件顯示名稱、Ops 重新解析 Summary、`docker-compose.full.yml` |
| 2026-07-15 | Phase 6 收尾：圖表 PNG 匯出、分享連結、Docker CI、Prometheus 告警、單場 E2E |
| 2026-07-15 | Phase 7：雙方 timeline 對比、postgres.full Compose、GHCR push、smoke-test |
| 2026-07-15 | Phase 7 收尾：雙方建造事件、OG meta、verify-player-sample、PRODUCTION-SECRETS |
| 2026-07-15 | Phase 8：分享預覽 `/share/...`、多對手 timeline、前端對手切換 |
| 2026-07-15 | Phase 8 收尾：整合測試 + E2E 全綠、對手選擇器與分享頁驗證通過 |
| 2026-07-15 | Phase 9：2v2 隊友/敵方分組、og:image、Helm chart |
