# 部署指南

## 本地開發（前後端分離）

### 後端

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
cd aoe4-api
mvn spring-boot:run
```

- API：http://localhost:8080
- Swagger：http://localhost:8080/swagger-ui.html

### 前端

```powershell
cd aoe4-frontend
npm install
npm run dev
```

- 前端：http://localhost:5173（`/api` 代理至 8080）

## Docker Compose（一鍵部署）

在專案根目錄：

```bash
docker compose up --build
```

- 應用：http://localhost:8080（API + 前端 SPA）
- H2 資料持久化於 Docker volume `aoe4-data`
- 使用 `SPRING_PROFILES_ACTIVE=prod`，內建靜態前端

停止：

```bash
docker compose down
```

## 正式建置（手動）

```powershell
cd aoe4-frontend
npm run build

mkdir -Force aoe4-api\src\main\resources\static
Copy-Item -Recurse -Force aoe4-frontend\dist\* aoe4-api\src\main\resources\static\

cd aoe4-api
mvn package -DskipTests
java -jar target\aoe4-api-*.jar --spring.profiles.active=prod
```

## Docker Compose（PostgreSQL）

使用 PostgreSQL 而非 H2 內嵌檔案：

```bash
docker compose -f docker-compose.postgres.yml up --build
```

- PostgreSQL：`localhost:5432`（user/pass/db 皆為 `aoe4`）
- 應用：`http://localhost:8080`
- Profile：`prod,postgres`

本地連線 PostgreSQL（需已啟動 DB）：

```powershell
cd aoe4-api
mvn spring-boot:run -Dspring-boot.run.profiles=postgres
```

環境變數：`POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`

## Docker Compose（PostgreSQL + 應用 + 監控）

生產級全棧（PostgreSQL、API、Prometheus、Grafana）：

```bash
docker compose -f docker-compose.postgres.full.yml up --build
```

- PostgreSQL：`localhost:5432`
- 應用：http://localhost:8080
- Prometheus：http://localhost:9090
- Grafana：http://localhost:3000

僅 H2 + 監控見 `docker-compose.full.yml`；僅監控見 `docker-compose.monitoring.yml`。

## 部署後驗證

```powershell
.\scripts\smoke-test.ps1
# 或指定 URL / 玩家
.\scripts\smoke-test.ps1 -BaseUrl http://localhost:8080 -ProfileId 1224481

# 公開樣本玩家深度驗證（需已同步 Summary）
.\scripts\verify-player-sample.ps1 -ProfileId 1224481
```

正式環境 secrets 與備份排程見 [PRODUCTION-SECRETS.md](./PRODUCTION-SECRETS.md)。

## GitHub Container Registry

`main` 分支 push 後，GitHub Actions 會建置並推送：

```
ghcr.io/<your-org>/<repo>:latest
```

拉取執行：

```bash
docker pull ghcr.io/<your-org>/<repo>:latest
docker run -p 8080:8080 -v aoe4-data:/app/data ghcr.io/<your-org>/<repo>:latest
```

## H2 備份

Windows：

```powershell
.\scripts\backup-h2.ps1
```

備份檔輸出至 `backups/aoe4db-{timestamp}/`。

## H2 → PostgreSQL 遷移

```powershell
.\scripts\migrate-h2-to-postgres.ps1
```

詳見 [POSTGRES-MIGRATION.md](./POSTGRES-MIGRATION.md)。

## 環境變數

| 變數 | 說明 |
|------|------|
| `SPRING_PROFILES_ACTIVE` | `prod` 啟用 SPA 靜態服務、關閉 H2 Console |
| `SPRING_DATASOURCE_URL` | 覆寫資料庫連線（預設 H2 file `./data/aoe4db`） |
| `POSTGRES_*` | `postgres` profile 資料庫連線參數 |

## 如何找到 Profile ID

AoE4 World 玩家頁面 URL：

```
https://aoe4world.com/players/10861747
                              ^^^^^^^^
```

前端亦支援以玩家名稱搜尋（呼叫 `/api/v1/players/search`）。

## 監控（Prometheus）

後端啟動後可抓取 metrics：

```
http://localhost:8080/actuator/prometheus
```

主要自訂指標：

| 指標 | 說明 |
|------|------|
| `aoe4_sync_player_total` | 玩家對戰清單同步次數 |
| `aoe4_sync_games_total` | 入庫對戰場次累計 |
| `aoe4_sync_summary_total` | Summary 同步（tag: `status`） |
| `aoe4_aggregation_refresh_total` | 預聚合刷新次數 |
| `aoe4_aggregation_refresh_duration_seconds` | 預聚合刷新耗時 |
| `aoe4_sync.games_without_summary` | 尚未嘗試 Summary 的對戰數 |
| `aoe4_sync.alert.count{code}` | 同步告警計數（exhausted_retries 等） |

查詢計畫檢視見 [SQL-QUERY-PLANS.md](./SQL-QUERY-PLANS.md)。

完整監控與 Webhook 設定見 [MONITORING.md](./MONITORING.md)。

## E2E 測試

```powershell
cd aoe4-frontend
npm install
npx playwright install chromium
npm run test:e2e
```

測試會自動啟動 Vite dev server，並以 mock API 驗證搜尋 → 儀表板流程（不需後端）。

## CSV 匯出

| 端點 | 說明 |
|------|------|
| `GET /api/v1/export/matchup-matrix.csv?profileId=` | Matchup 矩陣（支援篩選參數） |
| `GET /api/v1/export/map-stats.csv?profileId=` | 地圖分析 |
| `GET /api/v1/export/patch-stats.csv?profileId=` | 補丁分析 |
| `GET /api/v1/export/combat-stats.csv?profileId=` | 戰鬥統計 |
| `GET /api/v1/export/unit-loss-stats.csv?profileId=` | 單位損失 |
| `GET /api/v1/export/games.csv?profileId=` | 對戰列表（最多 5000 場） |

前端 Matchup、地圖、補丁、戰鬥、單位損失、對戰列表頁面有「匯出 CSV / JSON」按鈕。

## Summary API Key（私人對戰）

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/v1/settings/summary-api-key` | 查詢是否已設定（僅回傳末四碼） |
| PUT | `/api/v1/settings/summary-api-key` | 設定執行期間 API Key（body: `{ "apiKey": "..." }`） |
| DELETE | `/api/v1/settings/summary-api-key` | 清除執行期間覆寫 |

前端：**設定** 頁面（頂部導覽列）。重啟後端後需重新輸入。

## Kubernetes（Helm）

Chart 位於 `helm/aoe4/`，包含應用 Deployment、Service、可選 Ingress，以及內建 PostgreSQL StatefulSet。

### 前置

- Kubernetes 叢集（1.24+）
- `helm` 3.x
- 已建置並推送映像至 registry（見 `.github/workflows/docker.yml` GHCR）

### 安裝

```bash
# 編輯 helm/aoe4/values.yaml：image.repository、ingress.hosts、postgres.password

helm install aoe4 ./helm/aoe4 \
  --set image.repository=ghcr.io/YOUR_ORG/aoe4 \
  --set image.tag=latest \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=aoe4.example.com
```

### 常用覆寫

| 值 | 說明 |
|----|------|
| `postgres.enabled` | `false` 時使用外部 DB，需自行設定 `POSTGRES_*` env |
| `ingress.enabled` | 啟用對外 HTTP 路由 |
| `replicaCount` | 應用副本數（預設 1） |
| `aoe4.sync.enabled` | 關閉背景對戰清單同步 |

### 升級 / 移除

```bash
helm upgrade aoe4 ./helm/aoe4 -f helm/aoe4/values.yaml
helm uninstall aoe4
```

分享預覽 `og:image` 使用 `/og-share.svg`；Ingress 後請確認 `X-Forwarded-Host` / `X-Forwarded-Proto` 由 ingress controller 正確傳遞。

## 玩家比較

- 前端：`/compare?left=10861747&right=1224481`
- 並排顯示兩位玩家的總場次、勝率、Summary 場次、主文明

## CI

推送至 `main` 或開 PR 時，GitHub Actions 會執行：

- `mvn test`（後端單元測試）
- `npm run build` + `npm run test:e2e`（前端建置與 E2E）
