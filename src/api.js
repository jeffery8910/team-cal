// 揪團日曆：Cloudflare Worker（通用範本）
//
// GET  /                    → 網頁
// GET  /guide               → 使用說明
// GET  /api/config          → 活動設定（名稱、日期範圍、假日、預設時段）
// PUT  /api/config          → 改活動設定（管理員）
// GET  /api/roster          → 成員名單 [{id,name,c}]
// PUT  /api/roster          → 改名單（管理員）
// GET  /api/people          → 所有人的資料 { id: data }
// PUT  /api/people/:id      → 存一個人的資料（id 必須在名單裡）
// DELETE /api/people/:id    → 重置／刪除一個人的資料
// GET  /api/admin/status    → 有沒有設定管理員密碼
// POST /api/admin/check     → 檢查管理員密碼（header: x-admin-pass）
//
// 管理員密碼：部署時設定的 ADMIN_PASSWORD（Cloudflare 的密碼變數）。
// 舊版相容：沒有 ADMIN_PASSWORD 時，改用 D1 settings 表裡的 admin_hash
//          （值 = SHA-256("tc4admin:" + 密碼)）。
// 資料表會在第一次收到請求時自動建立，不需要手動跑 SQL。
import HTML from "./page.js";
import GUIDE from "./guide.js";

const DEFAULT_CONFIG = {
  title: "揪團日曆",
  subtitle: "每個人標好自己的空檔，系統自動找出大家都能約的日子。",
  start: "2026-11",
  end: "2027-03",
  time: { from: "10:30", to: "16:30" },
  holidays: {
    "2026-12-25": "行憲", "2027-01-01": "元旦", "2027-02-04": "小年夜", "2027-02-05": "除夕",
    "2027-02-06": "初一", "2027-02-07": "初二", "2027-02-08": "初三", "2027-02-09": "補假",
    "2027-02-10": "補假", "2027-02-28": "228", "2027-03-01": "補假",
  },
  festivals: { "2026-12-22": "冬至", "2027-02-20": "元宵" },
};
const DEFAULT_ROSTER = []; // 新部署從空名單開始，由管理員新增
const MAX_PEOPLE = 30;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const page = (html) =>
  new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
const sha = async (t) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
    .map((x) => x.toString(16).padStart(2, "0")).join("");

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
  ]);
  schemaReady = true;
}
const getSetting = async (env, k) =>
  (await env.DB.prepare("SELECT v FROM settings WHERE k = ?1").bind(k).first())?.v ?? null;
const setSetting = (env, k, v) =>
  env.DB.prepare("INSERT INTO settings (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v).run();
async function readJSONSetting(env, k, fallback) {
  try { const v = await getSetting(env, k); if (v) return JSON.parse(v); } catch {}
  return fallback;
}
const roster = (env) => readJSONSetting(env, "roster", DEFAULT_ROSTER);

async function adminConfigured(env) {
  return !!(env.ADMIN_PASSWORD || (await getSetting(env, "admin_hash")));
}
async function isAdmin(req, env) {
  const pass = req.headers.get("x-admin-pass") || "";
  let ok = false;
  if (pass) {
    if (env.ADMIN_PASSWORD) ok = (await sha("p:" + pass)) === (await sha("p:" + env.ADMIN_PASSWORD));
    else {
      const want = await getSetting(env, "admin_hash");
      ok = !!want && (await sha("tc4admin:" + pass)) === want;
    }
  }
  if (!ok) await new Promise((r) => setTimeout(r, 800)); // 拖慢暴力猜密碼
  return ok;
}

const ID_RE = /^[a-z0-9]{2,24}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
function cleanDays(o) {
  const out = {};
  if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o).slice(0, 400)) {
      if (DATE_RE.test(k)) out[k] = String(v || "").slice(0, 6) || "假日";
    }
  }
  return out;
}
function cleanConfig(c) {
  if (!c || typeof c !== "object") return null;
  const title = String(c.title || "").trim().slice(0, 30);
  const subtitle = String(c.subtitle || "").trim().slice(0, 60);
  const start = String(c.start || ""), end = String(c.end || "");
  const from = String(c.time?.from || ""), to = String(c.time?.to || "");
  if (!title || !MONTH_RE.test(start) || !MONTH_RE.test(end) || start > end) return null;
  if (!TIME_RE.test(from) || !TIME_RE.test(to) || from >= to) return null;
  return { title, subtitle, start, end, time: { from, to }, holidays: cleanDays(c.holidays), festivals: cleanDays(c.festivals) };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/guide" || path === "/guide/") return page(GUIDE);
    if (!path.startsWith("/api/")) return page(HTML);
    if (!env.DB) return json({ error: "D1 database binding DB is missing" }, 500);
    await ensureSchema(env);

    if (path === "/api/config") {
      if (req.method === "GET") return json(await readJSONSetting(env, "config", DEFAULT_CONFIG));
      if (req.method === "PUT") {
        if (!(await isAdmin(req, env))) return json({ error: "admin only" }, 403);
        let c;
        try { c = cleanConfig(JSON.parse(await req.text())); } catch { c = null; }
        if (!c) return json({ error: "bad config" }, 400);
        await setSetting(env, "config", JSON.stringify(c));
        return json(c);
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (path === "/api/roster") {
      if (req.method === "GET") return json(await roster(env));
      if (req.method === "PUT") {
        if (!(await isAdmin(req, env))) return json({ error: "admin only" }, 403);
        let list;
        try { list = JSON.parse(await req.text()); } catch { return json({ error: "bad json" }, 400); }
        if (!Array.isArray(list) || list.length > MAX_PEOPLE) return json({ error: `0–${MAX_PEOPLE} people` }, 400);
        const seen = new Set(), clean = [];
        for (const x of list) {
          const id = String(x?.id || ""), name = String(x?.name || "").trim().slice(0, 20), c = String(x?.c || "");
          if (!ID_RE.test(id) || seen.has(id) || !name) return json({ error: "bad person" }, 400);
          seen.add(id);
          clean.push({ id, name, c: COLOR_RE.test(c) ? c : "#3b66b0" });
        }
        await setSetting(env, "roster", JSON.stringify(clean));
        return json(clean);
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (path === "/api/admin/status" && req.method === "GET") {
      return json({ configured: await adminConfigured(env) });
    }
    if (path === "/api/admin/check" && req.method === "POST") {
      return (await isAdmin(req, env)) ? json({ ok: true }) : json({ error: "wrong password" }, 403);
    }

    if (path === "/api/people" && req.method === "GET") {
      const ids = new Set((await roster(env)).map((p) => p.id));
      const { results } = await env.DB.prepare("SELECT id, data FROM people").all();
      const out = {};
      for (const r of results) {
        if (!ids.has(r.id)) continue;
        try { out[r.id] = JSON.parse(r.data); } catch {}
      }
      return json(out);
    }

    const m = path.match(/^\/api\/people\/([a-z0-9]+)$/);
    if (m) {
      const id = m[1];
      if (req.method === "PUT") {
        if (!(await roster(env)).some((p) => p.id === id)) return json({ error: "unknown person" }, 404);
        const text = await req.text();
        if (text.length > 200_000) return json({ error: "too large" }, 413);
        let data;
        try { data = JSON.parse(text); } catch { return json({ error: "bad json" }, 400); }
        if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "bad body" }, 400);
        await env.DB.prepare(
          "INSERT INTO people (id, data, updated) VALUES (?1, ?2, ?3) " +
            "ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = excluded.updated"
        ).bind(id, JSON.stringify(data), Date.now()).run();
        return json({ ok: true });
      }
      if (req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM people WHERE id = ?1").bind(id).run();
        return json({ ok: true });
      }
      return json({ error: "method not allowed" }, 405);
    }

    return json({ error: "not found" }, 404);
  },
};
