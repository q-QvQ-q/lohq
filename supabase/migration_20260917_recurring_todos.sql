-- Apply before deploying the recurring-todo frontend.
alter table public.todos
  add column if not exists recurrence text not null default 'none';

alter table public.todos drop constraint if exists todos_recurrence_check;
alter table public.todos add constraint todos_recurrence_check
  check (recurrence in ('none', 'daily', 'weekly', 'monthly'));

create table if not exists public.todo_occurrence_completions (
  todo_id uuid not null references public.todos(id) on delete cascade,
  occurrence_date date not null,
  completed_by uuid not null references public.profiles(id),
  completed_at timestamptz not null default now(),
  primary key (todo_id, occurrence_date)
);

create index if not exists todo_occurrence_completions_date_idx
  on public.todo_occurrence_completions(occurrence_date);

alter table public.todo_occurrence_completions enable row level security;

drop policy if exists "Partners can view todo completions" on public.todo_occurrence_completions;
create policy "Partners can view todo completions"
  on public.todo_occurrence_completions for select
  using (exists (
    select 1 from public.todos t where t.id = todo_id
      and public.is_record_owner_or_partner(t.created_by)
  ));

drop policy if exists "Partners can complete recurring todos" on public.todo_occurrence_completions;
create policy "Partners can complete recurring todos"
  on public.todo_occurrence_completions for insert
  with check (completed_by = auth.uid() and exists (
    select 1 from public.todos t where t.id = todo_id
      and t.recurrence <> 'none'
      and occurrence_date >= t.due_date
      and public.is_record_owner_or_partner(t.created_by)
  ));

drop policy if exists "Partners can undo recurring todos" on public.todo_occurrence_completions;
create policy "Partners can undo recurring todos"
  on public.todo_occurrence_completions for delete
  using (exists (
    select 1 from public.todos t where t.id = todo_id
      and public.is_record_owner_or_partner(t.created_by)
  ));
