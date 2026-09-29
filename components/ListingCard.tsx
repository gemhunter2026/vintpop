import Image from "next/image";
import type { Listing } from "@/lib/types";

function pct(value: number | null | undefined) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function getNoul(block: Record<string, unknown> | null, key: string): number | null {
  const answers = block?.answers as Record<string, unknown> | undefined;
  const answer = answers?.[key] as Record<string, unknown> | undefined;
  const value = answer?.noul;
  return typeof value === "number" ? value : null;
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

export function ListingCard({ listing }: { listing: Listing }) {
  const sellerUnaware = getNoul(listing.jev_pre, "seller_unaware");
  const vintageSignal = getNoul(listing.jev_final, "collectible_vintage") ?? getNoul(listing.jev_pre, "vintage_signal");
  const underpriced = getNoul(listing.jev_final, "likely_underpriced");
  const score = Math.round((listing.candidate_score ?? listing.pre_score ?? 0) * 100);
  const statusLabel = listing.status === "hot" ? "HOT" : listing.status === "review" ? "REVIEW" : listing.status.toUpperCase();

  return (
    <article className={`card card-${listing.status}`}>
      <div className="image-wrap">
        {listing.image_url ? (
          <Image src={listing.image_url} alt={listing.title} fill sizes="(max-width: 760px) 100vw, 420px" unoptimized />
        ) : (
          <div className="image-placeholder">Sin foto</div>
        )}
        <span className={`status status-${listing.status}`}>{statusLabel}</span>
        <span className="score">{score}</span>
      </div>
      <div className="card-body">
        <div className="title-row">
          <div>
            <h2>{listing.title}</h2>
            <p className="meta">{listing.location_city || "España"} · {ageLabel(listing.wallapop_created_at)}</p>
          </div>
          <strong className="price">{Number(listing.price).toFixed(listing.price % 1 ? 2 : 0)} €</strong>
        </div>

        <div className="signals">
          <div><span>Vintage / collectible</span><b>{pct(vintageSignal)}</b></div>
          <div><span>Seller unaware</span><b>{pct(sellerUnaware)}</b></div>
          <div><span>Likely underpriced</span><b>{pct(underpriced)}</b></div>
          <div><span>Visual web match</span><b>{pct(listing.visual_score)}</b></div>
        </div>

        <div className="seller-line">
          <span>{listing.seller_name || "Vendedor"}</span>
          <span>{listing.seller_active_count ?? "—"} anuncios</span>
          <span>{listing.seller_furniture_count ?? "—"} similares</span>
          {listing.seller_badge ? <span>{listing.seller_badge}</span> : null}
        </div>

        {listing.matched_queries?.length ? (
          <div className="queries">{listing.matched_queries.slice(0, 4).map((q) => <span key={q}>{q}</span>)}</div>
        ) : null}

        <a className="open-link" href={listing.url} target="_blank" rel="noreferrer">Abrir en Wallapop ↗</a>
      </div>
    </article>
  );
}
