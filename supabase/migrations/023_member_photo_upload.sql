-- Alle Mitglieder dürfen Fotos hochladen; löschen darf jeder seine eigenen, Ralle (Admin) alle.
alter table public.tour_photos add column if not exists uploaded_by uuid references public.members(id) on delete set null default public.current_member_id();

create policy photos_member_insert on public.tour_photos for insert to authenticated
  with check (public.is_member() and uploaded_by = public.current_member_id());
create policy photos_own_delete on public.tour_photos for delete to authenticated
  using (uploaded_by = public.current_member_id());

drop policy if exists tour_photos_insert on storage.objects;
create policy tour_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tour-photos' and public.is_member());
drop policy if exists tour_photos_delete on storage.objects;
create policy tour_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tour-photos' and (public.is_admin() or owner = auth.uid()));
