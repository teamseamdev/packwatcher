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
- Centering calibration:
  - Centering Check now measures inner-frame margins from the perspective-corrected card image instead of the original photo frame.
  - The calibration engine uses front and back profiles, edge-profile smoothing, contrast scoring, light/glare blockers, and reference-guided fallback for low-contrast full-art style fronts.
  - Tests cover modern front borders, Pokemon backs, low-contrast/full-art reference guidance, and unmeasurable edge failures.
  - The scanner now rearms after a successful scan when the visible card changes, not only when detection drops to no card, which avoids getting stuck in the post-scan detecting/removal state.

Remaining active launch work:

1. Billing production readiness
   - Confirm Stripe checkout, webhooks, promo codes, founder limits, and refund/cancellation copy.

2. Notification reliability
   - Test iOS PWA, Android, desktop push, restock dedupe, and cooldowns in production.

3. Production monitoring
   - Add Sentry or equivalent for scanner, retailer sync, Stripe webhook, notification, and OpenAI errors.

4. Video scanning
   - Keep paused until live scanner, inventory, and centering flows are stable.
