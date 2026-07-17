# PackWatcher

PackWatcher is a standalone public MVP for TCG collectors: restock alerts, product watchlists, inventory tracking, and resale profit estimates. It is Pokemon-first and structured to expand into Magic, Lorcana, One Piece, sports cards, Yu-Gi-Oh, and more.

PackWatcher does not implement auto-checkout, CAPTCHA bypassing, queue bypassing, account automation, retailer protection circumvention, or automated purchasing/selling.

## Tech Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS
- Supabase Auth and Postgres
- Supabase Storage for PackWatcher Clips raw videos, thumbnails, and exports
- FFmpeg for local video analysis, clipping, and export
- Optional OpenAI vision analysis for PackWatcher Scanner card recognition
- Stripe skeleton
- Web push / FCM-ready environment placeholders
- Cron-ready admin check APIs
- Vercel-ready deployment

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_CHECK_SECRET=
CRON_SECRET=
DISCORD_WEBHOOK_URL=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
FIREBASE_SERVER_KEY=
BESTBUY_API_KEY=
BESTBUY_IMPORT_QUERY=pokemon trading cards
BESTBUY_IMPORT_PAGE_SIZE=100
TARGET_SEARCH_IMPORT=false
TARGET_SEARCH_QUERY=pokemon cards
WALMART_SEARCH_IMPORT=false
WALMART_SEARCH_QUERY=pokemon cards
GAMESTOP_SEARCH_IMPORT=false
GAMESTOP_SEARCH_QUERY=pokemon cards
RETAILER_SEARCH_LIMIT=12
USER_DISCOVERY_RESULT_LIMIT=8
SHOPPING_SEARCH_PROVIDER=
SHOPPING_SEARCH_API_URL=
SHOPPING_SEARCH_API_KEY=
SHOPPING_SEARCH_QUERY=pokemon sealed product
TCGCSV_MAX_GROUPS=250
TCGCSV_MAX_PRODUCTS=5000
TCGCSV_QUICK_MAX_GROUPS=40
TCGCSV_QUICK_MAX_PRODUCTS=1000
CATALOG_OFFER_CHECK_LIMIT=100
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=
FFMPEG_PATH=
OPENAI_API_KEY=
CLIPS_ENABLE_OPENAI=false
CLIPS_LOCAL_ANALYSIS=true
CLIPS_MAX_UPLOAD_MB=5120
CLIPS_LOCAL_STORAGE_DIR=
CLIPS_OPENAI_MODEL=gpt-4o-mini
CLIPS_TCGCSV_MAX_GROUPS=40
```

`FFMPEG_PATH` is optional when `ffmpeg` is already available on your system `PATH`. On Windows, install FFmpeg and set this to the full binary path if needed, for example `C:\ffmpeg\bin\ffmpeg.exe`.

`OPENAI_API_KEY` is optional for PackWatcher Clips. Keep `CLIPS_ENABLE_OPENAI=false` to force free local/manual mode. If OpenAI is unavailable or quota-limited, the Clips workflow still works with FFmpeg thumbnails and manual confirmation.

When `CLIPS_ENABLE_OPENAI=true`, Clips sends extracted reveal thumbnails to OpenAI for card-name recognition. Recognized card names are priced through the free TCGCSV data source. `CLIPS_TCGCSV_MAX_GROUPS` limits how many Pokemon set groups the value lookup scans per processing run.

## Supabase Setup

1. Create a Supabase project.
2. Open the SQL editor.
3. Run `supabase/schema.sql`.
4. Enable email auth in Supabase Auth.
5. Add your site URL and callback URL:
   - `http://localhost:3000`
   - `http://localhost:3000/auth/callback`
   - Production equivalents after Vercel deployment.
6. Enable Google and Discord in Supabase Auth > Providers.
7. Add each provider's client ID and client secret in Supabase.
8. In Google Cloud and the Discord Developer Portal, use the Supabase callback URL shown in each Supabase provider panel.

Manual admin override for testing:

```sql
update public.profiles
set plan = 'admin'
where email = 'you@example.com';
```

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## MVP User Flow

1. Sign up with email, Google, or Discord.
2. Add products in Watchlist.
3. Trigger a manual check from a product card.
4. See stock status and check history on Dashboard.
5. Receive notification records when a product changes from `out_of_stock` to `in_stock`.
6. Track owned items in Inventory.
7. View estimated profit and ROI.

Watchlist URLs are enriched with safe public metadata when possible, including product title, store hostname, preview image, price, and stock phrase matches. Users can search, sort, filter, and toggle alerts per tracked product.

Admins can add shared catalog products and retailer offers from the Admin area. Users can then track those catalog offers without typing URLs; PackWatcher creates their tracker from the stored retailer link and alert settings.

Existing Supabase projects should run `supabase/migrations/001_catalog.sql` in the Supabase SQL editor. Use `supabase/schema.sql` only for fresh projects.

Run `supabase/migrations/002_push_subscriptions.sql` to enable mobile/browser push subscriptions.

Run `supabase/migrations/003_catalog_tracking_upgrade.sql` to add product-level tracking, live offer fields, indexes, and RLS. Existing projects should run migrations `001`, `002`, and `003` in order. Each migration is safe to rerun.

Run `supabase/migrations/add_packwatcher_clips.sql` to add PackWatcher Clips project tables, private Supabase Storage buckets, and per-user storage policies.

If the `clip-source-videos` bucket already exists and uploads fail with "The object exceeded the maximum allowed size", run `supabase/migrations/006_raise_packwatcher_clips_upload_limit_5gb.sql` to raise Clips source/export uploads to 5 GB.

Run `supabase/migrations/007_retail_aggregation_foundation.sql` to add normalized retail aggregation tables, alert filters, connector health, retail job runs, uncertain match reviews, and notification event dedupe.

During local development, if Supabase Storage still enforces a lower project or plan upload cap, PackWatcher Clips stores the raw source video in the OS temp directory and continues the review/export flow. Set `CLIPS_LOCAL_STORAGE_DIR` to a writable folder if you want to control where local source videos are saved.

## PackWatcher Scanner

PackWatcher Scanner lives at `/scanner` after sign-in. The old `/clips` and `/clips/new` entry points redirect to Scanner while video-editing work is paused.

What V1 includes:

- Single-card camera scan.
- Multi-card camera scan with a green confirmation after each scan, a Next scan action, and an End scan action.
- Video scanning is paused while camera scanning is stabilized.
- Language hints for English, Japanese, Simplified Chinese, Traditional Chinese, and Korean cards.
- Ordered card list with estimated values.
- Manual card add fallback when AI recognition is unavailable or cannot read the card.
- PDF export of the scan results and total estimated value.

Scanner pricing uses the free TCGCSV data source. Camera/image recognition uses OpenAI only when `CLIPS_ENABLE_OPENAI=true` and `OPENAI_API_KEY` are configured. For Japanese, Chinese, and Korean cards, Scanner attempts to identify the printed card and normalize it to an English pricing name when possible. If OpenAI is unavailable, quota-limited, or the card cannot be matched, users can still manually add card names and get TCGCSV pricing.

Scanner limits reset on a rolling 30-day window:

- Free: 20 card scans and 1 video scan.
- Pro: 500 card scans and 5 video scans.
- Founder: 1,000 card scans and 15 video scans.
- Manual inventory entry remains available after scan quota is reached.

## PackWatcher Clips Legacy

The legacy PackWatcher Clips implementation remains in the codebase for later video-editing work, but the user-facing entry point now redirects to Scanner.

What V1 includes:

- Upload MP4/MOV/WEBM raw pack-opening footage up to 5 GB into the private `clip-source-videos` Supabase Storage bucket.
- Create a clip project with product name, total cost paid, pack count, and notes.
- Use local FFmpeg assist to extract thumbnails every two seconds and create likely review moments.
- Optionally use OpenAI vision to identify visible Pokemon cards from extracted reveal frames.
- Look up recognized card values through free TCGCSV pricing data and prefill the review screen.
- Review candidate moments, include/exclude them, edit start/end timestamps, and confirm or correct card names/values.
- Automatically calculate total pull value, profit/loss, ROI percentage, and average value per pack.
- Render a 1080x1920 MP4 with blurred background or center crop plus readable cost/pull/profit/card overlays.
- Store thumbnails in `clip-thumbnails` and exports in `clip-exports`.
- Download finished MP4 exports from the project or export page.

Required local tool:

```bash
ffmpeg -version
npm run dev
```

If `ffmpeg -version` fails, install FFmpeg and set `FFMPEG_PATH` in `.env.local`.

On Windows, one common install path is:

```bash
winget install Gyan.FFmpeg
```

Restart the dev server after installing FFmpeg or changing `.env.local`.

Optional tools for future upgrades:

- PySceneDetect for richer scene detection.
- faster-whisper or whisper.cpp for reaction/audio moment detection.
- OpenAI API key for optional AI card-recognition assistance. TCGCSV pricing lookup does not require a key.

How to test Clips:

1. Start the dev server.
2. Go to `/clips`.
3. Upload a short test video.
4. Enter the product name, total cost, and pack count.
5. Review extracted moments. If OpenAI is enabled and recognized a card, confirm or correct the prefilled card name/value. Otherwise manually enter the card values.
6. Export and download a vertical MP4.

Catalog importers:

- TCGCSV Pokemon sealed importer seeds shared Pokemon sealed products from server-side TCGCSV data.
- Best Buy importer uses `BESTBUY_API_KEY` to import Pokemon-related Best Buy offers with API-backed availability.
- Retailer search discovery can import public product pages from Target, Walmart, and GameStop search results when `TARGET_SEARCH_IMPORT`, `WALMART_SEARCH_IMPORT`, or `GAMESTOP_SEARCH_IMPORT` is set to `true`.
- `POST /api/catalog/sync` imports every currently available catalog source using `x-admin-secret`.
- `GET /api/catalog/sync` supports Vercel Cron using `Authorization: Bearer $CRON_SECRET`.
- Catalog sync always attempts TCGCSV, runs Best Buy when `BESTBUY_API_KEY` is configured, and runs retailer search discovery only for explicitly enabled retailers.
- Imports use chunked upserts, so repeated syncs update the catalog without creating duplicate products or offers.
- Existing catalog offers are checked after imports. Only an unavailable-to-available transition creates in-app and web push alerts.
- Dashboard and Watchlist automatically attempt a quick TCGCSV sync if the catalog is empty, so users do not land on a blank catalog.
- Pokemon Center and Amazon have retailer-specific safe monitoring adapters.
- Walmart, Target, GameStop, Pokemon Center, Amazon, Best Buy, and other product URLs can be added through the Admin bulk URL importer, then monitored by the safe stock checker.
- Prefer official feeds/APIs where available. Use URL monitoring only for public product pages and never for checkout, queue, CAPTCHA, or account automation.

Push notifications:

- Generate VAPID keys with `npx web-push generate-vapid-keys`.
- Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Vercel.
- Android works in supported browsers.
- iOS requires Safari 16.4+ and the site installed to the Home Screen before web push can be enabled.

## Stock Checking

The MVP stock checker fetches public product HTML and uses schema.org availability plus safe keyword matching:

- `in stock`
- `add to cart`
- `available to ship`
- `pickup available`
- `sold out`
- `out of stock`

Retailer adapters live in `lib/stock-checkers/`:

- `pokemon-center.ts`
- `target.ts`
- `walmart.ts`
- `bestbuy.ts`
- `gamestop.ts`
- `generic.ts`

The catalog offer monitor interface lives in `lib/retailers/`. Best Buy, Target, Walmart, GameStop, and Pokemon Center currently use conservative URL checks; official catalog APIs can be added behind the same interface.

Retailer search discovery lives in `lib/catalog-importers/retailer-search.ts`. It is intentionally conservative: it fetches configured public search result pages, extracts product links, checks those product pages, and upserts catalog offers. It does not automate accounts, carts, checkout, queue bypassing, CAPTCHA bypassing, or protected endpoints. Retailers may block server-side requests; blocked sources fail gracefully and do not stop the rest of catalog sync.

Retail aggregation foundation:

- Canonical products remain in `catalog_products`; retailer listings are normalized into `retailer_products` when migration `007` is applied.
- Availability checks are stored as `availability_snapshots` with normalized status, price, shipping/pickup/delivery flags, seller, source metadata, and checked time.
- Product matching in `lib/retailers/shared/product-matching.ts` uses UPC first, then normalized title, set, product type, release date, and conservative fuzzy matching. Low-confidence matches go to `product_match_reviews` instead of being merged automatically.
- Price aggregation in `lib/retailers/shared/price-aggregation.ts` excludes unavailable listings, excludes third-party marketplace sellers by default, deduplicates listings, and uses median/trimmed average logic to avoid reseller outliers.
- Restock alert filtering and dedupe live in `lib/retailers/shared/restock-events.ts`. Event keys include user, retailer listing, availability type, store, price bucket, and status.
- Optional shopping-search discovery uses `SHOPPING_SEARCH_PROVIDER`, `SHOPPING_SEARCH_API_URL`, and `SHOPPING_SEARCH_API_KEY`. Shopping-search results are discovery and price hints only; PackWatcher still attempts retailer-specific verification before treating inventory as confirmed.
- Authenticated users can run search-triggered discovery from the catalog search box. The `/api/catalog/discover` route searches enabled retailer sources and the optional shopping-search provider for the entered pack/box name, saves discovered listings, records search interest when possible, and refreshes local catalog results. It is intentionally click-triggered, rate-limited, and bounded by `USER_DISCOVERY_RESULT_LIMIT`.
- Background processing currently uses the existing Vercel Cron-compatible `/api/catalog/sync` path plus admin-triggered sync. The new job/health tables make it straightforward to move catalog sync, discovery, availability checks, aggregation, and notifications into Trigger.dev, Inngest, Upstash QStash, BullMQ, or a dedicated worker when check volume grows.

Admin cron endpoints:

```bash
curl -X POST http://localhost:3000/api/check-product \
  -H "content-type: application/json" \
  -H "x-admin-secret: $ADMIN_CHECK_SECRET" \
  -d "{\"productId\":\"PRODUCT_UUID\"}"

curl -X POST http://localhost:3000/api/check-all \
  -H "x-admin-secret: $ADMIN_CHECK_SECRET"

curl -X POST http://localhost:3000/api/catalog/sync \
  -H "x-admin-secret: $ADMIN_CHECK_SECRET"

curl http://localhost:3000/api/catalog/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Stripe

The app includes:

- `POST /api/stripe/checkout`
- `POST /api/stripe/webhook`
- `billing_status` table
- Free, Pro, Founder, and Admin plans

Create Stripe prices, then set:

- `NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID` for Pro at $4.99/month.
- `NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID` for Pro at $45/year.
- `NEXT_PUBLIC_STRIPE_FOUNDER_PRICE_ID` for the one-time $250 Founder membership.

`NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` is still accepted as a legacy fallback for Pro monthly.

## Vercel Deployment

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Add every variable from `.env.example`.
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel URL.
5. Add Supabase production auth callback URLs:
   - `https://your-domain.com/auth/callback`
6. Add your production site URL in Supabase Auth URL configuration.
7. Enable Google and Discord providers in Supabase, then add the provider callback URL from Supabase into each provider dashboard.
8. Configure Vercel Cron jobs:
   - `/api/catalog/sync` daily to refresh searchable catalog products.
   - Vercel Cron should call `GET /api/catalog/sync` with `Authorization: Bearer $CRON_SECRET`.
   - Manual/admin calls can still use `POST /api/catalog/sync` with `x-admin-secret`.
   - For checks more frequent than the Vercel Hobby daily schedule, use an authenticated external scheduler such as GitHub Actions, cron-job.org, Upstash QStash, or a paid Vercel plan.
9. Configure the Stripe webhook URL:
   - `https://your-domain.com/api/stripe/webhook`

## Current File Tree

```text
app/
  (app)/
    account/
    admin/
    alerts/
    billing/
    dashboard/
    inventory/
    pricing/
    watchlist/
    error.tsx
    layout.tsx
    loading.tsx
  (auth)/
    login/
    signup/
  api/
    check-all/
    check-product/
    stripe/
  auth/callback/
  globals.css
  layout.tsx
  manifest.ts
  page.tsx
components/
lib/
  stock-checkers/
  supabase/
public/
supabase/schema.sql
```
