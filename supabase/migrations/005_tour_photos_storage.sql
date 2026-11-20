-- Privater Fotospeicher für das Tour-Archiv: nur Mitglieder sehen Fotos, nur Admins laden hoch oder löschen
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tour-photos', 'tour-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy tour_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'tour-photos' and public.is_member());
create policy tour_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tour-photos' and public.is_admin());
create policy tour_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tour-photos' and public.is_admin());
