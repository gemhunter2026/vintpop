# VintPop Radar

**Production board:** https://kxknbgenxibrzopjtjtc.supabase.co/functions/v1/vintpop-board

Private MVP that continuously scans recent Wallapop listings under €100, scores seller/text context with TypeSafe Jev, sends only promising candidates to Google Cloud Vision Web Detection, then runs a final Jev decision and saves `HOT / REVIEW / DISCARDED` candidates in Supabase.

## Automatic pipeline

1. GitHub Actions runs every 5 minutes.
2. Searches Wallapop public results for vintage-oriented keywords, newest first, max €100, Home & Garden when the category can be resolved.
3. Deduplicates by Wallapop item ID in Supabase.
4. Fetches public seller profile/stats/listings and asks Jev narrow questions about seller sophistication, item age signals and whether a visual lookup is justified.
5. Only the strongest pre-candidates are sent to Google Cloud Vision `WEB_DETECTION` using the main listing image.
6. Jev evaluates the listing again with the web-visual matches and the app assigns `HOT`, `REVIEW`, or `DISCARDED`.
7. The mobile-first Next.js board reads the results from Supabase.

## Only two secrets to add

The production board is already deployed. Scanning stays idle (without failing) until both secrets exist.

In GitHub → **Settings → Secrets and variables → Actions**, add:

- `GOOGLE_VISION_API_KEY` — Google Cloud Vision API key with Vision API enabled.
- `TYPESAFE_API_KEY` — TypeSafe Jev API key.

Then use **Actions → VintPop Radar → Run workflow** once, or wait for the 5-minute schedule.

## Current search terms

`antiguo`, `antigua`, `lámpara antigua`, `lampara antigua`, `silla antigua`, `sillón antiguo`, `mueble antiguo`, `viejo`, `vieja`, `retro`, `años 60`, `años 70`, `space age`.

These live in `supabase/functions/vintpop-collector/index.ts` and can be tuned after seeing precision/recall.

## Architecture

- Next.js 16 + Vercel: board
- Supabase: listings/runs persistence + Edge Function collector
- GitHub Actions: 5-minute scheduler and secret injection
- TypeSafe Jev: structured probabilistic classification
- Google Cloud Vision Web Detection: visual/web identification for pre-filtered candidates

The Wallapop interface used by the collector is undocumented and can change. The collector isolates that code so it can be replaced without changing the board or scoring pipeline.
