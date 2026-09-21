-- Private couple avatars. Each person writes only inside their own UUID folder;
-- a bound partner may read that folder so both avatars can appear on the home screen.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do update set public = false;

drop policy if exists "Couples can view avatars" on storage.objects;
create policy "Couples can view avatars"
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.partner_id::text = (storage.foldername(name))[1]
    )
  )
);

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
