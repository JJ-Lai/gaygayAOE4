# 專案進度追蹤

> 範例玩家：`10861747` | 最終產品：網頁輸入任意 `profile_id` 搜尋分析

## 階段總覽

| 階段 | 名稱 | 預估時間 | 狀態 | 開始日期 | 完成日期 |
|------|------|----------|------|----------|----------|
| [Phase 0](./phases/PHASE-0-preparation.md) | 前期準備 | 1 週 | ⬜ 未開始 | | |
| [Phase 1](./phases/PHASE-1-foundation.md) | 基礎骨架與對戰清單同步 | 2 週 | ⬜ 未開始 | | |
| [Phase 2](./phases/PHASE-2-summary-ingest.md) | Summary 解析與入庫 | 3 週 | ⬜ 未開始 | | |
| [Phase 3](./phases/PHASE-3-analytics-api.md) | 分析 API | 2 週 | ⬜ 未開始 | | |
| [Phase 4](./phases/PHASE-4-frontend.md) | 前端儀表板 | 3 週 | ⬜ 未開始 | | |
| [Phase 5](./phases/PHASE-5-optimization.md) | 優化與擴充 | 持續 | ⬜ 未開始 | | |

**狀態圖例：** ⬜ 未開始 | 🔄 進行中 | ✅ 完成 | ⏸️ 暫停

## MVP 里程碑

- [ ] **M1**：`10861747` 對戰清單可同步入 H2（Phase 1）
- [ ] **M2**：至少 5 場對戰有完整 Summary 時間序列（Phase 2）
- [ ] **M3**：分析 API 可回傳資源曲線與 matchup（Phase 3）
- [ ] **M4**：網頁可輸入 profile_id 並看到儀表板（Phase 4）

## 當前焦點

```
下一步：Phase 0 — 抓取 API 樣本、確認 MVP 範圍
```

## 決策紀錄

| 日期 | 決策 | 說明 |
|------|------|------|
| 2026-07-15 | 範例 profile_id = 10861747 | 開發測試用 |
| 2026-07-15 | 支援網頁輸入任意 ID | 正式產品核心 UX |
| 2026-07-15 | MVP 模式先支援 rm_1v1 | 可後續擴充 |
| 2026-07-15 | 資料庫先用 H2 File Mode | 個人分析足夠，可遷 PG |

## 相關文件

- [技術參考文件](./REFERENCE.md)
- [文件索引](./README.md)

## 更新日誌

| 日期 | 更新內容 |
|------|----------|
| 2026-07-15 | 建立專案文件與 Phase 0–5 追蹤檔 |
