const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const parser = require('../work/refactor-tools/node_modules/@babel/parser');
const postcss = require('../work/refactor-tools/node_modules/postcss');
const { stripSqlComments } = require('../scripts/strip-config-comments.cjs');
const projectRoot = path.join(__dirname, '..');
test('tracked source files contain no syntactic comments', async () => {
  const { parse } =
    await import('../work/refactor-tools/node_modules/parse5/dist/index.js');
  const files = childProcess
    .execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: projectRoot,
      encoding: 'utf8',
    })
    .trim()
    .split(/\r?\n/);
  for (const filename of new Set(files)) {
    const extension = path.extname(filename);
    if (
      !['.js', '.cjs', '.mjs', '.ts', '.html', '.css', '.svg', '.sql', '.toml'].includes(
        extension,
      )
    )
      continue;
    const source = fs.readFileSync(path.join(projectRoot, filename), 'utf8');
    if (['.js', '.cjs', '.mjs', '.ts'].includes(extension)) {
      const syntax = parser.parse(source, {
        sourceType: 'unambiguous',
        plugins: extension === '.ts' ? ['typescript'] : [],
      });
      assert.equal(syntax.comments.length, 0, filename);
    } else if (extension === '.css') {
      let count = 0;
      postcss.parse(source).walkComments(() => count++);
      assert.equal(count, 0, filename);
    } else if (extension === '.html') {
      function checkNode(node) {
        assert.notEqual(node.nodeName, '#comment', filename);
        for (const child of node.childNodes || []) checkNode(child);
        if (node.content) checkNode(node.content);
      }
      checkNode(parse(source));
    } else if (extension === '.svg') assert.ok(!source.includes('<!--'), filename);
    else if (extension === '.sql')
      assert.equal(stripSqlComments(source), source, filename);
    else assert.ok(!/^\s*#/m.test(source), filename);
  }
});
