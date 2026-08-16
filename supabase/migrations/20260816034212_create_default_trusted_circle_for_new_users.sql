create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_circle_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    )
  );

  insert into public.circles (owner_id, name)
  values (new.id, 'My Trusted Circle')
  returning id into new_circle_id;

  insert into public.circle_members (circle_id, user_id, role)
  values (new_circle_id, new.id, 'owner');

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;