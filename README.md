# 揪團日曆

一群人各自標出可以、不行的日子和時段，自動算出大家都能約的那一天。
活動名稱、日期範圍、假日、預設時段和成員都能在網頁的「管理」裡修改。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jeffery8910/team-cal)

- 實際網站：https://team-cal.jeffery8910.workers.dev
- 使用說明：部署後打開 `/guide`（例：https://team-cal.jeffery8910.workers.dev/guide）

## 一鍵部署

1. 按上面的 **Deploy to Cloudflare**，登入 Cloudflare、連結 GitHub。
2. 取一個專案名稱（會變成網址），在 `ADMIN_PASSWORD` 填管理員密碼。
3. 按 Deploy。D1 資料庫會自動建立，資料表會在第一次打開網站時自動建好。
4. 打開網址 → 右上角「管理」登入 →「活動設定」改名稱與日期 →「管理成員」加人 → 把網址傳給大家。

> 一鍵部署按鈕只支援 **公開** 的 GitHub / GitLab repo。

## 功能

- 每天四種狀態：已填（可以＋時段）、可以（時段未填）、不行、未填
- 規則批量設定：平日／假日／國定假日／星期幾（越具體越優先）
- 24 小時制時段，可整批套用，也可長按單日修改
- 單選、多選兩種點選模式
- 管理員：活動設定、新增刪除成員、代填（本人進來仍是第一次進入，可修改）
- 合併結果：最快可以約的日期、共同時段、每人狀態

## 結構

| 檔案 | 用途 |
|---|---|
| `team-cal.html` | 主網頁原始檔 |
| `guide.html` | 使用說明頁原始檔 |
| `build.py` | 把兩個 HTML 包成 `src/page.js`、`src/guide.js` |
| `src/api.js` | Cloudflare Worker（API 與路由） |
| `wrangler.toml` | Worker 設定、D1 綁定 |
| `.dev.vars.example` | 部署時要填的密碼變數 |

改完網頁執行 `python3 build.py`，提交後推上 GitHub，Cloudflare 會自動重新部署。

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET / PUT | `/api/config` | 活動設定（PUT 需管理員） |
| GET / PUT | `/api/roster` | 成員名單（PUT 需管理員） |
| GET | `/api/people` | 所有人填的資料 |
| PUT / DELETE | `/api/people/:id` | 存／刪一個人的資料 |
| GET | `/api/admin/status` | 是否已設定管理員密碼 |
| POST | `/api/admin/check` | 檢查管理員密碼（header `x-admin-pass`） |

## 管理員密碼

優先使用 Cloudflare 密碼變數 `ADMIN_PASSWORD`。
舊版相容：沒有設定時，會改用 D1 `settings` 表的 `admin_hash`（值 = SHA-256("tc4admin:" + 密碼)）。
