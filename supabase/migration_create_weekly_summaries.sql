-- 周总结表
create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  week_number int not null,
  year int not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

alter table public.weekly_summaries enable row level security;

-- 查看权限：所有认证用户可读
create policy "Weekly summaries are viewable by authenticated users"
  on public.weekly_summaries for select using (auth.role() = 'authenticated');

-- 插入权限：登录用户可创建
create policy "Authenticated users can create weekly summaries"
  on public.weekly_summaries for insert with check (auth.role() = 'authenticated');

-- 更新权限：只有作者可以更新自己的总结
create policy "Authors can update their own weekly summaries"
  on public.weekly_summaries for update using (auth.uid() = author_id);

-- 删除权限：只有作者可以删除自己的总结
create policy "Authors can delete their own weekly summaries"
  on public.weekly_summaries for delete using (auth.uid() = author_id);

-- 创建唯一索引，防止同一用户同一周重复提交
create unique index if not exists weekly_summaries_user_week_idx 
  on public.weekly_summaries(author_id, week_number, year);