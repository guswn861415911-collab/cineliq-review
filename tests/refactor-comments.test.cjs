const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stripSqlComments } = require('../scripts/strip-config-comments.cjs');
test('SQL comment removal preserves quoted URLs, escaped strings and operators', () => {
  const quoted =
    "select 'https://example.com/a--b', '/*keep*/', \"column--name\", E'it\\'s--text', 4-2;";
  assert.equal(stripSqlComments(quoted), quoted);
  assert.equal(
    stripSqlComments('select 1/* outer /* inner */ done */+2; -- end\n'),
    'select 1 +2;  \n',
  );
  assert.equal(
    stripSqlComments("do $$begin -- note\nraise notice 'https://a/--b';end$$;"),
    "do $$begin  \nraise notice 'https://a/--b';end$$;",
  );
});
