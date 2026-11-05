# Push 前必讀（兩台電腦共用這個 repo）

這個 repo 會從兩台電腦推上來，而且開機同步也會自動推資料檔，所以 **push 前一定要先把遠端的更新拉下來**。

## 一般流程

```powershell
git status                      # 先確認自己在哪個分支、有沒有沒 commit 的東西
git add -A
git commit -m "說明這次改了什麼"
git fetch origin
git pull --rebase origin main   # 把遠端 main 的新 commit 接到自己下面
# 有衝突 → 看下面「衝突怎麼處理」，處理完 git rebase --continue
git push origin HEAD
```

被拒絕（`! [rejected] ... (fetch first)` 或 `non-fast-forward`）時，就是遠端有新東西，回到 `git pull --rebase origin main` 再推一次。**不要用 `git push --force`**，會把另一台電腦推上來的東西蓋掉。

## 衝突怎麼處理

### 資料檔：`dashboard/data/aoe4-data.js`、`aoe4-data.json`、`data/local-custom-matches.json`

這些是開機同步產生的，整個檔案只有一行、13 MB 左右，**不要手動合併**。做法是先取遠端版本，rebase 完後再重跑同步，把本機對局合併回去：

```powershell
# rebase 中：--ours 是「遠端 main」，--theirs 才是自己的 commit（和 merge 時相反）
git checkout --ours -- dashboard/data/aoe4-data.js dashboard/data/aoe4-data.json data/local-custom-matches.json
git add dashboard/data data/local-custom-matches.json
git rebase --continue

# rebase 完成後，重新把這台電腦的本機對局合併進去並推上去
node sync-local-matches.js
```

### 程式碼

照一般方式打開衝突的檔案，保留兩邊都要的內容，然後 `git add` 再 `git rebase --continue`。

## 開機同步推不上去

`sync-on-startup.ps1` → `sync-local-matches.js` 只會 commit 再 `git push origin HEAD`，**不會先 pull**。所以遠端比這台新的時候，開機同步的 push 會被拒絕。資料會留在本機的「更新本機自訂對局紀錄」commit 裡，不會遺失。看 `sync-on-startup.log` 就會知道有沒有被拒絕。

補救方法：照上面的「一般流程」做 `git pull --rebase origin main`，再 `git push origin HEAD`。

另外，同步推的是 **當下所在的分支**（`HEAD`）。開機時如果停在功能分支上，資料就會推到那個分支，而不是 `main`。

## 網站結構：儀表板 + 戰術模擬（2026-11 起）

網站（Cloudflare Workers：`gaygayaoe4`，監看 `main`）是「儀表板為首頁、戰術模擬是其中一個分頁」：

- `/` → 儀表板（`dashboard/index.html`）；「戰術模擬」分頁用 iframe 嵌入 `/simulate`
- `/simulate` → 戰術模擬（`aoe4-frontend` 的 React 頁）；被嵌入時會自動隱藏 React 的頂部導覽列

整合時改到的檔案（另一台電腦如果也改了這些，pull 時可能要合併）：

| 檔案 | 改了什麼 |
|---|---|
| `dashboard/index.html` | 加「戰術模擬」分頁（導覽按鈕、`view-sim` 區塊、`showSim()`） |
| `aoe4-frontend/vite.config.ts` | 開發時 `/` 改成提供儀表板、`/simulate` 是 React |
| `aoe4-frontend/src/components/AppLayout.tsx` | 被 iframe 嵌入時不顯示頂部導覽列 |
| `aoe4-frontend/package.json`、`scripts/build-site.mjs` | 新增 `npm run build:site`：vite build 後把 React 頁改名成 `simulate.html`、把儀表板複製成 `index.html` |
| `aoe4-frontend/wrangler.jsonc` | 部署設定；`name` 必須是 `gaygayaoe4` |

**沒有動**的檔案：`aoe4-frontend/src/sim/**`、`src/pages/SimulatePage.tsx`、`public/sim/**`、`src/App.tsx`，戰術模擬的開發可以照常進行。戰術模擬維持在 `/simulate`，資料檔仍用 `/sim/...` 絕對路徑，不用改。

本機：
- `cd aoe4-frontend; npm run dev` → `http://localhost:5173/` 是儀表板，`/simulate` 是模擬
- 部署前確認：`npm run build:site`，再 `npx wrangler dev` → `http://localhost:8787/`（跟 Cloudflare 同一套執行環境）

推到 `main` 就會觸發 Cloudflare 自動部署，所以還沒測好的東西請先推到別的分支。
