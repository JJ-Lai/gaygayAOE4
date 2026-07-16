# H2 → PostgreSQL 資料遷移

## 概述

專案支援 H2（預設）與 PostgreSQL（`postgres` profile）切換。Schema 由 Flyway 管理，兩者結構一致。

## 建議策略

| 情境 | 建議 |
|------|------|
| 資料量小、可重新同步 | **推薦**：切換 PG 後用 Ops 批次同步重抓 |
| 資料量大、需保留歷史 | 使用 `scripts/migrate-h2-to-postgres.ps1` 匯出後手動匯入 |

## 快速切換（重新同步）

```powershell
# 1. 啟動 PostgreSQL
docker compose -f docker-compose.postgres.yml up -d postgres

# 2. 以 postgres profile 啟動後端（Flyway 自動建表）
cd aoe4-api
mvn spring-boot:run -Dspring-boot.run.profiles=postgres

# 3. 前端開啟 /ops，批次同步追蹤玩家
```

## 匯出 H2 資料

```powershell
.\scripts\migrate-h2-to-postgres.ps1
```

腳本會：

1. 備份 `aoe4-api/data/aoe4db.mv.db`
2. 使用 H2 `Script` 工具匯出 SQL 至 `backups/migration/h2-export-{timestamp}.sql`

僅匯出 schema（不含資料）：

```powershell
.\scripts\migrate-h2-to-postgres.ps1 -SchemaOnly
```

## 匯入 PostgreSQL

```bash
psql -h localhost -U aoe4 -d aoe4 -f backups/migration/h2-export-YYYYMMDD-HHMMSS.sql
```

### 已知限制

- H2 匯出的 SQL 可能含 PostgreSQL 不支援的語法，需手動調整
- `IDENTITY`、引號、部分函數名稱可能不同
- 大型 `raw_game_summary.payload` 欄位匯入較慢
- **單位損失**（`buildOrder.destroyed`）需重新解析 Summary；切換後建議對重要玩家執行「重試失敗 Summary」或批次同步

## 環境變數

見 [DEPLOYMENT.md](./DEPLOYMENT.md) 的 `POSTGRES_*` 一節。

## 驗證

```powershell
# 健康檢查
curl http://localhost:8080/actuator/health

# 同步概覽
curl http://localhost:8080/api/v1/ops/sync-overview
```
