# PackWatcher

PackWatcher is a standalone public MVP for TCG collectors: restock alerts, product watchlists, inventory tracking, and resale profit estimates. It is Pokemon-first and structured to expand into Magic, Lorcana, One Piece, sports cards, Yu-Gi-Oh, and more.

PackWatcher does not implement auto-checkout, CAPTCHA bypassing, queue bypassing, account automation, retailer protection circumvention, or automated purchasing/selling.

## Tech Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS
- Supabase Auth and Postgres
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
DISCORD_WEBHOOK_URL=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
FIREBASE_SERVER_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=
```

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

## Stock Checking

The MVP stock checker fetches public HTML and uses safe keyword matching:

- `in stock`
- `add to cart`
- `sold out`
- `out of stock`

Retailer adapters live in `lib/stock-checkers/`:

- `pokemon-center.ts`
- `target.ts`
- `walmart.ts`
- `bestbuy.ts`
- `generic.ts`

Admin cron endpoints:

```bash
curl -X POST http://localhost:3000/api/check-product \
  -H "content-type: application/json" \
  -H "x-admin-secret: $ADMIN_CHECK_SECRET" \
  -d "{\"productId\":\"PRODUCT_UUID\"}"

curl -X POST http://localhost:3000/api/check-all \
  -H "x-admin-secret: $ADMIN_CHECK_SECRET"
```

## Stripe

The app includes:

- `POST /api/stripe/checkout`
- `POST /api/stripe/webhook`
- `billing_status` table
- Free, Pro, and Admin plans

Create a Stripe recurring price for the PRO plan, then set `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID`.

## Vercel Deployment

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Add every variable from `.env.example`.
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel URL.
5. Add Supabase production auth callback URLs:
   - `https://your-domain.com/auth/callback`
6. Add your production site URL in Supabase Auth URL configuration.
7. Enable Google and Discord providers in Supabase, then add the provider callback URL from Supabase into each provider dashboard.
8. Configure a Vercel Cron job to call `/api/check-all` with `x-admin-secret`.
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
