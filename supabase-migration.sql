create table if not exists public.demo_submissions (
  id uuid primary key,
  owner_uid uuid not null,
  participant_number text not null check (char_length(participant_number) between 1 and 40),
  coupon_reference text not null check (char_length(coupon_reference) between 1 and 40),
  coupon_code text not null default '',
  coupon_status text not null default 'not_submitted'
    check (coupon_status in ('not_submitted', 'pending', 'accepted', 'rejected')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.demo_submissions enable row level security;

drop policy if exists "anonymous owner can create submission" on public.demo_submissions;
drop policy if exists "owner can read submission" on public.demo_submissions;
drop policy if exists "owner can submit coupon" on public.demo_submissions;
drop policy if exists "admin can list submissions" on public.demo_submissions;
drop policy if exists "admin can review submissions" on public.demo_submissions;

create table if not exists public.admin_users (
  uid uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "admin can read own row" on public.admin_users;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where uid = auth.uid() and enabled = true
  );
$$;

grant select, insert, update on public.demo_submissions to authenticated;
grant select on public.admin_users to authenticated;

create policy "anonymous owner can create submission"
  on public.demo_submissions for insert to authenticated
  with check (owner_uid = auth.uid() and status = 'pending');

create policy "owner can read submission"
  on public.demo_submissions for select to authenticated
  using (owner_uid = auth.uid() or public.is_admin());

create policy "owner can submit coupon"
  on public.demo_submissions for update to authenticated
  using (owner_uid = auth.uid() and status = 'accepted')
  with check (
    owner_uid = auth.uid()
    and status = 'accepted'
    and coupon_status = 'pending'
  );

create or replace function public.check_demo_submission_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if old.owner_uid <> auth.uid()
    or old.status <> 'accepted'
    or old.coupon_status not in ('not_submitted', 'rejected') then
    raise exception 'not allowed to update this submission';
  end if;

  if new.id is distinct from old.id
    or new.owner_uid is distinct from old.owner_uid
    or new.participant_number is distinct from old.participant_number
    or new.coupon_reference is distinct from old.coupon_reference
    or new.status is distinct from old.status
    or new.coupon_status is distinct from 'pending'
    or new.created_at is distinct from old.created_at then
    raise exception 'only coupon_code and pending coupon_status may be updated by the owner';
  end if;

  if new.coupon_code !~ '^\d{6}$' then
    raise exception 'coupon_code must contain exactly 6 digits';
  end if;

  return new;
end;
$$;

drop trigger if exists check_demo_submission_update on public.demo_submissions;
create trigger check_demo_submission_update
  before update on public.demo_submissions
  for each row execute function public.check_demo_submission_update();

create policy "admin can list submissions"
  on public.demo_submissions for select to authenticated
  using (public.is_admin());

create policy "admin can review submissions"
  on public.demo_submissions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin can delete submissions" on public.demo_submissions;
create policy "admin can delete submissions"
  on public.demo_submissions for delete to authenticated
  using (public.is_admin());

drop policy if exists "admin can select submissions" on public.demo_submissions;
create policy "admin can select submissions"
  on public.demo_submissions for select to authenticated
  using (public.is_admin());

create policy "admin can read own row"
  on public.admin_users for select to authenticated
  using (uid = auth.uid());

create table if not exists public.client_tracking (
  session_id text primary key,
  current_page text not null check (current_page in ('main', 'verify', 'waiting', 'accepted', 'rejected')),
  status text not null,
  participant_number text,
  submission_id uuid,
  last_seen_at timestamptz not null default now()
);

alter table public.client_tracking enable row level security;

drop policy if exists "clients can update tracking" on public.client_tracking;
create policy "clients can update tracking"
  on public.client_tracking for all to authenticated
  using (true)
  with check (true);

drop policy if exists "admin can manage tracking" on public.client_tracking;
create policy "admin can manage tracking"
  on public.client_tracking for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update on public.client_tracking to authenticated;

create index if not exists client_tracking_last_seen_idx
  on public.client_tracking(last_seen_at desc);

create index if not exists demo_submissions_created_at_idx
  on public.demo_submissions(created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'demo_submissions'
  ) then
    alter publication supabase_realtime add table public.demo_submissions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'client_tracking'
  ) then
    alter publication supabase_realtime add table public.client_tracking;
  end if;
end;
$$;

-- Create the admin account in Authentication with email admin@beso.local first.
-- Then run this query to grant dashboard access to that account:
-- insert into public.admin_users(uid, enabled)
-- select id, true
-- from auth.users
-- where email = 'admin@beso.local'
-- on conflict (uid) do update set enabled = true;
