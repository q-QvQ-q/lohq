-- “我们的日常”三项新功能：情侣点单小店、打卡评价、未来信件。
-- 正式迁移：由 Supabase CLI 记录并同步到远端项目。

begin;

create table if not exists public.daily_couple_spaces (
  id uuid primary key default gen_random_uuid(),
  member_one_id uuid not null references public.profiles(id) on delete cascade,
  member_two_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint daily_couple_spaces_distinct_members check (member_one_id <> member_two_id),
  constraint daily_couple_spaces_unique_pair unique (member_one_id, member_two_id)
);

create or replace function public.is_daily_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.daily_couple_spaces s
    where s.id = p_space_id
      and auth.uid() in (s.member_one_id, s.member_two_id)
  );
$$;

create or replace function public.daily_space_partner(p_space_id uuid, p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when member_one_id = p_user_id then member_two_id else member_one_id end
  from public.daily_couple_spaces
  where id = p_space_id and p_user_id in (member_one_id, member_two_id);
$$;

create table if not exists public.sweet_coin_accounts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.daily_couple_spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now(),
  unique (space_id, user_id)
);

create table if not exists public.sweet_coin_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.daily_couple_spaces(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  beneficiary_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 2 and 100),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sweet_coin_ledger (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.daily_couple_spaces(id) on delete cascade,
  account_id uuid not null references public.sweet_coin_accounts(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  change_amount integer not null check (change_amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  type text not null check (type in ('approved_credit', 'order_debit', 'order_refund', 'system_adjustment')),
  reference_type text,
  reference_id uuid,
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_categories (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.daily_couple_spaces(id) on delete cascade,
  slug text not null,
  name text not null check (char_length(btrim(name)) between 1 and 20),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (space_id, slug)
);

create table if not exists public.shop_items (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.daily_couple_spaces(id) on delete cascade,
  category_slug text not null,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  description text check (description is null or char_length(description) <= 200),
  price integer not null check (price > 0),
  provider_id uuid not null references public.profiles(id) on delete restrict,
  cover_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.daily_couple_spaces(id) on delete cascade,
  item_id uuid references public.shop_items(id) on delete set null,
  item_name text not null,
  item_description text,
  price integer not null check (price > 0),
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  provider_id uuid not null references public.profiles(id) on delete restrict,
  note text check (note is null or char_length(note) <= 100),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'completed', 'rejected', 'cancelled')),
  accepted_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.daily_couple_spaces(id) on delete cascade,
  category text not null check (category in ('food', 'hotel', 'place', 'fun', 'travel', 'other')),
  name text not null check (char_length(btrim(name)) between 1 and 50),
  visit_date date not null check (visit_date <= current_date),
  address text not null check (char_length(btrim(address)) between 1 and 160),
  price numeric(12,2) check (price is null or price >= 0),
  price_type text not null default 'total' check (price_type in ('total', 'per_person')),
  currency text not null default 'CNY',
  notes text check (notes is null or char_length(notes) <= 500),
  cover_path text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  version integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.check_in_reviews (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  space_id uuid not null references public.daily_couple_spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  recommendation text not null default 'recommend' check (recommendation in ('recommend', 'neutral', 'avoid')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (check_in_id, user_id)
);

create table if not exists public.future_letters (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.daily_couple_spaces(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 50),
  content text not null check (char_length(btrim(content)) between 1 and 10000),
  status text not null default 'draft' check (status in ('draft', 'sealed')),
  paper_theme text not null default 'blush' check (paper_theme in ('blush', 'cream', 'lilac')),
  unlock_at timestamptz not null,
  sealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.future_letter_reads (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.future_letters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  first_read_at timestamptz not null default now(),
  unique (letter_id, user_id)
);

create index if not exists sweet_coin_requests_space_created_idx on public.sweet_coin_requests(space_id, created_at desc);
create index if not exists sweet_coin_ledger_user_created_idx on public.sweet_coin_ledger(user_id, created_at desc);
create index if not exists shop_items_space_status_idx on public.shop_items(space_id, status, created_at desc);
create index if not exists shop_orders_space_created_idx on public.shop_orders(space_id, created_at desc);
create index if not exists check_ins_space_date_idx on public.check_ins(space_id, visit_date desc) where deleted_at is null;
create index if not exists check_in_reviews_space_idx on public.check_in_reviews(space_id, check_in_id);
create index if not exists future_letters_space_unlock_idx on public.future_letters(space_id, unlock_at);

alter table public.daily_couple_spaces enable row level security;
alter table public.sweet_coin_accounts enable row level security;
alter table public.sweet_coin_requests enable row level security;
alter table public.sweet_coin_ledger enable row level security;
alter table public.shop_categories enable row level security;
alter table public.shop_items enable row level security;
alter table public.shop_orders enable row level security;
alter table public.check_ins enable row level security;
alter table public.check_in_reviews enable row level security;
alter table public.future_letters enable row level security;
alter table public.future_letter_reads enable row level security;

create policy "Daily members view their space" on public.daily_couple_spaces for select using (auth.uid() in (member_one_id, member_two_id));
create policy "Daily members view coin accounts" on public.sweet_coin_accounts for select using (public.is_daily_space_member(space_id));
create policy "Daily members view coin requests" on public.sweet_coin_requests for select using (public.is_daily_space_member(space_id));
create policy "Daily members create coin requests" on public.sweet_coin_requests for insert with check (
  public.is_daily_space_member(space_id)
  and requester_id = auth.uid()
  and beneficiary_id in (
    select member_one_id from public.daily_couple_spaces where id = space_id
    union all
    select member_two_id from public.daily_couple_spaces where id = space_id
  )
);
create policy "Daily members view coin ledger" on public.sweet_coin_ledger for select using (public.is_daily_space_member(space_id));
create policy "Daily members view categories" on public.shop_categories for select using (public.is_daily_space_member(space_id));
create policy "Daily members create categories" on public.shop_categories for insert with check (public.is_daily_space_member(space_id));
create policy "Daily members edit categories" on public.shop_categories for update using (public.is_daily_space_member(space_id)) with check (public.is_daily_space_member(space_id));
create policy "Daily members view items" on public.shop_items for select using (public.is_daily_space_member(space_id));
create policy "Daily members create items" on public.shop_items for insert with check (
  public.is_daily_space_member(space_id)
  and created_by = auth.uid()
  and provider_id in (
    select member_one_id from public.daily_couple_spaces where id = space_id
    union all
    select member_two_id from public.daily_couple_spaces where id = space_id
  )
);
create policy "Daily members edit items" on public.shop_items for update using (public.is_daily_space_member(space_id)) with check (public.is_daily_space_member(space_id));
create policy "Daily members view orders" on public.shop_orders for select using (public.is_daily_space_member(space_id));
create policy "Daily members view check ins" on public.check_ins for select using (public.is_daily_space_member(space_id));
create policy "Daily members create check ins" on public.check_ins for insert with check (public.is_daily_space_member(space_id) and created_by = auth.uid());
create policy "Daily members edit check ins" on public.check_ins for update using (public.is_daily_space_member(space_id)) with check (public.is_daily_space_member(space_id));
create policy "Daily members view reviews" on public.check_in_reviews for select using (public.is_daily_space_member(space_id));
create policy "Members write own reviews" on public.check_in_reviews for insert with check (
  public.is_daily_space_member(space_id) and user_id = auth.uid()
  and exists (
    select 1 from public.check_ins c
    where c.id = check_in_reviews.check_in_id
      and c.space_id = check_in_reviews.space_id
      and c.deleted_at is null
  )
);
create policy "Members edit own reviews" on public.check_in_reviews for update
  using (user_id = auth.uid() and public.is_daily_space_member(space_id))
  with check (
    user_id = auth.uid() and public.is_daily_space_member(space_id)
    and exists (
      select 1 from public.check_ins c
      where c.id = check_in_reviews.check_in_id
        and c.space_id = check_in_reviews.space_id
        and c.deleted_at is null
    )
  );
create policy "Members create own read receipt" on public.future_letter_reads for insert with check (user_id = auth.uid());
create policy "Members view read receipts" on public.future_letter_reads for select using (
  exists (select 1 from public.future_letters l where l.id = letter_id and public.is_daily_space_member(l.space_id))
);

create or replace function public.ensure_daily_couple_space()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_partner_id uuid;
  v_member_one uuid;
  v_member_two uuid;
  v_space_id uuid;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select partner_id into v_partner_id from public.profiles where id = v_user_id;
  if v_partner_id is null or not exists (select 1 from public.profiles where id = v_partner_id and partner_id = v_user_id) then
    raise exception 'A mutual partner binding is required';
  end if;
  v_member_one := least(v_user_id, v_partner_id);
  v_member_two := greatest(v_user_id, v_partner_id);
  insert into public.daily_couple_spaces(member_one_id, member_two_id)
  values (v_member_one, v_member_two)
  on conflict (member_one_id, member_two_id) do update set member_one_id = excluded.member_one_id
  returning id into v_space_id;

  insert into public.sweet_coin_accounts(space_id, user_id)
  values (v_space_id, v_member_one), (v_space_id, v_member_two)
  on conflict (space_id, user_id) do nothing;

  insert into public.shop_categories(space_id, slug, name, sort_order)
  values
    (v_space_id, 'food', '吃喝', 10), (v_space_id, 'company', '陪伴', 20),
    (v_space_id, 'care', '关怀', 30), (v_space_id, 'chores', '家务', 40),
    (v_space_id, 'fun', '娱乐', 50), (v_space_id, 'other', '其他', 60)
  on conflict (space_id, slug) do nothing;
  return v_space_id;
end;
$$;

create or replace function public.review_sweet_coin_request(p_request_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.sweet_coin_requests;
  v_account public.sweet_coin_accounts;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'Invalid decision'; end if;
  select * into v_request from public.sweet_coin_requests where id = p_request_id for update;
  if v_request.id is null or not public.is_daily_space_member(v_request.space_id) then raise exception 'Request not found'; end if;
  if v_request.status <> 'pending' then raise exception 'Request already reviewed'; end if;
  if v_request.requester_id = auth.uid() then raise exception 'The requester cannot self-approve'; end if;
  update public.sweet_coin_requests set status = p_decision, reviewer_id = auth.uid(), review_note = nullif(btrim(p_note), ''), reviewed_at = now() where id = p_request_id;
  if p_decision = 'approved' then
    update public.sweet_coin_accounts
    set balance = balance + v_request.amount, updated_at = now()
    where space_id = v_request.space_id and user_id = v_request.beneficiary_id
    returning * into v_account;
    insert into public.sweet_coin_ledger(space_id, account_id, user_id, change_amount, balance_after, type, reference_type, reference_id, reason, created_by)
    values (v_request.space_id, v_account.id, v_account.user_id, v_request.amount, v_account.balance, 'approved_credit', 'coin_request', v_request.id, v_request.reason, auth.uid());
  end if;
  insert into public.notifications(recipient_id, actor_id, type, title, body, resource_path)
  values (v_request.requester_id, auth.uid(), 'coin_request_' || p_decision, case when p_decision = 'approved' then '甜心币申请已同意' else '甜心币申请未通过' end, case when p_decision = 'approved' then '甜心币已经到账啦' else '可以和 TA 再商量一下' end, '/shop');
end;
$$;

create or replace function public.place_shop_order(p_item_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.shop_items;
  v_account public.sweet_coin_accounts;
  v_order_id uuid;
begin
  select * into v_item from public.shop_items where id = p_item_id and status = 'active';
  if v_item.id is null or not public.is_daily_space_member(v_item.space_id) then raise exception 'Item unavailable'; end if;
  if v_item.provider_id = auth.uid() then raise exception 'You cannot order your own item'; end if;
  select * into v_account from public.sweet_coin_accounts where space_id = v_item.space_id and user_id = auth.uid() for update;
  if v_account.balance < v_item.price then raise exception 'Insufficient balance'; end if;
  update public.sweet_coin_accounts set balance = balance - v_item.price, updated_at = now() where id = v_account.id returning * into v_account;
  insert into public.shop_orders(space_id, item_id, item_name, item_description, price, buyer_id, provider_id, note)
  values (v_item.space_id, v_item.id, v_item.name, v_item.description, v_item.price, auth.uid(), v_item.provider_id, nullif(btrim(p_note), ''))
  returning id into v_order_id;
  insert into public.sweet_coin_ledger(space_id, account_id, user_id, change_amount, balance_after, type, reference_type, reference_id, reason, created_by)
  values (v_item.space_id, v_account.id, auth.uid(), -v_item.price, v_account.balance, 'order_debit', 'shop_order', v_order_id, '点单：' || v_item.name, auth.uid());
  insert into public.notifications(recipient_id, actor_id, type, title, body, resource_path)
  values (v_item.provider_id, auth.uid(), 'shop_order_created', '收到一份新点单', 'TA 点了「' || v_item.name || '」，快去接单吧', '/shop');
  return v_order_id;
end;
$$;

create or replace function public.update_shop_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.shop_orders;
  v_account public.sweet_coin_accounts;
  v_recipient uuid;
begin
  select * into v_order from public.shop_orders where id = p_order_id for update;
  if v_order.id is null or not public.is_daily_space_member(v_order.space_id) then raise exception 'Order not found'; end if;
  if p_status = 'accepted' and not (v_order.status = 'pending' and v_order.provider_id = auth.uid()) then raise exception 'Invalid transition'; end if;
  if p_status = 'completed' and not (v_order.status = 'accepted' and v_order.provider_id = auth.uid()) then raise exception 'Invalid transition'; end if;
  if p_status = 'rejected' and not (v_order.status = 'pending' and v_order.provider_id = auth.uid()) then raise exception 'Invalid transition'; end if;
  if p_status = 'cancelled' and not (v_order.status = 'pending' and v_order.buyer_id = auth.uid()) then raise exception 'Invalid transition'; end if;
  if p_status not in ('accepted', 'completed', 'rejected', 'cancelled') then raise exception 'Invalid status'; end if;
  update public.shop_orders set status = p_status,
    accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    closed_at = case when p_status in ('rejected', 'cancelled') then now() else closed_at end
  where id = p_order_id;
  if p_status in ('rejected', 'cancelled') then
    update public.sweet_coin_accounts set balance = balance + v_order.price, updated_at = now()
    where space_id = v_order.space_id and user_id = v_order.buyer_id returning * into v_account;
    insert into public.sweet_coin_ledger(space_id, account_id, user_id, change_amount, balance_after, type, reference_type, reference_id, reason, created_by)
    values (v_order.space_id, v_account.id, v_order.buyer_id, v_order.price, v_account.balance, 'order_refund', 'shop_order', v_order.id, '订单退款：' || v_order.item_name, auth.uid());
  end if;
  v_recipient := case when auth.uid() = v_order.buyer_id then v_order.provider_id else v_order.buyer_id end;
  insert into public.notifications(recipient_id, actor_id, type, title, body, resource_path)
  values (v_recipient, auth.uid(), 'shop_order_status_changed', '点单状态更新', '「' || v_order.item_name || '」状态有变化', '/shop');
end;
$$;

-- Future-letter content is never granted through direct table SELECT.
-- Only this function can return it, and only to the author of a draft or after unlock_at.
create or replace function public.list_future_letters()
returns table (
  id uuid, author_id uuid, title text, content text, status text, paper_theme text,
  unlock_at timestamptz, sealed_at timestamptz, created_at timestamptz, first_read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.author_id, l.title,
    case when l.status = 'draft' and l.author_id = auth.uid() then l.content
         when l.status = 'sealed' and now() >= l.unlock_at then l.content
         else null end as content,
    case when l.status = 'sealed' and now() >= l.unlock_at then 'unlocked' else l.status end as status,
    l.paper_theme, l.unlock_at, l.sealed_at, l.created_at, r.first_read_at
  from public.future_letters l
  left join public.future_letter_reads r on r.letter_id = l.id and r.user_id = auth.uid()
  where public.is_daily_space_member(l.space_id)
    and (l.status <> 'draft' or l.author_id = auth.uid())
  order by l.created_at desc;
$$;

create or replace function public.save_future_letter(
  p_letter_id uuid, p_title text, p_content text, p_unlock_at timestamptz,
  p_paper_theme text default 'blush', p_seal boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_letter_id uuid;
  v_partner_id uuid;
begin
  if char_length(btrim(p_title)) not between 1 and 50 then raise exception 'Invalid title'; end if;
  if char_length(btrim(p_content)) not between 1 and 10000 then raise exception 'Invalid content'; end if;
  if p_unlock_at < now() + interval '10 minutes' then raise exception 'Unlock time is too soon'; end if;
  if p_paper_theme not in ('blush', 'cream', 'lilac') then raise exception 'Invalid paper theme'; end if;
  v_space_id := public.ensure_daily_couple_space();
  if p_letter_id is null then
    insert into public.future_letters(space_id, author_id, title, content, status, paper_theme, unlock_at, sealed_at)
    values (v_space_id, auth.uid(), btrim(p_title), btrim(p_content), case when p_seal then 'sealed' else 'draft' end, p_paper_theme, p_unlock_at, case when p_seal then now() else null end)
    returning id into v_letter_id;
  else
    update public.future_letters set title = btrim(p_title), content = btrim(p_content), unlock_at = p_unlock_at,
      paper_theme = p_paper_theme, status = case when p_seal then 'sealed' else 'draft' end,
      sealed_at = case when p_seal then now() else null end, updated_at = now()
    where id = p_letter_id and author_id = auth.uid() and status = 'draft' and space_id = v_space_id
    returning id into v_letter_id;
    if v_letter_id is null then raise exception 'Only your draft can be edited'; end if;
  end if;
  if p_seal then
    v_partner_id := public.daily_space_partner(v_space_id, auth.uid());
    insert into public.notifications(recipient_id, actor_id, type, title, body, resource_path)
    values (v_partner_id, auth.uid(), 'future_letter_sealed', '一封未来信正在路上', 'TA 写了一封信，将在 ' || to_char(p_unlock_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') || ' 开启', '/future-letters');
  end if;
  return v_letter_id;
end;
$$;

create or replace function public.mark_future_letter_read(p_letter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_letter public.future_letters;
begin
  select * into v_letter from public.future_letters where id = p_letter_id;
  if v_letter.id is null or not public.is_daily_space_member(v_letter.space_id) or v_letter.status <> 'sealed' or now() < v_letter.unlock_at then
    raise exception 'Letter is not available';
  end if;
  insert into public.future_letter_reads(letter_id, user_id) values (p_letter_id, auth.uid()) on conflict (letter_id, user_id) do nothing;
end;
$$;

revoke all on function public.is_daily_space_member(uuid) from public;
revoke all on function public.daily_space_partner(uuid, uuid) from public;
revoke all on function public.ensure_daily_couple_space() from public;
revoke all on function public.review_sweet_coin_request(uuid, text, text) from public;
revoke all on function public.place_shop_order(uuid, text) from public;
revoke all on function public.update_shop_order_status(uuid, text) from public;
revoke all on function public.list_future_letters() from public;
revoke all on function public.save_future_letter(uuid, text, text, timestamptz, text, boolean) from public;
revoke all on function public.mark_future_letter_read(uuid) from public;

grant execute on function public.is_daily_space_member(uuid) to authenticated;
grant execute on function public.daily_space_partner(uuid, uuid) to authenticated;
grant execute on function public.ensure_daily_couple_space() to authenticated;
grant execute on function public.review_sweet_coin_request(uuid, text, text) to authenticated;
grant execute on function public.place_shop_order(uuid, text) to authenticated;
grant execute on function public.update_shop_order_status(uuid, text) to authenticated;
grant execute on function public.list_future_letters() to authenticated;
grant execute on function public.save_future_letter(uuid, text, text, timestamptz, text, boolean) to authenticated;
grant execute on function public.mark_future_letter_read(uuid) to authenticated;

grant select on public.daily_couple_spaces, public.sweet_coin_accounts, public.sweet_coin_requests, public.sweet_coin_ledger,
  public.shop_categories, public.shop_items, public.shop_orders, public.check_ins, public.check_in_reviews,
  public.future_letter_reads to authenticated;
grant insert on public.sweet_coin_requests, public.shop_categories, public.shop_items, public.check_ins, public.check_in_reviews to authenticated;
grant update on public.shop_categories, public.shop_items, public.check_ins, public.check_in_reviews to authenticated;

revoke all on public.future_letters from anon, authenticated;

commit;
