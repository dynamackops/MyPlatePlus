create or replace function public.join_circle_by_code(code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare target_id uuid;
declare joined_count integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select id into target_id from public.circles where lower(invite_code) = lower(trim(code));
  if target_id is null then raise exception 'Invalid invite code'; end if;
  insert into public.circle_members (circle_id, user_id, role)
  values (target_id, (select auth.uid()), 'member') on conflict do nothing;
  get diagnostics joined_count = row_count;
  if joined_count > 0 then
    insert into public.sharing_audit (actor_id, circle_id, action)
    values ((select auth.uid()), target_id, 'member_joined');
  end if;
  return target_id;
end;
$$;
revoke all on function public.join_circle_by_code(text) from public, anon;
grant execute on function public.join_circle_by_code(text) to authenticated;