-- MyPlate+ reference schema
-- Apply in a new Supabase project, then generate a tracked migration with the Supabase CLI.
-- All personal data is private by default. Shared support requests contain only approved fields.

create extension if not exists pgcrypto;

create type public.capacity_status as enum ('open', 'limited', 'full', 'recovering');
create type public.member_role as enum ('owner', 'member');
create type public.plate_item_status as enum ('active', 'side-plate', 'waiting', 'complete');
create type public.request_kind as enum ('take-it', 'share-it', 'do-together', 'help-start', 'remind-me', 'listen');
create type public.request_status as enum ('open', 'accepted', 'declined', 'completed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  theme text not null default 'botanical' check (theme in ('botanical','midnight','bloom','ocean','golden','contrast')),
  shared_status public.capacity_status not null default 'limited',
  share_capacity_percent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now()
);

create table public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create table public.capacity_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  physical smallint not null check (physical between 1 and 5),
  cognitive smallint not null check (cognitive between 1 and 5),
  emotional smallint not null check (emotional between 1 and 5),
  sensory smallint not null check (sensory between 1 and 5),
  social smallint not null check (social between 1 and 5),
  recovery smallint not null check (recovery between 1 and 5),
  available_points smallint not null check (available_points between 20 and 120),
  checked_in_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, checked_in_on)
);

create table public.plate_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  private_note text check (char_length(private_note) <= 2000),
  category text not null check (category in ('work','home','health','social','creative','waiting')),
  points smallint not null check (points between 1 and 100),
  loads text[] not null default '{}',
  status public.plate_item_status not null default 'active',
  due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint allowed_loads check (loads <@ array['cognitive','emotional','physical','sensory','social']::text[])
);

create table public.pass_requests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete set null,
  source_item_id uuid references public.plate_items(id) on delete set null,
  public_title text not null check (char_length(public_title) between 1 and 240),
  public_note text not null default '' check (char_length(public_note) <= 800),
  kind public.request_kind not null,
  status public.request_status not null default 'open',
  points smallint not null check (points between 1 and 100),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_pass check (recipient_id is null or recipient_id <> sender_id)
);

create table public.shared_responsibilities (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  points smallint not null check (points between 1 and 100),
  status text not null default 'active' check (status in ('active','complete')),
  created_at timestamptz not null default now()
);

create table public.sharing_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  circle_id uuid not null references public.circles(id) on delete cascade,
  action text not null check (action in ('request_created','request_updated','member_joined','member_removed','status_changed')),
  resource_id uuid,
  created_at timestamptz not null default now()
);

create index plate_items_owner_status_idx on public.plate_items (owner_id, status);
create index checkins_user_date_idx on public.capacity_checkins (user_id, checked_in_on desc);
create index circle_members_user_idx on public.circle_members (user_id, circle_id);
create index pass_requests_circle_status_idx on public.pass_requests (circle_id, status, created_at desc);
create index pass_requests_recipient_idx on public.pass_requests (recipient_id, status) where recipient_id is not null;
create index shared_responsibilities_circle_idx on public.shared_responsibilities (circle_id, status);
create index sharing_audit_actor_idx on public.sharing_audit (actor_id, created_at desc);
create index circles_owner_idx on public.circles (owner_id);
create index pass_requests_sender_idx on public.pass_requests (sender_id);
create index pass_requests_source_item_idx on public.pass_requests (source_item_id) where source_item_id is not null;
create index shared_responsibilities_created_by_idx on public.shared_responsibilities (created_by);
create index sharing_audit_circle_idx on public.sharing_audit (circle_id);

alter table public.profiles enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.capacity_checkins enable row level security;
alter table public.plate_items enable row level security;
alter table public.pass_requests enable row level security;
alter table public.shared_responsibilities enable row level security;
alter table public.sharing_audit enable row level security;

-- New Supabase projects no longer expose public tables automatically.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.circles to authenticated;
grant select, insert, update, delete on public.circle_members to authenticated;
grant select, insert, update, delete on public.capacity_checkins to authenticated;
grant select, insert, update, delete on public.plate_items to authenticated;
grant select, insert, update on public.pass_requests to authenticated;
grant select, insert, update, delete on public.shared_responsibilities to authenticated;
grant select on public.sharing_audit to authenticated;
grant usage, select on sequence public.sharing_audit_id_seq to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_circle_member(target_circle uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.circle_members
    where circle_id = target_circle and user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_circle_member(uuid) from public, anon;
grant execute on function private.is_circle_member(uuid) to authenticated;

create policy "profiles self or circle peers select" on public.profiles for select to authenticated
using (
  (select auth.uid()) = id
  or exists (
    select 1 from public.circle_members mine
    join public.circle_members theirs on theirs.circle_id = mine.circle_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
  )
);
create policy "profiles own insert" on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
create policy "profiles own update" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "circle members read" on public.circles for select to authenticated
using (private.is_circle_member(id) or owner_id = (select auth.uid()));
create policy "users create circles" on public.circles for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy "owners update circles" on public.circles for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners delete circles" on public.circles for delete to authenticated
using (owner_id = (select auth.uid()));

create policy "members read circle membership" on public.circle_members for select to authenticated
using (private.is_circle_member(circle_id) or user_id = (select auth.uid()));
create policy "owners add members" on public.circle_members for insert to authenticated
with check (exists (select 1 from public.circles where id = circle_id and owner_id = (select auth.uid())));
create policy "owners or self remove membership" on public.circle_members for delete to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.circles where id = circle_id and owner_id = (select auth.uid())));

create policy "checkins own rows" on public.capacity_checkins for select to authenticated
using (user_id = (select auth.uid()));
create policy "checkins own insert" on public.capacity_checkins for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "checkins own update" on public.capacity_checkins for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "checkins own delete" on public.capacity_checkins for delete to authenticated
using (user_id = (select auth.uid()));

create policy "plate items remain private" on public.plate_items for select to authenticated
using (owner_id = (select auth.uid()));
create policy "plate owners insert" on public.plate_items for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy "plate owners update" on public.plate_items for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "plate owners delete" on public.plate_items for delete to authenticated
using (owner_id = (select auth.uid()));

create policy "circle reads approved requests" on public.pass_requests for select to authenticated
using (private.is_circle_member(circle_id));
create policy "members create own requests" on public.pass_requests for insert to authenticated
with check (sender_id = (select auth.uid()) and private.is_circle_member(circle_id));
create policy "participants update request" on public.pass_requests for update to authenticated
using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
with check (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

create policy "circle reads shared responsibilities" on public.shared_responsibilities for select to authenticated
using (private.is_circle_member(circle_id));
create policy "members create shared responsibilities" on public.shared_responsibilities for insert to authenticated
with check (created_by = (select auth.uid()) and private.is_circle_member(circle_id));
create policy "members update shared responsibilities" on public.shared_responsibilities for update to authenticated
using (private.is_circle_member(circle_id)) with check (private.is_circle_member(circle_id));
create policy "creator deletes shared responsibility" on public.shared_responsibilities for delete to authenticated
using (created_by = (select auth.uid()));

create policy "actors read sharing history" on public.sharing_audit for select to authenticated
using (actor_id = (select auth.uid()));

create or replace function public.join_circle_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare target_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select id into target_id from public.circles where invite_code = code;
  if target_id is null then raise exception 'Invalid invite code'; end if;
  insert into public.circle_members (circle_id, user_id, role)
  values (target_id, (select auth.uid()), 'member') on conflict do nothing;
  return target_id;
end;
$$;
revoke all on function public.join_circle_by_code(text) from public, anon;
grant execute on function public.join_circle_by_code(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Realtime: pass requests are the only table enabled by default.
-- Personal plate and check-in changes remain outside the shared stream.
alter publication supabase_realtime add table public.pass_requests;
