# AOE4 對戰數據分析系統

從 [AoE4 World](https://aoe4world.com) 抓取對戰數據，存入 H2 資料庫，並以 Maven 後端 + React 前端提供多維度統計分析。

## 快速開始

### 需求

- JDK 17+
- Maven 3.9+

### 啟動後端

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
cd aoe4-api
mvn spring-boot:run
```

### 啟動前端

```powershell
cd aoe4-frontend
npm install
npm run dev   # http://localhost:5173，/api 代理至 8080
```

### 測試 API

```powershell
# 同步玩家對戰
curl.exe -X POST http://localhost:8080/api/v1/players/10861747/sync

# 查詢玩家
curl.exe http://localhost:8080/api/v1/players/10861747

# 對戰列表
curl.exe "http://localhost:8080/api/v1/games?profileId=10861747&page=0&size=5"
```

- Swagger UI：http://localhost:8080/swagger-ui.html
- H2 Console：http://localhost:8080/h2-console（JDBC URL: `jdbc:h2:file:./data/aoe4db`）

## 專案結構

```
aoe4-analytics/          (parent pom)
├── aoe4-common/         DTO、設定
├── aoe4-persistence/    JPA、Flyway、H2
├── aoe4-ingest/         AoE4 World API、同步
├── aoe4-analytics-service/  查詢服務
├── aoe4-api/            Spring Boot 主程式
└── aoe4-frontend/       React 儀表板（Vite + Ant Design + ECharts）
```

## 開發文件

開發文件位於 [`docs/`](./docs/) 目錄：

| 文件 | 說明 |
|------|------|
| [docs/TRACKING.md](./docs/TRACKING.md) | **進度追蹤總表** |
| [docs/REFERENCE.md](./docs/REFERENCE.md) | 完整技術參考 |
| [docs/SUMMARY-API-GUIDE.md](./docs/SUMMARY-API-GUIDE.md) | Summary API 取得指南 |
| [docs/phases/](./docs/phases/) | 各階段執行清單 |

## 範例玩家

- 開發測試 `profile_id`：**10861747**
- 正式產品：網頁輸入任意 `profile_id` 即可搜尋分析

## 技術棧

Spring Boot 3 + Maven + H2 + Flyway + React 19 + Vite + Ant Design + ECharts
