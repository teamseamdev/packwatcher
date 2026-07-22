# Launch Remaining Items

Items 1 and 2 from the previous launch list are currently treated as done:

- Real-device QA pass for the latest deployment.
- Production Supabase migrations/env synchronization through migration `029`.

Remaining active launch work:

1. Retailer and local inventory accuracy
   - Tune SerpAPI Google Shopping, Walmart, Amazon, and eBay discovery.
   - Keep shopping/search data labeled as discovery until retailer connectors verify stock.
   - Improve pickup/shipping/stale/verified labels.
   - Use Admin tools to disable bad offers.

2. Scanner accuracy calibration
   - Test English, Japanese, Chinese, Korean, holo, reverse holo, duplicate, and wrong-set cases.
   - Tune set-constrained OCR/candidate scoring with real scan failures.

3. Centering calibration
   - Compare measurements against manually measured sample cards.
   - Tune OpenCV/fallback edge thresholds for full-art, vintage yellow border, modern silver border, backs, sleeves, glare, and dark backgrounds.

4. Billing production readiness
   - Confirm Stripe checkout, webhooks, promo codes, founder limits, and refund/cancellation copy.

5. Notification reliability
   - Verify iOS PWA, Android, desktop push, restock dedupe, and cooldowns in production.

6. Production monitoring
   - Add Sentry or equivalent for scanner, retailer sync, Stripe webhook, notification, and OpenAI errors.

7. Video scanning
   - Keep paused until live scanner, inventory, and centering flows are stable.
