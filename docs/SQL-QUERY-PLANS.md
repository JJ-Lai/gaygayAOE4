# SQL 查詢計畫檢視

## 概述

Ops API 對常用分析查詢執行 `EXPLAIN`，並量測聚合子查詢耗時，協助評估索引與預聚合效果。

## API

```
GET /api/v1/ops/query-plans?profileId={id}
```

回應範例：

```json
{
  "profileId": 1224481,
  "databaseProduct": "H2",
  "plans": [
    {
      "queryKey": "matchup-matrix",
      "description": "文明對戰矩陣",
      "executionMs": 12,
      "planLines": ["SELECT ...", "  |> INDEX SCAN ..."]
    }
  ],
  "checkedAt": "2026-07-15T11:00:00Z"
}
```

## 涵蓋查詢

| queryKey | 說明 | 相關索引 |
|----------|------|----------|
| `civ-stats` | 各文明勝率 | `idx_fgp_profile_civ` |
| `matchup-matrix` | 文明對戰矩陣 | `idx_fgp_profile_civ`, `idx_fgp_profile_game` |
| `resource-timeline` | 資源時間序列 | `idx_fpr_game_player`, `idx_fpr_minute` |
| `build-preferences` | 建造偏好 | `idx_fbe_game_player` |
| `unit-loss-stats` | 單位損失 | `idx_fbe_profile_kind` (V11) |
| `combat-stats` | 戰鬥統計 | `idx_combat_profile` |
| `agg-matchup-matrix` | 預聚合矩陣 | `idx_agg_mm_profile` |

## 使用方式

### 前端

1. 開啟 `/ops`
2. 在「SQL 查詢計畫檢視」輸入 Profile ID
3. 點「檢視執行計畫」，展開列查看 `EXPLAIN` 輸出

### 腳本

```powershell
.\scripts\explain-queries.ps1 -ProfileId 1224481
```

### curl

```powershell
curl "http://localhost:8080/api/v1/ops/query-plans?profileId=1224481"
```

## 效能建議

1. **無篩選時優先預聚合**：`matchup-matrix`、`resource-timeline` 在 `AnalyticsService` 會走 `agg_*` 表
2. **有 Rating / 日期篩選**：跳過預聚合，走即時查詢；注意 `executionMs` 是否 > 500ms
3. **單位損失查詢**：確保 V11 migration 已套用 `idx_fbe_profile_kind`
4. **PostgreSQL**：切換後重新執行本 API，比對 `planLines` 是否使用 Index Scan

## Prometheus 同步指標

`GET /api/v1/ops/sync-overview` 會更新以下 gauges：

| 指標 | 說明 |
|------|------|
| `aoe4_sync.games_without_summary` | 尚未嘗試 Summary 的對戰數 |
| `aoe4_sync.alert.count{code="exhausted_retries"}` | 重試用盡筆數 |
| `aoe4_sync.alert.count{code="high_failure_count"}` | 高失敗率告警值 |
| `aoe4_sync.alert.count{code="many_games_without_summary"}` | 大量待抓 Summary 告警值 |

## 注意事項

- `EXPLAIN` 不執行完整查詢；`executionMs` 來自 `SELECT COUNT(*) FROM (...)` 包裝計時
- 玩家必須已入庫（`dim_player` 存在），否則回傳 404
- H2 與 PostgreSQL 的 `EXPLAIN` 輸出格式不同，僅供相對比較
