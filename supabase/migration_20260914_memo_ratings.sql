-- Run once in the Supabase SQL Editor after the notifications migration.
create table if not exists public.memo_ratings (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.memos(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (memo_id, reviewer_id)
);

create index if not exists memo_ratings_memo_idx on public.memo_ratings(memo_id);
alter table public.memo_ratings enable row level security;

drop policy if exists "Couples can view memo ratings" on public.memo_ratings;
create policy "Couples can view memo ratings"
  on public.memo_ratings for select
  using (
    exists (
      select 1 from public.memos m
      where m.id = memo_ratings.memo_id
        and public.is_record_owner_or_partner(m.author_id)
    )
  );

drop policy if exists "Partners can rate each other's memos" on public.memo_ratings;
create policy "Partners can rate each other's memos"
  on public.memo_ratings for insert
  with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.memos m
      join public.profiles p on p.id = m.author_id
      where m.id = memo_ratings.memo_id
        and m.author_id <> auth.uid()
        and p.partner_id = auth.uid()
    )
  );

drop policy if exists "Reviewers can update their memo ratings" on public.memo_ratings;
create policy "Reviewers can update their memo ratings"
  on public.memo_ratings for update
  using (auth.uid() = reviewer_id)
  with check (auth.uid() = reviewer_id and score between 1 and 5);
