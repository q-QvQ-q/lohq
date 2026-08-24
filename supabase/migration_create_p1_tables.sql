-- 待办事项表
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  due_date date,
  priority text not null default 'normal',
  is_completed boolean default false,
  created_by uuid not null references public.profiles(id) on delete cascade,
  completed_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  completed_at timestamptz,
  date date
);

-- 创建索引
create index if not exists todos_due_date_idx on public.todos(due_date);
create index if not exists todos_is_completed_idx on public.todos(is_completed);
create index if not exists todos_date_idx on public.todos(date);

-- 启用RLS
alter table public.todos enable row level security;

-- RLS策略
create policy "Todos are viewable by authenticated users"
  on public.todos for select
  using (true);

create policy "Users can create their own todos"
  on public.todos for insert
  with check (auth.uid() = created_by);

create policy "Users can update todos"
  on public.todos for update
  using (true);

create policy "Users can delete their own todos"
  on public.todos for delete
  using (auth.uid() = created_by);

-- 愿望清单表
create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  note text,
  expected_date date,
  is_completed boolean default false,
  created_by uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists wishes_is_completed_idx on public.wishes(is_completed);

alter table public.wishes enable row level security;

create policy "Wishes are viewable by authenticated users"
  on public.wishes for select
  using (true);

create policy "Users can create their own wishes"
  on public.wishes for insert
  with check (auth.uid() = created_by);

create policy "Users can update wishes"
  on public.wishes for update
  using (true);

create policy "Users can delete their own wishes"
  on public.wishes for delete
  using (auth.uid() = created_by);

-- 钱包表
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  balance numeric default 0,
  updated_at timestamptz default now()
);

alter table public.wallets enable row level security;

create policy "Wallets are viewable by authenticated users"
  on public.wallets for select
  using (true);

create policy "Users can update their own wallet"
  on public.wallets for update
  using (user_id = auth.uid());

-- 支出记录表
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null,
  category text not null default 'other',
  note text,
  payer_id uuid not null references public.profiles(id),
  expense_date date not null default current_date,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists expenses_date_idx on public.expenses(expense_date);
create index if not exists expenses_payer_idx on public.expenses(payer_id);

alter table public.expenses enable row level security;

create policy "Expenses are viewable by authenticated users"
  on public.expenses for select
  using (true);

create policy "Users can create their own expenses"
  on public.expenses for insert
  with check (auth.uid() = created_by);

create policy "Users can delete their own expenses"
  on public.expenses for delete
  using (auth.uid() = created_by);

-- 钱包流水表
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  from_user_id uuid,
  to_user_id uuid,
  amount numeric not null,
  reason text,
  transaction_date date not null default current_date,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists wallet_transactions_date_idx on public.wallet_transactions(transaction_date);

alter table public.wallet_transactions enable row level security;

create policy "Wallet transactions are viewable by authenticated users"
  on public.wallet_transactions for select
  using (true);

create policy "Users can create wallet transactions"
  on public.wallet_transactions for insert
  with check (auth.uid() = created_by);

create policy "Users can delete their own wallet transactions"
  on public.wallet_transactions for delete
  using (auth.uid() = created_by);

-- 相册表
create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cover_url text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.albums enable row level security;

create policy "Albums are viewable by authenticated users"
  on public.albums for select
  using (true);

create policy "Users can create their own albums"
  on public.albums for insert
  with check (auth.uid() = created_by);

create policy "Users can delete their own albums"
  on public.albums for delete
  using (auth.uid() = created_by);

-- 照片表
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  url text not null,
  description text,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  uploaded_at timestamptz default now()
);

create index if not exists photos_album_idx on public.photos(album_id);

alter table public.photos enable row level security;

create policy "Photos are viewable by authenticated users"
  on public.photos for select
  using (true);

create policy "Users can create their own photos"
  on public.photos for insert
  with check (auth.uid() = uploaded_by);

create policy "Users can delete their own photos"
  on public.photos for delete
  using (auth.uid() = uploaded_by);