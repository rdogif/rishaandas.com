-- Run once in the existing project AFTER 001_homework.sql.
-- Makes all assignments, including notes, publicly readable.
begin;

-- Enforce a single approved admin. If multiple members exist, this fails
-- safely: keep only your admin membership before running this migration.
create unique index homework_single_admin
  on public.homework_members ((true));

-- Public visitors can read, but receive no write privileges.
revoke all on public.homework_assignments from anon;
grant select on public.homework_assignments to anon;

drop policy "Read own homework" on public.homework_assignments;
create policy "Public can read homework"
  on public.homework_assignments for select to anon, authenticated
  using (true);

-- Keep RLS, membership protections, and the existing approved-owner
-- INSERT / UPDATE / DELETE policies and column grants from 001 unchanged.
commit;
