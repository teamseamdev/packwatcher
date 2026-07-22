# Launch Remaining Items

Completed launch-readiness items:

- Real-device QA pass for the latest deployment.
- Production Supabase migrations/env synchronization through migration `029`.
- Retailer and local inventory accuracy:
  - SerpAPI discovery fans out across Google Shopping, Walmart, Amazon, and eBay.
  - Search-derived listings are labeled as discovery until a retailer page check verifies them.
  - Pickup, shipping, delivery, stale/last-known, and verified labels are normalized from one shared classifier.
  - Admin can disable and re-enable bad catalog offers without deleting historical data.

Remaining active launch work:

1. Scanner accuracy calibration
   - Test English, Japanese, Chinese, Korean, holo, reverse holo, duplicate, and wrong-set cases.
   - Tune set-constrained OCR/candidate scoring with real scan failures.

2. Centering calibration
   - Compare measurements against manually measured sample cards.
   - Tune OpenCV/fallback edge thresholds for full-art, vintage yellow border, modern silver border, backs, sleeves, glare, and dark backgrounds.

3. Billing production readiness
   - Confirm Stripe checkout, webhooks, promo codes, founder limits, and refund/cancellation copy.

4. Notification reliability
   - Test iOS PWA, Android, desktop push, restock dedupe, and cooldowns in production.

5. Production monitoring
   - Add Sentry or equivalent for scanner, retailer sync, Stripe webhook, notification, and OpenAI errors.

6. Video scanning
   - Keep paused until live scanner, inventory, and centering flows are stable.
