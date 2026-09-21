-- Apply after migration_20260914_notifications_and_weekly_uniqueness.sql.
-- Reminder time is interpreted in Asia/Shanghai by the dispatch function.

alter table public.todos add column if not exists remind_enabled boolean;
update public.todos set remind_enabled = (priority = 'high') where remind_enabled is null;
alter table public.todos alter column remind_enabled set default false;
alter table public.todos alter column remind_enabled set not null;
alter table public.todos add column if not exists remind_time time without time zone not null default time '09:00';

alter table public.anniversaries add column if not exists remind_enabled boolean not null default false;
alter table public.anniversaries add column if not exists remind_time time without time zone not null default time '09:00';

-- A device subscription belongs to exactly one signed-in account. Endpoint and
-- encryption keys are capabilities and must not be readable by other users.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists "Read own push subscriptions" on public.push_subscriptions;
create policy "Read own push subscriptions" on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "Create own push subscriptions" on public.push_subscriptions;
create policy "Create own push subscriptions" on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "Update own push subscriptions" on public.push_subscriptions;
create policy "Update own push subscriptions" on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Delete own push subscriptions" on public.push_subscriptions;
create policy "Delete own push subscriptions" on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- One delivery per device and event, including repeated calendar occurrences.
create table if not exists public.push_deliveries (
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  event_key text not null,
  sent_at timestamptz not null default now(),
  primary key (subscription_id, event_key)
);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;
grant select, insert, update, delete on public.push_deliveries to service_role;

alter table public.notifications add column if not exists push_sent_at timestamptz;
create index if not exists notifications_push_pending_idx
  on public.notifications(created_at) where push_sent_at is null;

-- Wake the dispatcher as soon as a comment/message creates an in-app notification.
-- If Vault secrets are not set yet, the notification insert still succeeds;
-- the one-minute cron is the retry path.
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.request_push_dispatch()
returns void language plpgsql security definer set search_path = '' as $$
declare
  project_url text;
  cron_secret text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'push_project_url';
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'push_cron_secret';
  if project_url is not null and cron_secret is not null then
    perform net.http_post(
      url := project_url || '/functions/v1/push-dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', cron_secret),
      body := '{}'::jsonb
    );
  end if;
exception when others then
  raise warning 'Unable to queue Web Push dispatch: %', sqlerrm;
end;
$$;
revoke all on function public.request_push_dispatch() from public, anon, authenticated;

create or replace function public.push_on_notification_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.request_push_dispatch();
  return new;
end;
$$;
revoke all on function public.push_on_notification_insert() from public, anon, authenticated;
drop trigger if exists push_on_notification_insert on public.notifications;
create trigger push_on_notification_insert after insert on public.notifications
  for each row execute function public.push_on_notification_insert();
