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

## 接下來會有的變動（2026-11 規劃中）

網站（Cloudflare Workers：`gaygayaoe4`，監看 `main`）會從「只有戰術模擬」改成「儀表板為首頁、戰術模擬是其中一個分頁」：

- `/` → 儀表板（`dashboard/index.html`）
- `/sim/` → 戰術模擬（`aoe4-frontend`）

會改到的檔案（另一台電腦如果也改了這些，pull 時可能要合併）：

| 檔案 | 會怎麼改 |
|---|---|
| `dashboard/index.html` | 加一個「戰術模擬」分頁（只動導覽和一個新區塊） |
| `aoe4-frontend/vite.config.ts` | 加 `base: '/sim/'` |
| `aoe4-frontend/src/App.tsx` | Router 加 `basename` |
| `aoe4-frontend/package.json` | 加 `build:site` 指令 |
| `aoe4-frontend/wrangler.jsonc`、`public/_redirects` | 部署設定；`name` 必須是 `gaygayaoe4` |

**不會動**的檔案：`aoe4-frontend/src/sim/**`、`src/pages/SimulatePage.tsx`、`public/sim/**`，戰術模擬的開發可以照常進行。

推到 `main` 就會觸發 Cloudflare 自動部署，所以還沒測好的東西請先推到別的分支。
