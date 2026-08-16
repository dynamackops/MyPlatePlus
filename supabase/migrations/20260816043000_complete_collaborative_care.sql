drop policy if exists "circle reads approved requests" on public.pass_requests;
drop policy if exists "participants update request" on public.pass_requests;

create policy "participants read approved requests" on public.pass_requests for select to authenticated
using (
  sender_id = (select auth.uid())
  or recipient_id = (select auth.uid())
  or (recipient_id is null and private.is_circle_member(circle_id))
);

drop policy if exists "members create own requests" on public.pass_requests;
create policy "members create own requests" on public.pass_requests for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and private.is_circle_member(circle_id)
  and (
    recipient_id is null
    or exists (
      select 1 from public.circle_members recipient
      where recipient.circle_id = pass_requests.circle_id
        and recipient.user_id = pass_requests.recipient_id
    )
  )
);

revoke update on public.pass_requests from authenticated;

create or replace function public.join_circle_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
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

create or replace function public.respond_to_pass_request(request_id uuid, decision public.request_status)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare target public.pass_requests%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if decision not in ('accepted', 'declined') then raise exception 'Unsupported response'; end if;

  select * into target from public.pass_requests where id = request_id for update;
  if target.id is null or target.status <> 'open' then raise exception 'Request is no longer open'; end if;
  if target.sender_id = (select auth.uid()) then raise exception 'Senders cannot answer their own request'; end if;
  if target.recipient_id is not null and target.recipient_id <> (select auth.uid()) then raise exception 'This request belongs to another recipient'; end if;
  if target.recipient_id is null and not private.is_circle_member(target.circle_id) then raise exception 'Circle membership required'; end if;

  update public.pass_requests
  set status = decision,
      recipient_id = coalesce(target.recipient_id, (select auth.uid())),
      responded_at = now()
  where id = request_id;

  insert into public.sharing_audit (actor_id, circle_id, action, resource_id)
  values ((select auth.uid()), target.circle_id, 'request_updated', request_id);
  return request_id;
end;
$$;
revoke all on function public.respond_to_pass_request(uuid, public.request_status) from public, anon;
grant execute on function public.respond_to_pass_request(uuid, public.request_status) to authenticated;
