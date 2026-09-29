import { ListingCard } from "@/components/ListingCard";
import { supabase } from "@/lib/supabase";
import type { Listing, Run } from "@/lib/types";

export const revalidate = 30;

async function loadData() {
  const [{ data: listings, error }, { data: runs }] = await Promise.all([
    supabase
      .from("vintpop_listings")
      .select("*")
      .in("status", ["hot", "review"])
      .order("candidate_score", { ascending: false })
      .order("first_seen_at", { ascending: false })
      .limit(120),
    supabase.from("vintpop_runs").select("*").order("started_at", { ascending: false }).limit(1),
  ]);
  return { listings: (listings ?? []) as Listing[], lastRun: (runs?.[0] ?? null) as Run | null, error };
}

export default async function Home() {
  const { listings, lastRun, error } = await loadData();
  const hot = listings.filter((x) => x.status === "hot");
  const review = listings.filter((x) => x.status === "review");

  return (
    <main>
      <header className="hero">
        <div className="eyebrow">AUTOMATED VINTAGE SCOUT</div>
        <h1>VintPop <em>Radar</em></h1>
        <p>Wallapop → Jev → Google Vision → oportunidades que merece la pena revisar.</p>
        <div className="stats">
          <div><b>{hot.length}</b><span>Hot</span></div>
          <div><b>{review.length}</b><span>Review</span></div>
          <div><b>{lastRun?.new_count ?? 0}</b><span>Nuevos última pasada</span></div>
          <div><b>{lastRun?.google_calls ?? 0}</b><span>Google checks</span></div>
        </div>
      </header>

      {error ? <div className="notice error">No se ha podido leer Supabase: {error.message}</div> : null}
      {!lastRun ? (
        <section className="setup">
          <span className="setup-kicker">Falta un último paso</span>
          <h2>Añade dos secrets en GitHub y el radar empieza solo.</h2>
          <p>En <b>Settings → Secrets and variables → Actions</b> añade <code>GOOGLE_VISION_API_KEY</code> y <code>TYPESAFE_API_KEY</code>. El workflow está programado cada 5 minutos.</p>
        </section>
      ) : (
        <div className="last-run">Última pasada: {new Date(lastRun.started_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" })}</div>
      )}

      <section className="section">
        <div className="section-head"><h2>🔥 Hot</h2><span>{hot.length}</span></div>
        {hot.length ? <div className="grid">{hot.map((l) => <ListingCard key={l.id} listing={l} />)}</div> : <div className="empty">Todavía no hay oportunidades HOT.</div>}
      </section>

      <section className="section">
        <div className="section-head"><h2>👀 Review</h2><span>{review.length}</span></div>
        {review.length ? <div className="grid">{review.map((l) => <ListingCard key={l.id} listing={l} />)}</div> : <div className="empty">Los candidatos dudosos aparecerán aquí.</div>}
      </section>

      <footer>
        <span>VintPop MVP</span>
        <span>Precio máximo 100 € · búsquedas automáticas · sin login Wallapop</span>
      </footer>
    </main>
  );
}
