-- 为 weekly_summaries 添加 updated_at 字段
alter table public.weekly_summaries add column if not exists updated_at timestamptz default now();

-- 自动更新 updated_at 时间的触发器函数（如果不存在）
create or replace function public.handle_weekly_summaries_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 移除旧触发器（如果存在）并创建新触发器
drop trigger if exists set_weekly_summaries_updated_at on public.weekly_summaries;
create trigger set_weekly_summaries_updated_at
  before update on public.weekly_summaries
  for each row execute function public.handle_weekly_summaries_updated_at();
