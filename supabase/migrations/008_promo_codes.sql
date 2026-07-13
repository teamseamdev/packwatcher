create type public.promo_discount_type as enum ('percent', 'amount');

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type public.promo_discount_type not null,
  discount_value numeric(10,2) not null check (discount_value > 0),
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

alter table public.promo_codes enable row level security;
alter table public.promo_code_redemptions enable row level security;

create policy "promo codes admin all" on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());

create policy "promo redemptions admin select" on public.promo_code_redemptions
  for select using (public.is_admin());

create policy "promo redemptions own select" on public.promo_code_redemptions
  for select using (auth.uid() = user_id);

create or replace function public.redeem_promo_code(
  input_promo_code_id uuid,
  input_user_id uuid,
  input_checkout_session_id text,
  input_subscription_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.promo_code_redemptions (
    promo_code_id,
    user_id,
    stripe_checkout_session_id,
    stripe_subscription_id
  )
  values (
    input_promo_code_id,
    input_user_id,
    input_checkout_session_id,
    input_subscription_id
  )
  on conflict (stripe_checkout_session_id) do nothing;

  if found then
    update public.promo_codes
    set used_count = used_count + 1,
        updated_at = now()
    where id = input_promo_code_id;
  end if;
end;
$$;
