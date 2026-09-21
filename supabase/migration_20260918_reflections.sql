-- 检讨书及独立的后续回顾。先在 Supabase SQL Editor 执行此文件，再使用新页面。
create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  happened_on date not null,
  incident text not null,
  cause text not null,
  resolution text not null,
  lesson text not null,
  action_plan text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reflection_reviews (
  id uuid primary key default gen_random_uuid(),
  reflection_id uuid not null references public.reflections(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_on date not null,
  progress text not null check (progress in ('进行中', '已做到', '需要调整')),
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists reflections_author_created_idx
  on public.reflections(author_id, created_at desc);
create index if not exists reflection_reviews_parent_created_idx
  on public.reflection_reviews(reflection_id, created_at);

alter table public.reflections enable row level security;
alter table public.reflection_reviews enable row level security;

-- 仅本人及当前绑定的伴侣可以查看；仅作者可以修改。
create policy "Read own or partner reflections" on public.reflections for select to authenticated
  using (author_id = auth.uid() or author_id = (
    select partner_id from public.profiles where id = auth.uid()
  ));
create policy "Create own reflections" on public.reflections for insert to authenticated
  with check (author_id = auth.uid());
create policy "Update own reflections" on public.reflections for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "Delete own reflections" on public.reflections for delete to authenticated
  using (author_id = auth.uid());

create policy "Read own or partner reflection reviews" on public.reflection_reviews for select to authenticated
  using (exists (
    select 1 from public.reflections r where r.id = reflection_id
      and (r.author_id = auth.uid() or r.author_id = (
        select partner_id from public.profiles where id = auth.uid()
      ))
  ));
create policy "Create reviews for own reflections" on public.reflection_reviews for insert to authenticated
  with check (author_id = auth.uid() and exists (
    select 1 from public.reflections r where r.id = reflection_id and r.author_id = auth.uid()
  ));

create or replace function public.set_reflections_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_reflections_updated_at on public.reflections;
create trigger set_reflections_updated_at before update on public.reflections
  for each row execute function public.set_reflections_updated_at();
