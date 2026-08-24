-- 备忘录评论表
create table if not exists public.memo_comments (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.memos(id) on delete cascade,
  content text not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.memo_comments enable row level security;

create policy "Memo comments are viewable by authenticated users"
  on public.memo_comments for select using (auth.role() = 'authenticated');

create policy "Authenticated users can create memo comments"
  on public.memo_comments for insert with check (auth.role() = 'authenticated');

create policy "Authors can delete their own memo comments"
  on public.memo_comments for delete using (auth.uid() = author_id);

create index if not exists memo_comments_memo_idx on public.memo_comments(memo_id);

-- 为 weekly_summaries 添加评分字段
alter table public.weekly_summaries add column if not exists my_rating int default 0;
alter table public.weekly_summaries add column if not exists partner_rating int default 0;