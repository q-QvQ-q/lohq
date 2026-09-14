-- Run once in the Supabase SQL Editor after reviewing the duplicate cleanup.

alter table public.weekly_summaries
  add column if not exists updated_at timestamptz default now();

-- Keep the most recently updated summary for each person/week, then prevent
-- accidental double submissions from creating another duplicate.
with ranked_summaries as (
  select id,
         row_number() over (
           partition by author_id, year, week_number
           order by updated_at desc nulls last, created_at desc, id desc
         ) as row_number
  from public.weekly_summaries
)
delete from public.weekly_summaries
where id in (select id from ranked_summaries where row_number > 1);

create unique index if not exists weekly_summaries_user_week_idx
  on public.weekly_summaries(author_id, week_number, year);

-- In-app notifications for the other member of a bound pair.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  resource_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Recipients can view notifications" on public.notifications;
create policy "Recipients can view notifications"
  on public.notifications for select
  using (auth.uid() = recipient_id);

drop policy if exists "Bound partners can create notifications" on public.notifications;
create policy "Bound partners can create notifications"
  on public.notifications for insert
  with check (
    auth.uid() = actor_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and partner_id = recipient_id
    )
  );

drop policy if exists "Recipients can mark notifications read" on public.notifications;
create policy "Recipients can mark notifications read"
  on public.notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- Shared records can be deleted by either member of the currently bound pair.
-- This replaces earlier policies that left visible delete buttons unable to act.
create or replace function public.is_record_owner_or_partner(owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = owner_id
      or exists (
        select 1 from public.profiles
        where id = owner_id and partner_id = auth.uid()
      );
$$;

grant execute on function public.is_record_owner_or_partner(uuid) to authenticated;

drop policy if exists "Creator can delete own todos" on public.todos;
drop policy if exists "Users can delete their own todos" on public.todos;
create policy "Bound partners can delete todos"
  on public.todos for delete using (public.is_record_owner_or_partner(created_by));

drop policy if exists "Creator can delete own wishes" on public.wishes;
drop policy if exists "Users can delete their own wishes" on public.wishes;
create policy "Bound partners can delete wishes"
  on public.wishes for delete using (public.is_record_owner_or_partner(created_by));

drop policy if exists "Creator can delete own diaries" on public.diaries;
drop policy if exists "Users can delete their own diaries" on public.diaries;
create policy "Bound partners can delete diaries"
  on public.diaries for delete using (public.is_record_owner_or_partner(author_id));

drop policy if exists "Creator can delete own memos" on public.memos;
drop policy if exists "Authors can delete their own memos" on public.memos;
create policy "Bound partners can delete memos"
  on public.memos for delete using (public.is_record_owner_or_partner(author_id));

drop policy if exists "Creator can delete own weekly summaries" on public.weekly_summaries;
drop policy if exists "Authors can delete their own weekly summaries" on public.weekly_summaries;
create policy "Bound partners can delete weekly summaries"
  on public.weekly_summaries for delete using (public.is_record_owner_or_partner(author_id));

drop policy if exists "Creator can delete own albums" on public.albums;
drop policy if exists "Users can delete their own albums" on public.albums;
create policy "Bound partners can delete albums"
  on public.albums for delete using (public.is_record_owner_or_partner(created_by));

drop policy if exists "Creator can delete own photos" on public.photos;
drop policy if exists "Users can delete their own photos" on public.photos;
create policy "Bound partners can delete photos"
  on public.photos for delete using (public.is_record_owner_or_partner(uploaded_by));
