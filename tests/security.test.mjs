import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('migration enforces anonymous denial, ownership, membership, and optimistic concurrency', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${owner}'), ('${other}');`);
    await db.exec(await readFile(new URL('../supabase/migrations/001_homework.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into public.homework_members values ('${owner}'); set role anon;`);
    await assert.rejects(db.query('select * from public.homework_assignments'), /permission denied/);
    await assert.rejects(db.query("insert into public.homework_assignments(subject,name,due_date) values ('Physics','Page 42','2026-10-07')"), /permission denied/);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${owner}';`);
    const { rows: [record] } = await db.query("insert into public.homework_assignments(subject,name,due_date) values ('Physics','Page 42','2026-10-07') returning id, updated_at::text");
    await assert.rejects(db.query(`insert into public.homework_assignments(user_id,subject,name,due_date) values ('${other}','Math','Forbidden','2026-10-07')`), /row-level security/);
    await assert.rejects(db.query(`update public.homework_assignments set user_id = '${other}'`), /permission denied/);
    await assert.rejects(db.query("update public.homework_assignments set updated_at = now()"), /permission denied/);
    await assert.rejects(db.query("update public.homework_assignments set name = ' '"), /check constraint/);
    const updated = await db.query('update public.homework_assignments set completed = true where id = $1 and updated_at = $2 returning updated_at::text', [record.id, record.updated_at]);
    assert.equal(updated.rows.length, 1);
    assert.notEqual(updated.rows[0].updated_at, record.updated_at);
    assert.equal((await db.query('update public.homework_assignments set name = $1 where id = $2 and updated_at = $3 returning id', ['Stale', record.id, record.updated_at])).rows.length, 0);
    await db.exec(`set request.jwt.claim.sub = '${other}';`);
    assert.equal((await db.query('select * from public.homework_assignments')).rows.length, 0);
    await assert.rejects(db.query(`insert into public.homework_members values ('${other}')`), /permission denied/);
    await assert.rejects(db.query("insert into public.homework_assignments(subject,name,due_date) values ('Math','No membership','2026-10-07')"), /row-level security/);
    assert.equal((await db.query('delete from public.homework_assignments returning id')).rows.length, 0);
    assert.equal((await db.query("update public.homework_assignments set name = 'No' returning id")).rows.length, 0);
    await db.exec(`reset role; insert into public.homework_members values ('${other}'); set role authenticated;`);
    assert.equal((await db.query('select * from public.homework_assignments')).rows.length, 0);
    await db.exec(`reset role; delete from public.homework_members where user_id = '${owner}'; set role authenticated; set request.jwt.claim.sub = '${owner}';`);
    assert.equal((await db.query('select * from public.homework_assignments')).rows.length, 0);
    await db.exec(`reset role; insert into public.homework_members values ('${owner}'); set role authenticated;`);
    assert.equal((await db.query('delete from public.homework_assignments returning id')).rows.length, 1);
  } finally { await db.close(); }
});

test('002 preserves existing data, enables public reads, and permits only one approved owner to write', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${owner}'), ('${other}');`);
    await db.exec(await readFile(new URL('../supabase/migrations/001_homework.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into public.homework_members values ('${owner}');
      insert into public.homework_assignments(user_id,subject,name,due_date,notes)
      values ('${owner}','Physics','Page 42','2026-10-07','Public notes');`);
    await db.exec(await readFile(new URL('../supabase/migrations/002_public_read_admin_write.sql', import.meta.url), 'utf8'));
    await assert.rejects(db.query(`insert into public.homework_members values ('${other}')`), /unique constraint/);
    await db.exec('set role anon');
    assert.equal((await db.query('select notes from public.homework_assignments')).rows[0].notes, 'Public notes');
    await assert.rejects(db.query('select * from public.homework_members'), /permission denied/);
    for (const sql of [
      `insert into public.homework_assignments(user_id,subject,name,due_date) values ('${owner}','Math','No','2026-10-08')`,
      "update public.homework_assignments set completed = true",
      'delete from public.homework_assignments',
      `insert into public.homework_members values ('${other}')`,
    ]) await assert.rejects(db.query(sql), /permission denied/);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${other}';`);
    assert.equal((await db.query('select * from public.homework_assignments')).rows.length, 1);
    for (const id of [owner, other]) await assert.rejects(db.query(`insert into public.homework_assignments(user_id,subject,name,due_date) values ('${id}','Math','No','2026-10-08')`), /row-level security/);
    assert.equal((await db.query('update public.homework_assignments set completed = true returning id')).rows.length, 0);
    assert.equal((await db.query('delete from public.homework_assignments returning id')).rows.length, 0);
    await assert.rejects(db.query(`insert into public.homework_members values ('${other}')`), /permission denied/);
    await db.exec(`set request.jwt.claim.sub = '${owner}';`);
    const { rows: [row] } = await db.query('select id, updated_at::text from public.homework_assignments');
    assert.equal((await db.query('update public.homework_assignments set completed = true where id = $1 and updated_at = $2 returning id', [row.id, row.updated_at])).rows.length, 1);
    assert.equal((await db.query('delete from public.homework_assignments where id = $1 and updated_at = $2 returning id', [row.id, row.updated_at])).rows.length, 0);
    await assert.rejects(db.query(`update public.homework_assignments set user_id = '${other}'`), /permission denied/);
    await db.query("insert into public.homework_assignments(subject,name,due_date) values ('Math','Admin can add','2026-10-08')");
    await db.exec(`reset role; delete from public.homework_members; set role authenticated;`);
    assert.equal((await db.query('select * from public.homework_assignments')).rows.length, 2);
    assert.equal((await db.query('delete from public.homework_assignments returning id')).rows.length, 0);
    await db.exec(`reset role; insert into public.homework_members values ('${owner}'); set role authenticated;`);
    assert.equal((await db.query('delete from public.homework_assignments returning id')).rows.length, 2);
  } finally { await db.close(); }
});
