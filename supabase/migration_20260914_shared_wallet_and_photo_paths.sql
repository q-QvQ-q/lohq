-- Shared wallet, atomic partner rewards/fines, and legacy photo-path repair.
-- Safe to run once after the earlier 2026-09-14 migrations.

begin;

create table if not exists public.couple_wallets (
  id uuid primary key default gen_random_uuid(),
  member_one_id uuid not null references public.profiles(id) on delete cascade,
  member_two_id uuid not null references public.profiles(id) on delete cascade,
  balance numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint couple_wallets_distinct_members check (member_one_id <> member_two_id),
  constraint couple_wallets_unique_pair unique (member_one_id, member_two_id)
);

commit;
begin;

create table if not exists public.shared_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.couple_wallets(id) on delete cascade,
  type text not null check (type in ('deposit', 'expense')),
  amount numeric not null check (amount > 0),
  contributor_id uuid references public.profiles(id) on delete set null,
  category text,
  note text,
  transaction_date date not null default current_date,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists shared_wallet_transactions_wallet_date_idx
  on public.shared_wallet_transactions(wallet_id, transaction_date desc, created_at desc);

commit;
begin;

alter table public.expenses
  add column if not exists shared_wallet_id uuid references public.couple_wallets(id) on delete set null;

commit;
begin;

alter table public.couple_wallets enable row level security;
alter table public.shared_wallet_transactions enable row level security;

drop policy if exists "Couple members can view their shared wallet" on public.couple_wallets;
create policy "Couple members can view their shared wallet"
  on public.couple_wallets for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          (p.id = member_one_id and p.partner_id = member_two_id)
          or (p.id = member_two_id and p.partner_id = member_one_id)
        )
    )
  );

drop policy if exists "Couple members can view shared wallet transactions" on public.shared_wallet_transactions;
create policy "Couple members can view shared wallet transactions"
  on public.shared_wallet_transactions for select
  using (
    exists (
      select 1 from public.couple_wallets cw
      where cw.id = shared_wallet_transactions.wallet_id
        and auth.uid() in (cw.member_one_id, cw.member_two_id)
    )
  );

grant select on public.couple_wallets to authenticated;
grant select on public.shared_wallet_transactions to authenticated;

commit;
begin;

-- Remove the historical broad update policy. A user may update their own wallet;
-- partner changes are performed by the validated atomic RPC below.
drop policy if exists "Authenticated users can update wallets" on public.wallets;
drop policy if exists "Users can update their own wallet" on public.wallets;
create policy "Users can update their own wallet"
  on public.wallets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.ensure_wallet_setup()
returns public.couple_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_partner_id uuid;
  v_member_one uuid;
  v_member_two uuid;
  v_wallet public.couple_wallets;
begin
  if v_user_id is null then
    raise exception '请先登录';
  end if;

  select partner_id into v_partner_id
  from public.profiles
  where id = v_user_id;

  insert into public.wallets(user_id, balance)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  if v_partner_id is null then
    return null;
  end if;

  insert into public.wallets(user_id, balance)
  values (v_partner_id, 0)
  on conflict (user_id) do nothing;

  v_member_one := least(v_user_id, v_partner_id);
  v_member_two := greatest(v_user_id, v_partner_id);

  insert into public.couple_wallets(member_one_id, member_two_id, balance)
  values (v_member_one, v_member_two, 0)
  on conflict (member_one_id, member_two_id)
  do update set updated_at = public.couple_wallets.updated_at
  returning * into v_wallet;

  return v_wallet;
end;
$$;

create or replace function public.apply_partner_wallet_transaction(
  p_type text,
  p_amount numeric,
  p_reason text default null,
  p_transaction_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_partner_id uuid;
  v_balance numeric;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception '请先登录';
  end if;
  if p_type not in ('fine', 'reward') then
    raise exception '不支持的奖惩类型';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception '金额必须大于 0';
  end if;

  select partner_id into v_partner_id
  from public.profiles
  where id = v_user_id;

  if v_partner_id is null then
    raise exception '请先绑定伴侣';
  end if;

  insert into public.wallets(user_id, balance)
  values (v_partner_id, 0)
  on conflict (user_id) do nothing;

  update public.wallets
  set balance = coalesce(balance, 0) + case when p_type = 'fine' then -p_amount else p_amount end,
      updated_at = now()
  where user_id = v_partner_id
  returning balance into v_balance;

  insert into public.wallet_transactions(
    type, from_user_id, to_user_id, amount, reason, transaction_date, created_by
  ) values (
    p_type,
    case when p_type = 'fine' then v_partner_id else v_user_id end,
    case when p_type = 'reward' then v_partner_id else null end,
    p_amount,
    coalesce(nullif(trim(p_reason), ''), case when p_type = 'fine' then '犯错罚款' else '表现奖励' end),
    coalesce(p_transaction_date, current_date),
    v_user_id
  ) returning id into v_transaction_id;

  return jsonb_build_object(
    'partner_id', v_partner_id,
    'balance', v_balance,
    'transaction_id', v_transaction_id
  );
end;
$$;

create or replace function public.adjust_shared_wallet(
  p_wallet_id uuid,
  p_type text,
  p_amount numeric,
  p_note text default null,
  p_transaction_date date default current_date,
  p_category text default 'other'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception '请先登录';
  end if;
  if p_type not in ('deposit', 'expense') then
    raise exception '不支持的共同账本操作';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception '金额必须大于 0';
  end if;
  if not exists (
    select 1 from public.couple_wallets
    where id = p_wallet_id
      and v_user_id in (member_one_id, member_two_id)
  ) then
    raise exception '无权操作这个共同账本';
  end if;

  if p_type = 'expense' then
    update public.couple_wallets
    set balance = balance - p_amount,
        updated_at = now()
    where id = p_wallet_id and balance >= p_amount
    returning balance into v_balance;

    if not found then
      raise exception '共同账本余额不足';
    end if;
  else
    update public.couple_wallets
    set balance = balance + p_amount,
        updated_at = now()
    where id = p_wallet_id
    returning balance into v_balance;
  end if;

  insert into public.shared_wallet_transactions(
    wallet_id, type, amount, contributor_id, category, note,
    transaction_date, created_by
  ) values (
    p_wallet_id, p_type, p_amount,
    case when p_type = 'deposit' then v_user_id else null end,
    case when p_type = 'expense' then coalesce(p_category, 'other') else null end,
    nullif(trim(p_note), ''), coalesce(p_transaction_date, current_date), v_user_id
  ) returning id into v_transaction_id;

  if p_type = 'expense' then
    insert into public.expenses(
      amount, category, note, payer_id, expense_date, created_by, shared_wallet_id
    ) values (
      p_amount, coalesce(p_category, 'other'), nullif(trim(p_note), ''),
      v_user_id, coalesce(p_transaction_date, current_date), v_user_id, p_wallet_id
    );
  end if;

  return jsonb_build_object(
    'balance', v_balance,
    'transaction_id', v_transaction_id
  );
end;
$$;

revoke all on function public.ensure_wallet_setup() from public;
revoke all on function public.apply_partner_wallet_transaction(text, numeric, text, date) from public;
revoke all on function public.adjust_shared_wallet(uuid, text, numeric, text, date, text) from public;
grant execute on function public.ensure_wallet_setup() to authenticated;
grant execute on function public.apply_partner_wallet_transaction(text, numeric, text, date) to authenticated;
grant execute on function public.adjust_shared_wallet(uuid, text, numeric, text, date, text) to authenticated;

commit;
begin;

-- Older rows sometimes stored an expiring signed URL instead of the stable
-- storage object path. Recover that path so photos work on every device.
update public.photos
set file_path = case
  when url like '%/storage/v1/object/sign/photos/%'
    then split_part(split_part(url, '/storage/v1/object/sign/photos/', 2), '?', 1)
  when url like '%/storage/v1/object/public/photos/%'
    then split_part(split_part(url, '/storage/v1/object/public/photos/', 2), '?', 1)
  when url not like 'http%'
    then url
  else file_path
end
where (file_path is null or file_path = '') and url is not null;

commit;
