update public.catalog_offers as offer
set
  active = false,
  status = 'blocked',
  availability_text = coalesce(offer.availability_text, 'Blocked retailer/search result hidden by PackWatcher'),
  metadata = coalesce(offer.metadata, '{}'::jsonb) || jsonb_build_object(
    'disabledReason', 'retailer_block_page',
    'disabledAt', now()
  ),
  updated_at = now()
where offer.active is distinct from false
  and (
    offer.title ~* '(robot or human|are you a robot|verify you.?re human|checking if the site connection is secure|access denied|request blocked|captcha|perimeterx|cloudflare|automated access|unusual traffic)'
    or offer.availability_text ~* '(robot or human|are you a robot|verify you.?re human|checking if the site connection is secure|access denied|request blocked|captcha|perimeterx|cloudflare|automated access|unusual traffic)'
    or exists (
      select 1
      from public.catalog_products as product
      where product.id = offer.catalog_product_id
        and (
          product.name ~* '(robot or human|are you a robot|verify you.?re human|checking if the site connection is secure|access denied|request blocked|captcha|perimeterx|cloudflare|automated access|unusual traffic)'
          or product.title ~* '(robot or human|are you a robot|verify you.?re human|checking if the site connection is secure|access denied|request blocked|captcha|perimeterx|cloudflare|automated access|unusual traffic)'
        )
    )
  );
