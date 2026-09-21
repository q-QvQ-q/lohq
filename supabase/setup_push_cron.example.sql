-- Run once in Supabase SQL Editor AFTER replacing the two placeholders below.
-- The secret must be the same high-entropy value as PUSH_CRON_SECRET in Edge
-- Function Secrets. Do not commit a filled-in copy of this file.
create extension if not exists pg_cron;

select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'push_project_url');
select vault.create_secret('REPLACE_WITH_LONG_RANDOM_SECRET', 'push_cron_secret');

select cron.schedule(
  'lohq-push-dispatch-every-minute',
  '* * * * *',
  $$ select public.request_push_dispatch(); $$
);
