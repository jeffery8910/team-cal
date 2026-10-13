# 揪團日曆

大家標好自己 2026/11–2027/3 可以或不行的日子和時段，自動找出共同空檔。
線上網址：https://team-cal.jeffery8910.workers.dev

## 結構
- `team-cal.html`：網頁原始檔（改網頁改這個）
- `src/page.js`：由 `team-cal.html` 產生、實際被 Worker 送出的網頁
- `src/api.js`：Cloudflare Worker（`/api/people`、`/api/roster`、`/api/admin/check`）
- `wrangler.toml`：Worker 設定與 D1 資料庫 `team-cal` 綁定

## 部署
推到 `main` 分支，Cloudflare Workers Builds 會自動執行 `npx wrangler deploy`。

## 管理員密碼
只以雜湊存在 D1 `settings` 表（`k='admin_hash'`，值 = SHA-256("tc4admin:" + 密碼)）。
