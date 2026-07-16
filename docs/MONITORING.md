# 監控與告警

## Prometheus Metrics

後端暴露於：

```
http://localhost:8080/actuator/prometheus
```

主要指標見 [DEPLOYMENT.md](./DEPLOYMENT.md#監控prometheus)。

## Grafana Dashboard

預設 Dashboard JSON：`monitoring/grafana/aoe4-overview.json`

### 本地啟動 Prometheus + Grafana

先啟動 AOE4 後端（port 8080），再：

```bash
docker compose -f docker-compose.monitoring.yml up
```

- Prometheus：http://localhost:9090
- Grafana：http://localhost:3000（admin / admin）
- Dashboard 自動載入：**AOE4 Analytics Overview**

> Prometheus 透過 `host.docker.internal:8080` 抓取本機 API；Linux 若無法連線，請修改 `monitoring/prometheus/prometheus.yml` 的 target。

### 全棧 Docker（應用 + 監控）

```bash
docker compose -f docker-compose.full.yml up --build
```

- API：http://localhost:8080
- Prometheus：http://localhost:9090（抓取 `aoe4:8080`，設定見 `prometheus.docker.yml`）
- Grafana：http://localhost:3000

## 同步告警 Webhook

當 Ops 偵測到同步異常（重試用盡、高失敗率、大量待抓 Summary）時，可推送至 Slack / Discord / 自訂 HTTP endpoint。

### 設定

`application.yml` 或環境變數：

```yaml
aoe4:
  ops:
    alert-webhook-enabled: true
    alert-webhook-url: https://hooks.slack.com/services/XXX/YYY/ZZZ
    alert-check-cron: "0 */15 * * * *"   # 每 15 分鐘檢查
```

環境變數對應：

| 變數 | 說明 |
|------|------|
| `AOE4_OPS_ALERT_WEBHOOK_ENABLED` | `true` 啟用 |
| `AOE4_OPS_ALERT_WEBHOOK_URL` | Webhook URL |
| `AOE4_OPS_ALERT_CHECK_CRON` | Spring cron 表達式 |

### Webhook Payload

```json
{
  "source": "aoe4-analytics",
  "text": "AOE4 Sync Alerts\n[WARNING] Summary 失敗... (12)",
  "alerts": [
    { "severity": "WARNING", "code": "HIGH_FAILURE_COUNT", "message": "...", "count": 12 }
  ],
  "checkedAt": "2026-07-15T11:00:00Z"
}
```

相容 Slack Incoming Webhook（使用 `text` 欄位）。

### 手動觸發

```powershell
# 僅在告警狀態變更時發送（預設）
curl -X POST "http://localhost:8080/api/v1/ops/notify-alerts"

# 強制發送（忽略去重）
curl -X POST "http://localhost:8080/api/v1/ops/notify-alerts?force=true"
```

回應：

```json
{ "sent": true, "reason": "sent", "alertCount": 2, "checkedAt": "..." }
```

`reason` 可能值：`sent`、`webhook_disabled`、`webhook_url_missing`、`no_alerts`、`unchanged`、`http_4xx`、`error`

## 建議告警規則（Prometheus）

規則檔：`monitoring/prometheus/alert.rules.yml`（已掛載至 `docker-compose.monitoring.yml` 與 `docker-compose.full.yml`）

包含：

| 告警 | 條件 | 嚴重度 |
|------|------|--------|
| `Aoe4ApiDown` | `up{job="aoe4-api"} == 0` 持續 2 分鐘 | critical |
| `Aoe4ExhaustedSummaryRetries` | 重試用盡 Summary 筆數 > 0 | critical |
| `Aoe4HighSummaryFailureCount` | 高失敗率告警啟用 | warning |
| `Aoe4ManyGamesWithoutSummary` | 未嘗試 Summary 的對戰 > 100 | warning |

在 Prometheus UI（http://localhost:9090/alerts）可檢視規則狀態。

### Slack 整合（Alertmanager）

1. 複製範例設定：
   ```bash
   cp monitoring/prometheus/alertmanager.example.yml monitoring/prometheus/alertmanager.yml
   ```
2. 將 `api_url` 換成 Slack Incoming Webhook
3. 啟動含 Alertmanager 的 stack：
   ```bash
   docker compose -f docker-compose.monitoring.yml -f docker-compose.alerting.yml up
   ```

> `alertmanager.yml` 含 webhook 請勿提交至版本庫；範例檔 `alertmanager.example.yml` 可安全提交。

應用層同步告警（非 Prometheus）仍使用 `aoe4.ops.alert-webhook-*`，見上方「同步告警 Webhook」章節。

## 相關文件

- [SQL 查詢計畫](./SQL-QUERY-PLANS.md)
- [部署指南](./DEPLOYMENT.md)
