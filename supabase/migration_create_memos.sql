-- 备忘录表
create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.memos enable row level security;

-- 查看权限：所有认证用户可读
create policy "Memos are viewable by authenticated users"
  on public.memos for select using (auth.role() = 'authenticated');

-- 插入权限：登录用户可创建
create policy "Authenticated users can create memos"
  on public.memos for insert with check (auth.role() = 'authenticated');

-- 更新权限：只有作者可以更新自己的备忘录
create policy "Authors can update their own memos"
  on public.memos for update using (auth.uid() = author_id);

-- 删除权限：只有作者可以删除自己的备忘录
create policy "Authors can delete their own memos"
  on public.memos for delete using (auth.uid() = author_id);

-- 自动更新 updated_at 时间
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_memos_updated_at on public.memos;
create trigger set_memos_updated_at
  before update on public.memos
  for each row execute function public.handle_updated_at();