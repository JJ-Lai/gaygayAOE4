# 正式環境 Secrets 與備份

> 個人/小團隊部署參考。請勿將實際密碼或 webhook 提交至版本庫。

## 必要 Secrets / 環境變數

| 變數 | 用途 | 建議存放 |
|------|------|----------|
| `POSTGRES_PASSWORD` | PostgreSQL 密碼 | Docker secrets / 主機 env 檔 |
| `AOE4_OPS_ALERT_WEBHOOK_URL` | 同步告警 Slack/Discord | 主機 env 檔 |
| `AOE4_SUMMARY_API_KEY` | 私人對戰 Summary 抓取 | 主機 env 檔（或前端設定頁僅本機） |

本地開發可放在專案根目錄 `.env.local`（已 gitignore）：

```env
AOE4_SUMMARY_API_KEY=your-key-here
```

啟動前載入：`.\scripts\run-local.ps1`  
驗證 Key：`.\scripts\test-summary-api-key.ps1`
| `GF_SECURITY_ADMIN_PASSWORD` | Grafana admin | `docker-compose` override 檔 |

### 範例 `.env.prod`（勿提交 git）

```env
POSTGRES_PASSWORD=change-me-strong
AOE4_OPS_ALERT_WEBHOOK_ENABLED=true
AOE4_OPS_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
GF_SECURITY_ADMIN_PASSWORD=change-me
```

Compose 引用：

```yaml
# docker-compose.override.yml（本地建立，不提交）
services:
  aoe4:
    env_file: .env.prod
  postgres:
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  grafana:
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GF_SECURITY_ADMIN_PASSWORD}
```

## GitHub Actions / GHCR

- `GITHUB_TOKEN` 由 Actions 自動提供，用於推送 `ghcr.io/<repo>:latest`
- 私有 image 拉取需設定 `packages:read` PAT 於部署主機

## 備份排程

### H2（單機 Docker volume）

```powershell
# 每日 03:00（工作排程器）
cd C:\path\to\AOE4
.\scripts\backup-h2.ps1
```

建議保留 7–14 天備份，異地複製 `backups/` 目錄。

### PostgreSQL

```bash
# 每日 cron（Linux 主機）
0 3 * * * docker exec <postgres-container> pg_dump -U aoe4 aoe4 | gzip > /backups/aoe4-$(date +\%F).sql.gz
```

還原：

```bash
gunzip -c aoe4-2026-07-15.sql.gz | docker exec -i <postgres-container> psql -U aoe4 aoe4
```

### 監控設定

- `monitoring/prometheus/alertmanager.yml` 含 webhook，應從 `alertmanager.example.yml` 複製後本地保存
- 已加入 `.gitignore`：`monitoring/prometheus/alertmanager.yml`

## 部署檢查清單

1. `docker compose -f docker-compose.postgres.full.yml up -d --build`
2. `.\scripts\smoke-test.ps1 -ProfileId <your-id>`
3. `.\scripts\verify-player-sample.ps1 -ProfileId 1224481`（有 Summary 的公開樣本）
4. 確認 Grafana / Prometheus 可連線
5. 設定告警 webhook 或 Alertmanager

## 相關文件

- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [MONITORING.md](./MONITORING.md)
- [POSTGRES-MIGRATION.md](./POSTGRES-MIGRATION.md)
