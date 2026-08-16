create index if not exists circles_owner_idx on public.circles (owner_id);
create index if not exists pass_requests_sender_idx on public.pass_requests (sender_id);
create index if not exists pass_requests_source_item_idx on public.pass_requests (source_item_id) where source_item_id is not null;
create index if not exists shared_responsibilities_created_by_idx on public.shared_responsibilities (created_by);
create index if not exists sharing_audit_circle_idx on public.sharing_audit (circle_id);

drop policy if exists "profiles own select" on public.profiles;
drop policy if exists "profiles circle peers select" on public.profiles;
create policy "profiles self or circle peers select"
on public.profiles for select to authenticated
using (
  (select auth.uid()) = id
  or exists (
    select 1
    from public.circle_members mine
    join public.circle_members theirs on theirs.circle_id = mine.circle_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = profiles.id
  )
);