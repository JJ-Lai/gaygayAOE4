# Phase 9：2v2 分組與 Kubernetes 部署

| 項目 | 內容 |
|------|------|
| 預估時間 | 持續進行 |
| 前置條件 | Phase 8 核心完成 |
| 狀態 | ✅ 核心完成 |

## 目標

依 `team_index` 區分隊友與敵方，改善多人對戰對比體驗；補齊分享預覽 `og:image`；提供 Helm chart 部署至 Kubernetes。

## 任務清單

### 2v2 / 多人分組

- [x] `TimelineOpponentOption.relationship` — `teammate` / `opponent` / `unknown`
- [x] 預設對比玩家優先選敵方（有 Summary 者）
- [x] 前端對比玩家下拉：敵方 / 隊友分組

### 分享預覽

- [x] 靜態 `og-share.svg` 預覽圖
- [x] `og:image` / `twitter:image` meta（含 `X-Forwarded-*` 絕對 URL）

### Kubernetes

- [x] `helm/aoe4/` — Deployment、Service、Ingress、PostgreSQL StatefulSet
- [x] `DEPLOYMENT.md` Helm 章節

### 測試

- [x] 整合測試：relationship 欄位、og:image
- [x] E2E：敵方 / 隊友分組選單

### 待迭代

- [ ] `og:image` 動態圖表截圖（依對戰資料生成）
- [ ] Helm subchart 拆分監控（Prometheus / Grafana）
- [ ] External Secrets 整合

## 完成標準

- 2v2 對戰可區分隊友與敵方並切換對比
- Discord / Slack 分享連結含預覽圖 meta
- `helm install` 可部署應用 + PostgreSQL
