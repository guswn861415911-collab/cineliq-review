const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const window = {};
for (const file of [
  'data.js',
  'learning-data.js',
  'terminology-data.js',
  'production-data.js',
  'production-ui.js',
]) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    window,
  });
}
const items = new Map(window.CAMERA_TECHNIQUES.map((item) => [item.id, item]));
const terms = window.CINELIQ_TERMINOLOGY;
const production = window.CINELIQ_PRODUCTION;
const ui = window.CINELIQ_PRACTICE({
  items,
  escape: (value) => String(value ?? ''),
  copyIcon: '',
});
test('curated terminology and production guides reference real data and preserve unsupported coverage', () => {
  const ids = new Set(terms.terms.map((term) => term.id));
  assert.equal(ids.size, terms.terms.length);
  for (const term of terms.terms) {
    assert.ok(terms.categories[term.type]);
    for (const id of term.techniqueIds) assert.ok(items.has(id), `${term.id}: ${id}`);
    for (const id of term.sourceIds) assert.ok(terms.sources[id]);
    assert.ok(term.meaning && term.note && term.pronunciation);
  }
  for (const [id, profile] of Object.entries(production.profiles)) {
    assert.ok(items.has(id) && ids.has(profile.termId));
    assert.ok(profile.onSetExample && profile.aiProductionExample);
    assert.ok(
      profile.imageGenerationGuide.length >= 2 &&
        profile.videoGenerationGuide.length >= 2 &&
        profile.editingTips.length >= 2,
    );
    for (const key of profile.relatedTerms) assert.ok(ids.has(key));
    for (const key of Object.keys(profile.issueContexts))
      assert.ok(production.issues[key]);
    for (const key of profile.editingSequence) assert.ok(items.has(key));
    for (const kind of ['image', 'video']) {
      assert.ok(profile[kind + 'Prompt'].length > 200);
      assert.doesNotMatch(profile[kind + 'Prompt'], /\[[^\]]+\]|undefined/);
      assert.equal(ui.copy(id, kind), profile[kind + 'Prompt']);
    }
    assert.ok(ui.guideMarkup(id).includes('data-practice-copy'));
  }
  assert.equal(Object.keys(production.profiles).length, 6);
  assert.equal(ui.guideMarkup('CAM-414'), '');
  assert.equal(Object.keys(production.issues).length, 9);
  for (const pair of production.comparisons) {
    assert.equal(new Set(pair.ids).size, 2);
    for (const id of pair.ids) assert.ok(items.has(id));
    for (const key of ['common', 'visual', 'purpose', 'image', 'video', 'editing'])
      assert.ok(pair[key]);
  }
});
test('abbreviation, pronunciation and punctuation matching respects ambiguous OS meanings', () => {
  const match = (query) =>
    [...items.values()].filter((item) => ui.matches(item, query)).map((item) => item.id);
  for (const query of ['OTS', 'ots', '오티에스', '오버더숄더', '어깨너머 샷'])
    assert.ok(match(query).includes('CAM-080'), query);
  assert.deepEqual(match('CU'), ['CAM-012']);
  assert.ok(match('POV').includes('CAM-082'));
  assert.ok(match('피오브이').includes('CAM-082'));
  assert.ok(match('J-Cut').includes('CAM-263'));
  assert.ok(match('제이 컷').includes('CAM-263'));
  assert.deepEqual(
    Array.from(ui.matchingTerms('OS'), (term) => term.id),
    ['ots', 'offscreen'],
  );
  assert.equal(ui.matchingTerms('Codec')[0].id, 'codec');
  assert.equal(ui.matchingTerms('Camera Drift')[0].id, 'issue-camera');
  assert.equal(
    ui.normalize('Two-Point Perspective'),
    ui.normalize('two point perspective'),
  );
  assert.equal(ui.badges('CAM-083'), '');
  assert.ok(ui.badges('CAM-082').includes('POV'));
});
test('missing optional production data leaves existing techniques usable', () => {
  const fallback = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'production-ui.js'), 'utf8'),
    { window: fallback },
  );
  const view = fallback.CINELIQ_PRACTICE({ items, escape: String, copyIcon: '' });
  assert.equal(view.guideMarkup('CAM-080'), '');
  assert.equal(view.termMarkup('CAM-080'), '');
  assert.equal(view.badges('CAM-080'), '');
  assert.equal(view.matches(items.get('CAM-012'), 'close up'), true);
});
