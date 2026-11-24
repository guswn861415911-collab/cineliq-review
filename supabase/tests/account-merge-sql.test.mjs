import { PGlite } from '../../work/sql-tools/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const folder = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  request = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
test('real local SQL: union, folder collisions, idempotence, original preservation, rollback and RLS', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.cineliq_admins(user_id uuid);
 create table storage.objects(owner_id text,owner uuid);
 grant usage on schema public,auth to authenticated;
 insert into auth.users values('${a}'),('${b}');`);
    for (const file of [
      '002_favorites.sql',
      '003_personal_library.sql',
      '005_account_merge_test.sql',
    ])
      await db.exec(await readFile(new URL('../' + file, import.meta.url), 'utf8'));
    await db.exec(`insert into cineliq_favorites(user_id,technique_id) values('${a}','CAM-001'),('${b}','CAM-001'),('${b}','CAM-002');
 insert into cineliq_folders(id,user_id,name) values(gen_random_uuid(),'${a}','광고'),('${folder}','${b}','광고');
 insert into cineliq_folder_items(user_id,folder_id,technique_id) values('${b}','${folder}','CAM-002');`);
    const snap = async () =>
      (await db.query('select cineliq_merge_snapshot($1,$2) as s', [b, a])).rows[0].s;
    const original = await snap();

    await db.exec(`create function fail_copy() returns trigger language plpgsql as $$begin if new.user_id='${a}' then raise exception 'injected';end if;return new;end;$$;
 create trigger injected before insert on cineliq_folders for each row execute function fail_copy();`);
    await assert.rejects(
      db.query('select cineliq_merge_copy($1,$2,$3,$4)', [request, b, a, original]),
    );
    assert.deepEqual(await snap(), original);
    assert.equal(
      (await db.query('select count(*)::int n from cineliq_merge_backups')).rows[0].n,
      0,
    );
    await db.exec('drop trigger injected on cineliq_folders');
    await assert.rejects(
      db.query('select cineliq_merge_copy($1,$2,$3,$4)', [request, b, a, {}]),
    );
    const copied = (
      await db.query('select cineliq_merge_copy($1,$2,$3,$4) s', [
        request,
        b,
        a,
        original,
      ])
    ).rows[0].s;
    assert.equal(copied.state, 'data_copied_identity_pending');
    assert.equal(
      (
        await db.query('select count(*)::int n from cineliq_favorites where user_id=$1', [
          a,
        ])
      ).rows[0].n,
      2,
    );
    const folders = (
      await db.query('select name from cineliq_folders where user_id=$1 order by name', [
        a,
      ])
    ).rows;
    assert.deepEqual(
      folders.map((r) => r.name),
      ['광고', '광고 (통합 1)'],
    );
    const after = await snap();
    for (const kind of ['favorites', 'folders', 'entries'])
      assert.deepEqual(
        after[kind].filter((r) => r.user_id === b),
        original[kind].filter((r) => r.user_id === b),
      );
    assert.equal(after.entries.filter((r) => r.user_id === a).length, 1);
    await db.query('select cineliq_merge_copy($1,$2,$3,$4)', [request, b, a, original]);
    assert.deepEqual(await snap(), after);
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}';`);
    assert.ok(
      (await db.query('select * from cineliq_favorites')).rows.every(
        (r) => r.user_id === a,
      ),
    );
    assert.ok(
      (await db.query('select * from cineliq_folders')).rows.every(
        (r) => r.user_id === a,
      ),
    );
    assert.ok(
      (await db.query('select * from cineliq_folder_items')).rows.every(
        (r) => r.user_id === a,
      ),
    );
    await assert.rejects(db.query('select * from cineliq_merge_backups'));
    await assert.rejects(db.query('select cineliq_merge_snapshot($1,$2)', [a, b]));
    await assert.rejects(
      db.query('insert into cineliq_favorites(user_id,technique_id) values($1,$2)', [
        b,
        'CAM-003',
      ]),
    );
  } finally {
    await db.close();
  }
});
