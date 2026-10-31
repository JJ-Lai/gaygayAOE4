# Summary JSON 欄位對照（Phase 0）

> 樣本來源：`samples/players/public-game-131766848-summary.json`  
> 端點：`GET https://aoe4world.com/players/{profileId}/games/{gameId}/summary?camelize=true`

## 頂層

| 欄位 | 類型 | 說明 |
|------|------|------|
| `gameId` | number | 對戰 ID |
| `mapName` | string | 地圖名稱 |
| `leaderboard` | string | 模式 |
| `duration` | number | 時長（秒） |
| `startedAt` | number | Unix 時間戳 |
| `finishedAt` | number | Unix 時間戳 |
| `winReason` | string | 勝負原因 |
| `players` | array | 玩家詳情 |
| `summaryVersion` | number | Summary 格式版本 |

## players[i]

| 欄位 | 對應 DB 表 |
|------|-----------|
| `profileId`, `name`, `civilization` | dim_player, dim_civilization |
| `scores.total/military/economy/technology/society` | fact_game_player_score |
| `totalResourcesSpent` | 聚合統計 |
| `resources.timestamps[]` | dim_time_bucket |
| `resources.food/gold/wood/stone[]` | fact_game_player_resource |
| `resources.*PerMin[]` | 分析用 |
| `resources.military/economy/...[]` | 分數時間序列 |
| `buildOrder[]` | fact_build_event |

## buildOrder[i]

| 欄位 | 說明 |
|------|------|
| `type` | Unit / Building / Upgrade / Age |
| `pbgid` | 遊戲內 ID |
| `finished[]` | 完成時間戳（秒） |
| `constructed[]` | 建造完成時間戳 |
| `destroyed[]` | 被摧毀時間戳（→ `fact_build_event` event_kind=DESTROYED） |

## Phase 2 入庫優先順序

1. `scores` → fact_game_player_score
2. `resources` 時間序列 → fact_game_player_resource
3. `buildOrder` → fact_build_event
4. 原始 JSON → raw_game_summary
