-- Persist the most recent app login so a partner can see it after presence goes offline.
alter table public.profiles
  add column if not exists last_login_at timestamptz;

-- Give existing profiles a useful initial value until their next login.
update public.profiles
set last_login_at = coalesce(last_login_at, updated_at, created_at)
where last_login_at is null;
