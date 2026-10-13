// 揪團日曆：Cloudflare Worker
// GET  /                       → 網頁
// GET  /api/people             → 所有人的資料 { id: data }
// PUT  /api/people/:id         → 存一個人的資料（id 必須在名單裡）
// DELETE /api/people/:id       → 重置／刪除一個人的資料
// GET  /api/roster             → 成員名單 [{id,name,c}]
// PUT  /api/roster             → 改名單（要管理員密碼：header x-admin-pass）
// POST /api/admin/check        → 檢查管理員密碼
// 管理員密碼只存雜湊在 D1 的 settings 表（k = 'admin_hash'），程式碼裡沒有明文。
import HTML from "./page.js";

const DEFAULT_ROSTER = [
  { id: "lanya", name: "嵐颯", c: "#1f8a86" },
  { id: "patrick", name: "Patrick", c: "#3b66b0" },
  { id: "qingtong", name: "青彤", c: "#7d4fb0" },
  { id: "haitang", name: "海棠Jeffery", c: "#c7742a" },
];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const sha = async (t) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
    .map((x) => x.toString(16).padStart(2, "0")).join("");
const getSetting = async (env, k) => (await env.DB.prepare("SELECT v FROM settings WHERE k = ?1").bind(k).first())?.v ?? null;
const setSetting = (env, k, v) =>
  env.DB.prepare("INSERT INTO settings (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v).run();
async function roster(env) {
  try { const v = await getSetting(env, "roster"); if (v) return JSON.parse(v); } catch {}
  return DEFAULT_ROSTER;
}
async function isAdmin(req, env) {
  const pass = req.headers.get("x-admin-pass") || "";
  const want = await getSetting(env, "admin_hash");
  const ok = !!want && pass.length > 0 && (await sha("tc4admin:" + pass)) === want;
  if (!ok) await new Promise((r) => setTimeout(r, 800)); // 拖慢暴力猜密碼
  return ok;
}
const ID_RE = /^[a-z0-9]{2,24}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/api/roster") {
      if (req.method === "GET") return json(await roster(env));
      if (req.method === "PUT") {
        if (!(await isAdmin(req, env))) return json({ error: "admin only" }, 403);
        let list;
        try { list = JSON.parse(await req.text()); } catch { return json({ error: "bad json" }, 400); }
        if (!Array.isArray(list) || list.length < 1 || list.length > 20) return json({ error: "1–20 people" }, 400);
        const seen = new Set();
        const clean = [];
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

    if (path.startsWith("/api/")) return json({ error: "not found" }, 404);
    return new Response(HTML, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  },
};
