-- 心情日记表
create table if not exists public.diaries (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  mood text not null default 'normal',
  content text not null,
  images text[] default '{}',
  created_at timestamptz default now()
);

-- 创建索引
create index if not exists diaries_author_id_idx on public.diaries(author_id);
create index if not exists diaries_created_at_idx on public.diaries(created_at desc);

-- 启用RLS
alter table public.diaries enable row level security;

-- RLS策略：两个用户都可以查看所有日记
create policy "Diaries are viewable by authenticated users"
  on public.diaries for select
  using (true);

-- RLS策略：只有自己可以创建日记
create policy "Users can create their own diaries"
  on public.diaries for insert
  with check (auth.uid() = author_id);

-- RLS策略：只有作者可以删除自己的日记
create policy "Users can delete their own diaries"
  on public.diaries for delete
  using (auth.uid() = author_id);

-- RLS策略：只有作者可以更新自己的日记
create policy "Users can update their own diaries"
  on public.diaries for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);