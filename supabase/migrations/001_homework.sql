-- Run once in a NEW Supabase project's SQL Editor. No secrets in this file.
begin;
create table public.homework_members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.homework_members enable row level security;
revoke all on public.homework_members from anon, authenticated;
grant select on public.homework_members to authenticated;
create policy "Read own membership" on public.homework_members
  for select to authenticated using (user_id = (select auth.uid()));

create table public.homework_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 100),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  due_date date not null check (due_date between date '1900-01-01' and date '9999-12-31'),
  notes text not null default '' check (char_length(notes) <= 5000),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index homework_owner_due on public.homework_assignments (user_id, completed, due_date);
alter table public.homework_assignments enable row level security;
revoke all on public.homework_assignments from anon, authenticated;
grant select, delete on public.homework_assignments to authenticated;
grant insert (user_id, subject, name, due_date, notes, completed) on public.homework_assignments to authenticated;
grant update (subject, name, due_date, notes, completed) on public.homework_assignments to authenticated;

create policy "Read own homework" on public.homework_assignments for select to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.homework_members where user_id = (select auth.uid())));
create policy "Add own homework" on public.homework_assignments for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.homework_members where user_id = (select auth.uid())));
create policy "Edit own homework" on public.homework_assignments for update to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.homework_members where user_id = (select auth.uid())))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.homework_members where user_id = (select auth.uid())));
create policy "Delete own homework" on public.homework_assignments for delete to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.homework_members where user_id = (select auth.uid())));

create function public.homework_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function public.homework_touch_updated_at() from public, anon, authenticated;
create trigger homework_updated before update on public.homework_assignments
  for each row execute function public.homework_touch_updated_at();
commit;
