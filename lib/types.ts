export type ListingStatus = "hot" | "review" | "discarded" | "pending" | "error";

export interface Listing {
  id: string;
  url: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  image_url: string | null;
  location_city: string | null;
  seller_id: string | null;
  seller_name: string | null;
  seller_type: string | null;
  seller_badge: string | null;
  seller_rating: number | null;
  seller_review_count: number | null;
  seller_active_count: number | null;
  seller_furniture_count: number | null;
  matched_queries: string[] | null;
  wallapop_created_at: string | null;
  first_seen_at: string;
  last_analyzed_at: string | null;
  pre_score: number | null;
  visual_score: number | null;
  candidate_score: number | null;
  status: ListingStatus;
  jev_pre: Record<string, unknown> | null;
  google_vision: Record<string, unknown> | null;
  jev_final: Record<string, unknown> | null;
  seller_summary: Record<string, unknown> | null;
  error: string | null;
}

export interface Run {
  id: number;
  started_at: string;
  finished_at: string | null;
  fetched_count: number;
  new_count: number;
  analyzed_count: number;
  google_calls: number;
  hot_count: number;
  review_count: number;
  errors: unknown[] | null;
}
