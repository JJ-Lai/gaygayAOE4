# AOE4 對戰數據分析系統

從 [AoE4 World](https://aoe4world.com) 抓取對戰數據，存入 H2 資料庫，並以 Maven 後端 + React 前端提供多維度統計分析。

## 快速開始

開發文件位於 [`docs/`](./docs/) 目錄：

| 文件 | 說明 |
|------|------|
| [docs/TRACKING.md](./docs/TRACKING.md) | **進度追蹤總表** |
| [docs/REFERENCE.md](./docs/REFERENCE.md) | 完整技術參考 |
| [docs/phases/](./docs/phases/) | 各階段執行清單（含 checkbox） |

## 範例玩家

- 開發測試 `profile_id`：**10861747**
- 正式產品：網頁輸入任意 `profile_id` 即可搜尋分析

## 執行階段

```
Phase 0 前期準備 → Phase 1 基礎骨架 → Phase 2 Summary 入庫
    → Phase 3 分析 API → Phase 4 前端儀表板 → Phase 5 優化擴充
```

## 技術棧

Spring Boot 3 + Maven + H2 + Flyway + React + TypeScript + ECharts
