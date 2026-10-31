# 世紀帝國 IV 對戰數據分析系統 — 文件索引

本目錄包含系統開發的參考文件與分階段執行追蹤清單。

## 範例玩家

| 項目 | 值 |
|------|-----|
| 範例 `profile_id` | `10861747` |
| 用途 | 開發、測試、API 樣本抓取 |
| 最終產品行為 | 網頁提供輸入框，使用者輸入任意 `profile_id` 即可搜尋與分析 |

## 文件清單

| 文件 | 說明 |
|------|------|
| [REFERENCE.md](./REFERENCE.md) | 完整技術參考：架構、技術棧、資料庫、API、風險 |
| [SUMMARY-API-GUIDE.md](./SUMMARY-API-GUIDE.md) | **Game Summary API 取得指南**（端點、api_key、404 原因） |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | 部署指南（本地、Docker、備份） |
| [PRODUCTION-SECRETS.md](./PRODUCTION-SECRETS.md) | 正式環境 secrets 與備份排程 |
| [phases/PHASE-0-preparation.md](./phases/PHASE-0-preparation.md) | Phase 0：前期準備 |
| [phases/PHASE-1-foundation.md](./phases/PHASE-1-foundation.md) | Phase 1：基礎骨架與對戰清單同步 |
| [phases/PHASE-2-summary-ingest.md](./phases/PHASE-2-summary-ingest.md) | Phase 2：Summary 解析與入庫 |
| [phases/PHASE-3-analytics-api.md](./phases/PHASE-3-analytics-api.md) | Phase 3：分析 API |
| [phases/PHASE-4-frontend.md](./phases/PHASE-4-frontend.md) | Phase 4：前端儀表板 |
| [phases/PHASE-5-optimization.md](./phases/PHASE-5-optimization.md) | Phase 5：優化與擴充 |
| [phases/PHASE-6-enhancements.md](./phases/PHASE-6-enhancements.md) | Phase 6：體驗深化與維運整合 |
| [phases/PHASE-7-production.md](./phases/PHASE-7-production.md) | Phase 7：分析深化與生產部署 |
| [phases/PHASE-8-sharing.md](./phases/PHASE-8-sharing.md) | Phase 8：分享與多人對戰 |
| [phases/PHASE-9-kubernetes.md](./phases/PHASE-9-kubernetes.md) | Phase 9：2v2 分組與 Kubernetes |

## 執行順序

```
Phase 0 → … → Phase 6（持續）→ Phase 7（持續）
```

## 建議 MVP 範圍

- 追蹤玩家：網頁輸入 `profile_id`（開發期以 `10861747` 為預設）
- 模式：先支援 `rm_1v1`
- 分析：資源曲線、文明 matchup、近場次列表與單場詳情

## 外部資源

- [AoE4 World API](https://www.aoe4world.com/api)
- [AoE4 World Data（靜態遊戲資料）](https://data.aoe4world.com/)
- [AoE4 World Data Dumps（季賽批量資料）](https://aoe4world.com/dumps)
