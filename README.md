# PackWatcher

PackWatcher is a standalone public MVP for TCG collectors: restock alerts, product watchlists, inventory tracking, and resale profit estimates. It is Pokemon-first and structured to expand into Magic, Lorcana, One Piece, sports cards, Yu-Gi-Oh, and more.

PackWatcher does not implement auto-checkout, CAPTCHA bypassing, queue bypassing, retailer protection circumvention, or automated purchasing/selling. eBay listing support is user-initiated only: the user reviews a draft and explicitly publishes it.

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
REVERSE_GEOCODE_URL=
SHOPPING_SEARCH_PROVIDER=
SHOPPING_SEARCH_API_URL=
SHOPPING_SEARCH_API_KEY=
SHOPPING_SEARCH_QUERY=pokemon sealed product
SERPAPI_SEARCH_ENGINES=google_shopping,walmart,amazon,ebay
TCGCSV_MAX_GROUPS=250
TCGCSV_MAX_PRODUCTS=5000
TCGCSV_QUICK_MAX_GROUPS=40
TCGCSV_QUICK_MAX_PRODUCTS=1000
CATALOG_OFFER_CHECK_LIMIT=100
MONITOR_JOB_BATCH_LIMIT=25
MONITOR_JOB_ENQUEUE_LIMIT=1000
MONITOR_JOB_LEASE_SECONDS=300
MONITOR_JOB_IN_STOCK_INTERVAL_MINUTES=20
MONITOR_JOB_OUT_OF_STOCK_INTERVAL_MINUTES=120
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
EBAY_ENVIRONMENT=production
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_RU_NAME=
EBAY_TOKEN_ENCRYPTION_KEY=
EBAY_MARKETPLACE_ID=EBAY_US
EBAY_SCOPES=https://api.ebay.com/oauth/api_scope/commerce.identity.readonly https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account
EBAY_ACCOUNT_DELETION_ENDPOINT=https://packwatcher.vercel.app/api/ebay/account-deletion
EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
SENTRY_ENVIRONMENT=
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_PROFILES_SAMPLE_RATE=0
NEXT_PUBLIC_SENTRY_ENVIRONMENT=
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=0.2
```

`FFMPEG_PATH` is optional when `ffmpeg` is already available on your system `PATH`. On Windows, install FFmpeg and set this to the full binary path if needed, for example `C:\ffmpeg\bin\ffmpeg.exe`.

`OPENAI_API_KEY` is optional for PackWatcher Clips. Keep `CLIPS_ENABLE_OPENAI=false` to force free local/manual mode. If OpenAI is unavailable or quota-limited, the Clips workflow still works with FFmpeg thumbnails and manual confirmation.

When `CLIPS_ENABLE_OPENAI=true`, Clips sends extracted reveal thumbnails to OpenAI for card-name recognition. Recognized card names are priced through the free TCGCSV data source. `CLIPS_TCGCSV_MAX_GROUPS` limits how many Pokemon set groups the value lookup scans per processing run.

## eBay Selling

PackWatcher can create user-reviewed eBay listings from Inventory cards through the official eBay OAuth and Sell Inventory APIs.

Required setup:

1. Create an eBay Developer application.
2. Configure the app's OAuth accept URL to your PackWatcher callback:
   - Local: `http://localhost:3000/api/ebay/oauth/callback`
   - Production: `https://your-domain.com/api/ebay/oauth/callback`
3. Copy the app Client ID, Client Secret, and RuName into `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, and `EBAY_RU_NAME`.
4. Set `EBAY_TOKEN_ENCRYPTION_KEY` to a long random secret. Changing it invalidates stored eBay refresh tokens.
5. Add the eBay scopes in `.env.example`.
6. Run `supabase/migrations/016_ebay_selling.sql`.
7. Run `supabase/migrations/031_ebay_oauth_state_and_token_health.sql` to add server-side eBay OAuth state tracking and token-health fields.
8. In Account, connect eBay and save seller defaults. PackWatcher fetches available Seller Hub business policies and Inventory API merchant locations from eBay using the connected account token, then shows them as dropdowns:
   - Inventory location
   - Payment policy
   - Return policy
   - Fulfillment/shipping policy
   - Marketplace, category, condition, currency, duration

If the dropdowns are empty, create business policies and an inventory location in eBay Seller Hub, then refresh the Account page. PackWatcher keeps manual ID entry as an advanced fallback for newly created eBay objects that have not appeared in the API response yet.

The default Pokemon single-card category ID is `183454` for eBay's Individual Collectible Card Game Cards category. Users can override it per account or per listing.

How to test:

1. Connect eBay from Account.
2. Save eBay listing defaults.
3. Open Inventory.
4. Click `Sell on eBay` on a card.
5. Review the listing draft.
6. Click `Publish and open eBay listing`.

If eBay rejects the listing, PackWatcher stores the failed attempt and displays the eBay error on the listing draft page. Common failures are missing business policies, missing inventory location, invalid category, missing card image, or seller account restrictions.

eBay OAuth is an account integration, not a PackWatcher sign-in provider. Google/Discord Supabase auth stays separate from eBay authorization. PackWatcher stores a short-lived server-side eBay OAuth state tied to the current Supabase user before redirecting to eBay, then the eBay callback uses that state to save the eBay connection without calling Supabase auth callback/session exchange.

Existing users who connected eBay before `commerce.identity.readonly` was added should disconnect and reconnect once so PackWatcher can store the immutable eBay user ID used for account-deletion matching.

### eBay Marketplace Account Deletion

PackWatcher exposes the eBay marketplace account deletion endpoint at:

```text
https://packwatcher.vercel.app/api/ebay/account-deletion
```

Required setup:

1. Run `supabase/migrations/030_ebay_account_deletion_events.sql` and `supabase/migrations/031_ebay_oauth_state_and_token_health.sql`.
2. Set `EBAY_ACCOUNT_DELETION_ENDPOINT` to the exact URL entered in the eBay Developer Portal. The default production value is `https://packwatcher.vercel.app/api/ebay/account-deletion`.
3. Set `EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN` to the same 32-80 character verification token entered in eBay. Use only letters, numbers, underscores, and hyphens.
4. In the eBay Developer Portal marketplace account deletion settings, enter:
   - Endpoint URL: `https://packwatcher.vercel.app/api/ebay/account-deletion`
   - Verification token: the exact value from `EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN`
5. Send eBay's endpoint validation challenge and confirm it succeeds.
6. Send a test account-deletion notification from eBay.

The GET challenge response uses SHA-256 over:

```text
challengeCode + verificationToken + endpointURL
```

with no separators. The endpoint URL must match `EBAY_ACCOUNT_DELETION_ENDPOINT` exactly, including protocol, host, path, and any trailing slash differences.

Local challenge verification:

```bash
EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN=test_token_123456789012345678901234567890 \
EBAY_ACCOUNT_DELETION_ENDPOINT=https://packwatcher.vercel.app/api/ebay/account-deletion \
node scripts/ebay-account-deletion-challenge.mjs test_challenge
```

On POST, PackWatcher records the `notificationId` idempotently, matches stored eBay connections by `notification.data.userId` or `notification.data.username` when present, removes encrypted eBay tokens and seller defaults, and scrubs eBay listing identifiers/payload metadata. Normal PackWatcher inventory and collection data is preserved.

eBay sends an `X-EBAY-SIGNATURE` header for notification validation. PackWatcher does not invent a custom signature algorithm; the deletion logic is isolated so the official eBay Event Notification SDK verifier can be added without changing the data deletion path.

## Production Monitoring

PackWatcher uses `@sentry/nextjs` as an optional external monitoring layer. Without a Sentry DSN, the app continues to run and still writes internal warning/error records to `app_events`.

To enable Sentry in Vercel:

1. Create a Sentry project for PackWatcher, using the Next.js platform.
2. Add `NEXT_PUBLIC_SENTRY_DSN` from Sentry's client DSN.
3. Add `SENTRY_DSN` with the same DSN for server-side capture, or leave it blank to reuse `NEXT_PUBLIC_SENTRY_DSN`.
4. Add `SENTRY_ORG` and `SENTRY_PROJECT` so source maps can be associated with the right Sentry project.
5. Add `SENTRY_AUTH_TOKEN` if you want production source maps uploaded during Vercel builds.
6. Optional: set `SENTRY_ENVIRONMENT=production` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`.

Captured categories include scanner failures, centering failures, OpenAI quota/errors, retailer discovery and monitor failures, push notification failures, Stripe webhook failures, and app-level React route errors. Metadata is sanitized before it is sent to Sentry; tokens, cookies, push keys, signatures, and large image payloads are redacted or omitted.

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

Run `supabase/migrations/027_tracker_restock_pipeline.sql` to add the durable tracker pipeline:

- `availability_observations` stores normalized retailer evidence.
- `listing_latest_state` stores the reduced latest state used by the UI.
- `restock_events` stores immutable confirmed/test restock transitions.
- `notification_outbox` queues push delivery separately from retailer checks.
- `monitor_jobs` stores due retailer checks and worker leases.

Run `supabase/migrations/028_monitor_jobs_and_retailer_rollout.sql` after migration `027` to add:

- `retailer_rollout`, the admin-visible 20-retailer support matrix.
- `claim_monitor_jobs(...)`, an atomic `FOR UPDATE SKIP LOCKED` lease function for workers.
- A unique offer-job key so each catalog offer has one reusable monitor job.

Admins can run a worker batch from **Admin -> Retail jobs -> Run worker batch**. Cron or an external worker can call `GET /api/monitor/run?enqueue=true&limit=25` with `Authorization: Bearer $CRON_SECRET`; admin tools can call `POST /api/monitor/run` with `x-admin-secret: $ADMIN_CHECK_SECRET`.

Run `supabase/migrations/029_card_centering_analyses.sql` to add Centering Check persistence:

- `card_centering_analyses` stores owner-scoped centering estimates tied to exact inventory entries when available.
- `card-centering` is a private Supabase Storage bucket for optional front/back photos.
- Users can save measurements without saving photos; saved images live under user-specific private paths and require signed access.

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
- Centering Check at `/scanner/centering` for front/back centering estimates separate from normal card identification.

Scanner pricing uses the free TCGCSV data source. Camera/image recognition uses OpenAI only when `CLIPS_ENABLE_OPENAI=true` and `OPENAI_API_KEY` are configured. For Japanese, Chinese, and Korean cards, Scanner attempts to identify the printed card and normalize it to an English pricing name when possible. If OpenAI is unavailable, quota-limited, or the card cannot be matched, users can still manually add card names and get TCGCSV pricing.

### Centering Check

Centering Check is a grading-precheck measurement tool, not a grading prediction. It estimates front and back centering from captured photos, lets the user adjust physical card corners and inner printed-frame lines, and compares the measured ratios to versioned informational PSA/Beckett centering references. It does not evaluate corners, edges, surface, print defects, authenticity, staining, alteration, focus, or eye appeal.

Access points:

- Scanner: `/scanner` -> **Check centering**.
- Inventory: `/inventory/[id]/edit` -> **Centering Check**.

Centering Check loads OpenCV.js at runtime for automatic card-boundary contour detection and perspective correction, then falls back to PackWatcher-owned edge detection if OpenCV is unavailable. When an inventory card has a reference image, the flow attempts reference-assisted front-frame initialization; if the image cannot be read because of CORS or image quality, the user can still adjust the inner printed-frame lines manually.

No OpenCV.js source code or third-party crop-editor code is copied into the repository.

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
- Offer checks now record normalized observations, reduce them into latest state, create deduped restock events, queue notification outbox rows, and then process push delivery. Raw retailer output should not directly send a push alert.
- Dashboard and Watchlist automatically attempt a quick TCGCSV sync if the catalog is empty, so users do not land on a blank catalog.
- Pokemon Center and Amazon have retailer-specific safe monitoring adapters.
- Walmart, Target, GameStop, Pokemon Center, Amazon, Best Buy, and other product URLs can be added through the Admin bulk URL importer, then monitored by the safe stock checker.

Admin restock testing:

1. Open Admin.
2. Use **Send test notification** for a direct device push test.
3. Use **Simulate full restock pipeline** to create synthetic `out_of_stock -> in_stock` observations for a catalog offer.
4. Confirm the Admin **Restock pipeline** panel shows a test restock event and notification outbox job.
5. Test rows are marked `is_test=true` and should not be treated as real retailer analytics.
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
- With `SHOPPING_SEARCH_PROVIDER=serpapi`, PackWatcher can fan out across `SERPAPI_SEARCH_ENGINES`. Supported values are `google_shopping`, `walmart`, `amazon`, and `ebay`. Use fewer engines if SerpAPI quota gets tight.
- Authenticated users can run search-triggered discovery from the catalog search box. The `/api/catalog/discover` route searches enabled retailer sources and the optional shopping-search provider for the entered pack/box name, saves discovered listings, records search interest when possible, and refreshes local catalog results. It is intentionally click-triggered, rate-limited, and bounded by `USER_DISCOVERY_RESULT_LIMIT`.
- Background processing now has two paths: `/api/catalog/sync` imports/discovers catalog data, while `/api/monitor/run` claims leased `monitor_jobs`, checks due catalog offers, records observations, queues restock notifications, and reschedules jobs with jitter/backoff. This works from Admin, Vercel Cron, or an authenticated external scheduler/worker.
- Local-first sorting prioritizes verified pickup/local offers ahead of shipping and marketplace listings, then orders local offers by `distanceMiles` metadata or store/user coordinates when available. ZIP-based searches still bias discovery toward nearby stores even when a retailer does not expose exact coordinates.
- `retailer_rollout` keeps the full 20-retailer matrix visible to admins and separates `connected`, `partially_supported`, and `not_supported` retailers. Public UI should only treat `public_enabled=true` rows as live inventory sources.

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

curl -X POST "http://localhost:3000/api/monitor/run?enqueue=true&limit=25" \
  -H "x-admin-secret: $ADMIN_CHECK_SECRET"

curl "http://localhost:3000/api/monitor/run?enqueue=true&limit=25" \
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
   - `/api/monitor/run?enqueue=true&limit=25` can be scheduled daily on Vercel Hobby or more frequently through an external scheduler/worker.
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
