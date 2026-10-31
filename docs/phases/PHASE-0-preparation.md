# Phase 0：前期準備

| 項目 | 內容 |
|------|------|
| 預估時間 | 1 週 |
| 前置條件 | 無 |
| 範例 profile_id | `10861747` |
| 狀態 | ✅ 完成 |

## 目標

確認分析範圍、取得 API 樣本、定義 MVP 維度，為 Phase 1 開發打好基礎。

## 任務清單

### 需求確認

- [ ] 確認 MVP 範圍：個人深度分析 / Meta 分析 / 兩者分階段
- [ ] 確認首發支援模式（建議：`rm_1v1`）
- [ ] 確認是否需要私人對戰（需 `api_key`）
- [ ] 確認網頁搜尋流程：使用者輸入 `profile_id` → 驗證 → 同步 → 分析

### API 樣本抓取

- [ ] 建立 `samples/` 目錄存放 API 回應 JSON
- [ ] 抓取玩家資料：`GET /players/10861747`
- [ ] 抓取對戰清單：`GET /players/10861747/games?leaderboard=rm_1v1&limit=10`
- [ ] 抓取最新一場：`GET /players/10861747/games/last?include_stats=true`
- [ ] 從清單取一個 `game_id`，抓取單場詳情
- [ ] 抓取該場 Summary：`GET /players/10861747/games/{game_id}/summary?camelize=true`
- [ ] 記錄 Summary JSON 實際欄位結構（供 Entity 設計用）

### 靜態資料

- [ ] 下載或瀏覽 [data.aoe4world.com](https://data.aoe4world.com/) 單位/建築 JSON 結構
- [ ] 確認文明代碼清單（en, fr, hre, ru, ch, ab, de, mo, ot, ja, by, xl...）
- [ ] 評估是否使用 [dumps](https://aoe4world.com/dumps) 做歷史種子資料

### 環境與工具

- [ ] 安裝 JDK 21
- [ ] 安裝 Maven 3.9+
- [ ] 安裝 Node.js 20+（前端用）
- [ ] 選定 IDE（IntelliJ IDEA 建議）
- [ ] 建立 Git 倉庫（可選）

### 官方溝通（建議）

- [ ] 評估是否需要聯繫 AoE4 World Discord（大量 Summary 同步前）
- [ ] 準備 User-Agent 字串：`AOE4-Analytics/1.0 (contact: ...)`

## 產出物

| 產出 | 路徑/說明 |
|------|-----------|
| API 樣本 JSON | `samples/players/10861747-*.json` |
| Summary 欄位對照表 | `docs/SUMMARY-FIELDS.md`（Phase 0 完成後建立） |
| MVP 需求確認紀錄 | 本文件或 issues |

## 完成標準（Definition of Done）

- [ ] `samples/` 內至少有玩家、對戰清單、單場詳情、Summary 各一份 JSON
- [ ] Summary JSON 欄位已人工檢視並記錄
- [ ] MVP 範圍已書面確認
- [ ] 開發環境（JDK、Maven、Node）可正常運作

## 範例 API 測試指令

```bash
# 使用 curl 測試（請替換 User-Agent）
curl -H "User-Agent: AOE4-Analytics/1.0 (dev)" \
  "https://aoe4world.com/api/v0/players/10861747"

curl -H "User-Agent: AOE4-Analytics/1.0 (dev)" \
  "https://aoe4world.com/api/v0/players/10861747/games?leaderboard=rm_1v1&limit=5"
```

## 備註

- 此階段不寫程式，以資料探索與需求確認為主
- `10861747` 為開發期固定測試 ID，不影響最終「任意 ID 輸入」設計

## 下一步

完成後進入 [Phase 1：基礎骨架](./PHASE-1-foundation.md)
