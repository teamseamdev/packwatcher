# Launch Remaining Items

Completed launch-readiness items:

- Real-device QA pass for the latest deployment.
- Production Supabase migrations/env synchronization through migration `029`.
- Retailer and local inventory accuracy:
  - SerpAPI discovery fans out across Google Shopping, Walmart, Amazon, and eBay.
  - Search-derived listings are labeled as discovery until a retailer page check verifies them.
  - Pickup, shipping, delivery, stale/last-known, and verified labels are normalized from one shared classifier.
  - Admin can disable and re-enable bad catalog offers without deleting historical data.
- Scanner accuracy calibration:
  - Noisy OCR collector numbers such as `065 086`, `#065/086 EN`, and OCR-confused promo/subset numbers are extracted before matching.
  - Selected-set matching handles English plus Japanese, Chinese, and Korean OCR names when the collector number is reliable.
  - Fixed wrong-number scans now require confirmation when the name strongly points to a different card in the selected set.
  - Numerator-only scans can match only when safe inside the selected set, while HP-like/name-conflicting numbers are rejected.

Remaining active launch work:

1. Centering calibration
   - Compare measurements against manually measured sample cards.
   - Tune OpenCV/fallback edge thresholds for full-art, vintage yellow border, modern silver border, backs, sleeves, glare, and dark backgrounds.

2. Billing production readiness
   - Confirm Stripe checkout, webhooks, promo codes, founder limits, and refund/cancellation copy.

3. Notification reliability
   - Test iOS PWA, Android, desktop push, restock dedupe, and cooldowns in production.

4. Production monitoring
   - Add Sentry or equivalent for scanner, retailer sync, Stripe webhook, notification, and OpenAI errors.

5. Video scanning
   - Keep paused until live scanner, inventory, and centering flows are stable.
