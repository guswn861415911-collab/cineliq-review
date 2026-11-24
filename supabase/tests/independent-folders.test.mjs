import { PGlite } from '../../work/sql-tools/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('independent folders preserve bookmarks, protect ownership and reject stale writes atomically', async () => {
  const db = new PGlite(),
    a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    f = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    g = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;insert into auth.users values('${a}'),('${b}');`,
    );
    for (const file of [
      '002_favorites.sql',
      '003_personal_library.sql',
      '006_independent_folders.sql',
    ])
      await db.exec(await readFile(new URL('../' + file, import.meta.url), 'utf8'));
    await db.exec(
      `insert into cineliq_folders(id,user_id,name) values('${f}','${a}','A'),('${g}','${b}','B');set role authenticated;set request.jwt.claim.sub='${a}';`,
    );
    await db.query('select cineliq_set_technique_folders($1,$2,$3)', [
      'CAM-001',
      [f],
      [],
    ]);
    assert.equal((await db.query('select * from cineliq_favorites')).rows.length, 0);
    assert.equal((await db.query('select * from cineliq_folder_items')).rows.length, 1);
    await assert.rejects(
      db.query('select cineliq_set_technique_folders($1,$2,$3)', ['CAM-001', [g], [f]]),
    );
    assert.equal((await db.query('select * from cineliq_folder_items')).rows.length, 1);
    await assert.rejects(
      db.query('select cineliq_set_technique_folders($1,$2,$3)', ['CAM-001', [], []]),
    );
    await db.query('insert into cineliq_favorites(user_id,technique_id) values($1,$2)', [
      a,
      'CAM-001',
    ]);
    await db.query('delete from cineliq_favorites where technique_id=$1', ['CAM-001']);
    assert.equal((await db.query('select * from cineliq_folder_items')).rows.length, 1);
    await db.query('insert into cineliq_favorites(user_id,technique_id) values($1,$2)', [
      a,
      'CAM-001',
    ]);
    await db.query('delete from cineliq_folders where id=$1', [f]);
    assert.equal((await db.query('select * from cineliq_favorites')).rows.length, 1);
    assert.equal((await db.query('select * from cineliq_folder_items')).rows.length, 0);
  } finally {
    await db.close();
  }
});
