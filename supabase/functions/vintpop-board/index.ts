import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function pct(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) + "%" : "—";
}
function getNoul(block: any, key: string) {
  const v = block?.answers?.[key]?.noul;
  return typeof v === "number" ? v : null;
}
function ageLabel(value: string | null) {
  if (!value) return "fecha desconocida";
  const ms = Date.now() - new Date(value).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}
function card(l: any) {
  const sellerUnaware = getNoul(l.jev_pre, "seller_unaware");
  const vintage = getNoul(l.jev_final, "collectible_vintage") ?? getNoul(l.jev_pre, "vintage_signal");
  const underpriced = getNoul(l.jev_final, "likely_underpriced");
  const score = Math.round(Number(l.candidate_score ?? l.pre_score ?? 0) * 100);
  const image = l.image_url ? `<img src="${escapeHtml(l.image_url)}" alt="" loading="lazy">` : '<div class="noimg">Sin foto</div>';
  const queries = Array.isArray(l.matched_queries) ? l.matched_queries.slice(0,4).map((q:string)=>`<span>${escapeHtml(q)}</span>`).join("") : "";
  return `<article class="card ${l.status}">
    <div class="image">${image}<b class="badge">${escapeHtml(String(l.status).toUpperCase())}</b><i class="score">${score}</i></div>
    <div class="body">
      <div class="row"><div><h3>${escapeHtml(l.title)}</h3><small>${escapeHtml(l.location_city || "España")} · ${ageLabel(l.wallapop_created_at)}</small></div><strong>${Number(l.price).toFixed(Number(l.price)%1?2:0)} €</strong></div>
      <div class="signals">
        <div><small>Vintage / collectible</small><b>${pct(vintage)}</b></div>
        <div><small>Seller unaware</small><b>${pct(sellerUnaware)}</b></div>
        <div><small>Likely underpriced</small><b>${pct(underpriced)}</b></div>
        <div><small>Visual web match</small><b>${pct(l.visual_score)}</b></div>
      </div>
      <p class="seller">${escapeHtml(l.seller_name || "Vendedor")} · ${l.seller_active_count ?? "—"} anuncios · ${l.seller_furniture_count ?? "—"} similares</p>
      <div class="queries">${queries}</div>
      <a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">Abrir en Wallapop ↗</a>
    </div>
  </article>`;
}

Deno.serve(async () => {
  let publishable = "";
  try { publishable = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default || ""; } catch {}
  publishable ||= Deno.env.get("SUPABASE_ANON_KEY") || "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publishable, { auth: { persistSession: false } });

  const [{ data: listings, error }, { data: runs }] = await Promise.all([
    supabase.from("vintpop_listings").select("*").in("status", ["hot","review"]).order("candidate_score", { ascending: false }).order("first_seen_at", { ascending: false }).limit(100),
    supabase.from("vintpop_runs").select("*").order("started_at", { ascending: false }).limit(1),
  ]);
  const all = listings ?? [], hot = all.filter((x:any)=>x.status==="hot"), review = all.filter((x:any)=>x.status==="review");
  const lastRun = runs?.[0] ?? null;
  const setup = !lastRun ? `<section class="setup"><label>Falta un último paso</label><h2>Añade Google Vision + Jev en GitHub Secrets</h2><p>En el repo <b>gemhunter2026/vintpop</b> → Settings → Secrets and variables → Actions, crea <code>GOOGLE_VISION_API_KEY</code> y <code>TYPESAFE_API_KEY</code>. El radar se ejecutará automáticamente cada 5 minutos.</p></section>` : `<p class="lastrun">Última pasada: ${new Date(lastRun.started_at).toLocaleString("es-ES",{timeZone:"Europe/Madrid"})}</p>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f4efe4"><meta http-equiv="refresh" content="60"><title>VintPop Radar</title>
  <style>
  :root{--ink:#1e211c;--paper:#f4efe4;--card:#fffdf7;--line:#d9d0bf;--hot:#c7542a;--muted:#787467}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.13;background-image:radial-gradient(#6c675a .55px,transparent .55px);background-size:7px 7px}main{max-width:1160px;margin:auto;padding:0 16px 50px;position:relative}.hero{padding:38px 0 24px;border-bottom:1px solid var(--line)}.eyebrow{font-size:10px;letter-spacing:.16em;font-weight:900;color:var(--hot)}h1{font-family:Georgia,serif;font-size:clamp(50px,11vw,94px);line-height:.88;letter-spacing:-.055em;font-weight:500;margin:10px 0 16px}h1 em{color:var(--hot);font-weight:500}.hero>p{color:#555348;font-size:14px;line-height:1.5;margin:0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-top:24px}.stats div{background:#fffdf7c7;padding:13px}.stats b{display:block;font:500 28px Georgia,serif}.stats span{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.setup{background:#fff8df;border:1px solid var(--line);padding:18px;margin:20px 0}.setup label{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:var(--hot)}.setup h2{font:500 25px Georgia,serif;margin:6px 0}.setup p{font-size:13px;line-height:1.55;margin:0;color:#5c584d}code{background:#ede5d4;padding:2px 5px;border-radius:4px}.lastrun{font-size:11px;color:var(--muted);margin:18px 0}.section{margin-top:30px}.sectionhead{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--ink);padding-bottom:7px;margin-bottom:15px}.sectionhead h2{font:500 28px Georgia,serif;margin:0}.sectionhead span{font-size:11px;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.card{background:var(--card);border:1px solid var(--line);box-shadow:0 7px 24px #2822160a;min-width:0}.card.hot{border-color:#cfa38f}.image{aspect-ratio:4/3;position:relative;background:#e8e1d4;overflow:hidden}.image img{width:100%;height:100%;object-fit:cover}.noimg{height:100%;display:grid;place-items:center;color:var(--muted)}.badge,.score{position:absolute;top:10px}.badge{left:10px;padding:6px 8px;background:#827640;color:#fff;font-size:9px;letter-spacing:.1em}.hot .badge{background:var(--hot)}.score{right:10px;width:42px;height:42px;border-radius:50%;background:#f4efe4ed;border:1px solid #0002;display:grid;place-items:center;font:17px Georgia,serif}.body{padding:14px}.row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.row h3{font:500 20px/1.06 Georgia,serif;margin:0}.row small{font-size:10px;color:var(--muted)}.row>strong{color:var(--hot);font-size:18px;white-space:nowrap}.signals{display:grid;grid-template-columns:1fr 1fr;border-left:1px solid var(--line);border-top:1px solid var(--line);margin:14px 0}.signals div{padding:8px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.signals small{display:block;font-size:8px;text-transform:uppercase;color:var(--muted)}.signals b{font:500 17px Georgia,serif}.seller{font-size:10px;color:#625e53}.queries{display:flex;flex-wrap:wrap;gap:5px}.queries span{font-size:9px;border:1px solid var(--line);padding:3px 6px;color:var(--muted)}.body>a{display:block;margin-top:13px;padding:11px;background:var(--ink);color:white;text-align:center;text-decoration:none;font-size:12px;font-weight:700}.empty{border:1px dashed var(--line);padding:28px;text-align:center;color:var(--muted)}.err{background:#ffe5e5;padding:12px;color:#772b2b}footer{border-top:1px solid var(--line);margin-top:42px;padding-top:14px;font-size:9px;color:var(--muted);display:flex;justify-content:space-between;gap:12px}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){main{padding:0 12px 36px}.hero{padding-top:27px}.stats{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr}.section{margin-top:25px}footer{flex-direction:column}}
  </style></head><body><main>
  <header class="hero"><div class="eyebrow">AUTOMATED VINTAGE SCOUT</div><h1>VintPop <em>Radar</em></h1><p>Wallapop → Jev → Google Vision → oportunidades que merece la pena revisar.</p>
  <div class="stats"><div><b>${hot.length}</b><span>Hot</span></div><div><b>${review.length}</b><span>Review</span></div><div><b>${lastRun?.new_count ?? 0}</b><span>Nuevos última pasada</span></div><div><b>${lastRun?.google_calls ?? 0}</b><span>Google checks</span></div></div></header>
  ${error ? `<p class="err">Error leyendo el board: ${escapeHtml(error.message)}</p>` : ""}
  ${setup}
  <section class="section"><div class="sectionhead"><h2>🔥 Hot</h2><span>${hot.length}</span></div>${hot.length ? `<div class="grid">${hot.map(card).join("")}</div>` : '<div class="empty">Todavía no hay oportunidades HOT.</div>'}</section>
  <section class="section"><div class="sectionhead"><h2>👀 Review</h2><span>${review.length}</span></div>${review.length ? `<div class="grid">${review.map(card).join("")}</div>` : '<div class="empty">Los candidatos dudosos aparecerán aquí.</div>'}</section>
  <footer><span>VintPop MVP</span><span>≤100 € · búsquedas automáticas · sin login Wallapop · refresco 60s</span></footer>
  </main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=20" } });
});