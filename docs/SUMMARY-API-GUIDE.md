# Game Summary API 取得指南

> 研究日期：2026-07-15  
> 測試玩家：`10861747`（李侑玲）

---

## 1. 核心結論

| 項目 | 說明 |
|------|------|
| Summary **可以**透過 API 取得 | 但路徑與官方文件不同，且有限制條件 |
| 正確端點 | `https://aoe4world.com/players/{profileId}/games/{gameId}/summary` |
| **錯誤**端點 | ~~`/api/v0/players/.../summary`~~ → 一律 404 |
| `10861747` 目前 404 原因 | 對戰紀錄可能未設為公開（遊戲內 Share History） |
| 公開對戰可取得 | 已驗證 `game_id=131766848` 回傳 68KB 完整 JSON |

---

## 2. 正確 API 呼叫方式

### 2.1 請求格式

```
GET https://aoe4world.com/players/{profileId}/games/{gameId}/summary?camelize=true
```

**必要 Headers：**

```
Accept: application/json
User-Agent: AOE4-Analytics/1.0 (contact: your@email.com)
```

> User-Agent 不可含 `bot`、`crawler`、`scraper`、`fetch`、`spider` 等字樣，否則可能被擋。

### 2.2 可選參數

| 參數 | 用途 | 取得方式 |
|------|------|----------|
| `camelize=true` | 回傳 camelCase JSON（建議必加） | — |
| `sig={hash}` | 簽名存取（私人/已簽名連結） | 從 AoE4 World 網頁 Summary URL 取得 |
| `api_key={key}` | 存取自己的私人對戰 | 從 [overlay.aoe4world.com](https://overlay.aoe4world.com/) 產生的 Overlay URL |

### 2.3 範例（已驗證成功）

```bash
curl.exe -H "Accept: application/json" \
  -H "User-Agent: AOE4-Analytics/1.0 (dev-test; contact: local)" \
  "https://aoe4world.com/players/1224481/games/131766848/summary?camelize=true"
```

回傳 HTTP 200，約 68KB JSON。

### 2.4 範例（10861747 失敗）

```bash
curl.exe -H "Accept: application/json" \
  -H "User-Agent: AOE4-Analytics/1.0 (dev-test; contact: local)" \
  "https://aoe4world.com/players/10861747/games/174380825/summary?camelize=true"
```

回傳 HTTP 404 `Not Found`。

---

## 3. 為什麼有些對戰有 Summary、有些沒有

依 [AoE4 World FAQ](https://aoe4world.com/faq)：

### 可取得 Summary 的條件

1. **公開對戰紀錄**：玩家在遊戲內將 Match History 設為 **Public**（Share History 開啟）
2. **Ranked / Quick Match**：自訂對戰需 Steam 登入 AoE4 World 才能看自己的
3. **對戰已結束**：結算完成後需數分鐘才會產生 Summary

### 無法取得的情況

| 情況 | 結果 |
|------|------|
| 對戰紀錄設為私人 | 404（除非提供 `api_key` 或 `sig`） |
| Xbox / Game Pass 私人帳號 | 無法驗證身份，只能設公開 |
| Summary 尚未產生 | 404 或空資料 |
| 過舊對戰 | 可能未建立 Summary（需實測） |

### 對 `10861747` 的建議

1. 到遊戲內確認 **Share History / 分享對戰紀錄** 是否開啟
2. 開啟後等 AoE4 World 更新（FAQ：每次更新排行榜時會偵測設定變更）
3. 或用自己的帳號到 [overlay.aoe4world.com](https://overlay.aoe4world.com/) 取得 `api_key`，用於私人對戰

---

## 4. api_key 取得方式

### Overlay URL 有兩種，不要搞混

| URL 類型 | 範例 | 用途 |
|----------|------|------|
| **標準 Overlay**（你目前拿到的） | `https://overlay.aoe4world.com/profile/10861747/bar?theme=top&includeAlts=true` | 給 OBS 直播用，**不含 api_key** |
| **含 apiKey 的 URL** | `...?theme=top&includeAlts=true&apiKey=xxxxxxxx` | 存取私人/自訂對戰，可轉成 Summary 的 `api_key` |

官方 [Overlay README](https://github.com/aoe4world/overlay) 的預設 URL 格式與你拿到的一致，**本來就不會有 apiKey**。

### 如何取得含 apiKey 的 URL

1. 前往 [overlay.aoe4world.com](https://overlay.aoe4world.com/) 輸入 profile_id
2. 若需要私人對戰 / 自訂對戰支援，需 **Steam 登入** AoE4 World（見 [FAQ](https://aoe4world.com/faq)）
3. 登入後產生的 URL **可能會多出** `apiKey=...` 參數（依網站流程而定）
4. 若 URL 仍無 `apiKey`，可在瀏覽器開發者工具（F12 → Network）觀察 Overlay 頁面對 AoE4 World 的 API 請求是否帶有 key

### 用於 Summary API

將 URL 中的 `apiKey` 值改為 query 參數 `api_key`（底線格式）：

```
GET .../summary?camelize=true&api_key=YOUR_KEY
```

### 注意事項

- **不要分享** api_key，它可存取你的私人對戰
- api_key 主要用於**自己的**對戰，不是 bulk 爬蟲的通行證
- 官方仍會限速（429），需配合快取與請求佇列

---

## 5. sig 簽名參數

公開分享的 Summary 網頁 URL 格式：

```
https://aoe4world.com/players/1224481-KASVA/games/131766848?sig=1cf5a6f0a5f7ffa3b8a79f61de27b1aa601ba81b
```

API 呼叫時：

```
GET .../summary?camelize=true&sig=1cf5a6f0a5f7ffa3b8a79f61de27b1aa601ba81b
```

社群專案建議策略（參考 [aoe4-game-analyzer](https://github.com/benjaminshoemaker/aoe4-game-analyzer)）：

1. 有 `sig` 時優先帶 `sig` 請求
2. 若 401/403/404/429，再嘗試不帶 `sig` 的公開請求
3. 絕不在 log 或 analytics 中記錄原始 `sig` 值

---

## 6. Summary JSON 主要欄位（供 Entity 設計）

樣本檔：`samples/players/public-game-131766848-summary.json`

### 頂層

| 欄位 | 說明 |
|------|------|
| `gameId` | 對戰 ID |
| `mapName`, `duration`, `startedAt` | 地圖、時長、開始時間 |
| `leaderboard` | 模式 |
| `players[]` | 各玩家詳細資料 |
| `summaryVersion` | Summary 格式版本 |

### 每位玩家 `players[i]`

| 欄位 | 說明 | 對應 DB |
|------|------|---------|
| `profileId`, `name`, `civilization` | 玩家、文明 | dim_player, dim_civilization |
| `scores.total/military/economy/technology/society` | 終局分數 | fact_game_player_score |
| `totalResourcesSpent` | 總資源花費 | 聚合用 |
| `resources.timestamps[]` | 時間點（秒） | dim_time_bucket |
| `resources.food/gold/wood/stone[]` | 累積花費 | fact_game_player_resource |
| `resources.foodPerMin/goldPerMin/...` | 每分鐘速率 | 分析用 |
| `resources.military/economy/technology/society[]` | 分數時間序列 | 曲線圖 |
| `resources.total[]` | 總資源時間序列 | 曲線圖 |
| `buildOrder[]` | 建造事件（含 finished 時間戳） | fact_build_event |
| `actions` | 時代、科技升級時間 | 分析用 |

---

## 7. 官方使用規範與限速

### 必須遵守

- 不要 bulk crawl Summary（CPU 密集，會被 429 封鎖）
- 本地快取成功回應（建議 TTL 7 天）
- 限速建議 ≥ **2 秒/請求**
- 429 時指數退避 + negative cache（3 分鐘）
- 使用 `since` / `updated_since` 做對戰清單增量同步，再對新對戰拉 Summary

### 建議架構

```
對戰清單同步（輕量 API）
    ↓
篩選尚未有 Summary 的 game_id
    ↓
Summary 佇列（限速 Worker）
    ↓
本地快取 + 寫入 H2
```

---

## 8. 替代方案（若 Summary 不可用）

| 方案 | 說明 | 難度 |
|------|------|------|
| **A. 開啟公開對戰紀錄** | 最簡單，讓 `10861747` 對戰可被分析 | 低 |
| **B. 使用 api_key** | 分析自己的私人對戰 | 低 |
| **C. 聯繫 AoE4 World** | Discord 說明研究/社群用途，申請合規建議或批量資料 | 中 |
| **D. 使用 Stats API** | `/api/v0/stats/{leaderboard}/matchups` 做 Meta 分析（無單場曲線） | 低 |
| **E. 解析 Replay** | Summary JSON 內含 `replays[].url`；可用 [aoe4world/replays-api](https://github.com/aoe4world/replays-api) 自行解析 | 高 |
| **F. 季賽 Dumps** | [aoe4world.com/dumps](https://aoe4world.com/dumps) 批量歷史對戰（無 Summary 細節） | 中 |

---

## 9. 聯繫 AoE4 World 官方

若要做大量 Summary 同步或研究專案：

- **Discord**：從 [aoe4world.com](https://aoe4world.com) 或 [overlay repo](https://github.com/aoe4world/overlay) 取得邀請連結
- **說明內容建議**：
  - 專案目的（個人分析 / 社群工具）
  - 預計同步的玩家數量與頻率
  - 已實作的快取、限速、User-Agent 策略
  - 是否需要 api_key 或白名單
- FAQ 也提到：「若你正在做對社群有用的專案，我們有多種方式提供批量資料或整合」

---

## 10. 實作 Checklist（Phase 2 用）

- [ ] 修正 API Client URL：`/players/{id}/games/{gameId}/summary`（非 `/api/v0/`）
- [ ] 請求加上 `Accept: application/json`
- [ ] 支援 `camelize=true`、`api_key`、`sig` 參數
- [ ] 實作本地快取（Caffeine 或檔案）
- [ ] Summary Worker 限速 ≥ 2 秒/請求
- [ ] 404 標記為「無 Summary」而非重試
- [ ] 429 指數退避 + negative cache
- [ ] 保留 `raw_game_summary` 原始 JSON
- [ ] 前端提示：若無資料，引導使用者開啟 Share History 或輸入 api_key

---

## 11. 測試紀錄

| 端點 | profile_id | game_id | 結果 |
|------|------------|---------|------|
| `/api/v0/.../summary` | 10861747 | 174380825 | ❌ 404 |
| `/players/.../summary` | 10861747 | 174380825 | ❌ 404（可能未公開） |
| `/players/.../summary` | 1224481 | 131766848 | ✅ 200（68KB） |
| `/players/.../summary` | 8139502 | 229727104 | ❌ 404 |
| `/api/v0/players/10861747` | — | — | ✅ 200 |
| `/api/v0/players/10861747/games` | — | — | ✅ 200 |

---

## 13. 歷史 Summary 補齊 destroyed[] 與戰鬥統計

若在 `destroyed[]` 解析功能上線**之前**已入庫的 Summary，資料庫中可能缺少：

- `fact_build_event` 的 `DESTROYED` 事件
- `fact_player_combat_stats` 戰鬥統計

只要 `raw_game_summary.payload` 仍保留原始 JSON，**無需重新向 AoE4 World 抓資料**，可從本地 payload 重新解析。

### 13.1 API

```powershell
# 指定玩家，最多 20 場（預設上限 50）
curl -X POST "http://localhost:8080/api/v1/ops/reparse-summaries?profileId=1224481&maxGames=20"

# 全域：最近 SUCCESS 的 Summary（依 fetched_at 排序）
curl -X POST "http://localhost:8080/api/v1/ops/reparse-summaries?maxGames=20"
```

回應範例：

```json
{
  "profileId": 1224481,
  "attempted": 20,
  "succeeded": 18,
  "failed": 2,
  "reparsedAt": "2026-07-15T11:30:00Z"
}
```

### 13.2 前端 Ops 頁

`/ops` → **重新解析 Summary** 區塊，可選填 Profile ID。

### 13.3 建議流程

1. 確認目標玩家已有 `fetch_status = SUCCESS` 的 `raw_game_summary`
2. 對該玩家執行 `reparse-summaries`（建議 `maxGames=20`，多次執行直到 `attempted` 為 0）
3. 驗證：
   - `GET /api/v1/analytics/unit-loss-stats?profileId=1224481`
   - 單場詳情 `/player/1224481/games/{gameId}` 的建造/損失時間軸

### 13.4 注意事項

- 重新解析會**刪除並重建**該場對戰該玩家的資源點、軍隊價值、建造事件、戰鬥統計（不影響 `raw_game_summary` 本身）
- `payload` 為空或 JSON 損壞的列會計入 `failed`
- 若從未成功抓取 Summary，需先執行 Summary 同步，而非 reparse

---

## 14. 相關資源

- [AoE4 World API](https://www.aoe4world.com/api)
- [AoE4 World FAQ - Game Summary](https://aoe4world.com/faq)
- [AoE4 World Overlay（api_key）](https://overlay.aoe4world.com/)
- [aoe4-game-analyzer（Summary Client 參考實作）](https://github.com/benjaminshoemaker/aoe4-game-analyzer/blob/main/packages/aoe4-core/src/aoe4world/client.ts)
- [aoe4world/replays-api（Replay 解析）](https://github.com/aoe4world/replays-api)
- 樣本 JSON：`samples/players/public-game-131766848-summary.json`
