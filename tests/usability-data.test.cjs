const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const window = {},
  root = path.join(__dirname, '..');
for (const file of [
  'data.js',
  'learning-data.js',
  'terminology-data.js',
  'production-data.js',
  'full-learning-data.js',
  'technique-names.js',
  'content-types.js',
  'video-models.js',
])
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { window });
test('registered image and video technique types are disjoint and empty selection means all', () => {
  const items = window.CAMERA_TECHNIQUES,
    filter = window.CINELIQ_CONTENT_TYPES;
  assert.equal(items.filter((item) => filter.matches(item, new Set())).length, 414);
  assert.equal(
    items.filter((item) => filter.matches(item, new Set(['image', 'video']))).length,
    414,
  );
  assert.equal(
    items.filter((item) => filter.matches(item, new Set(['image']))).length,
    277,
  );
  assert.equal(
    items.filter((item) => filter.matches(item, new Set(['video']))).length,
    137,
  );
  assert.ok(
    items.every((item) => filter.forItem(item).image !== filter.forItem(item).video),
  );
  assert.equal(
    filter.matches(
      items.find((item) => item.id === 'CAM-001'),
      new Set(['video']),
    ),
    false,
  );
  assert.equal(
    filter.matches(
      items.find((item) => item.id === 'CAM-107'),
      new Set(['video']),
    ),
    true,
  );
});
test('reviewed display overrides retain stable IDs, exact English and searchable old meanings', () => {
  assert.equal(window.CAMERA_TECHNIQUES.length, 414);
  assert.equal(Object.keys(window.CINELIQ_NAME_OVERRIDES).length, 4);
  const item = window.CAMERA_TECHNIQUES.find((item) => item.id === 'CAM-040');
  assert.equal(item.ko, '센터드 컴포지션');
  assert.equal(item.originalKo, '중앙 구도');
  assert.equal(item.en, 'Centered Composition');
  assert.equal(item.displaySubtitle, 'Centered Composition · 중앙 구도');
});
test('model selection preserves existing Veo content and never clones it under unprepared models', () => {
  const models = window.CINELIQ_VIDEO_MODELS;
  assert.equal(models.models.length, 6);
  for (const item of window.CAMERA_TECHNIQUES) {
    assert.equal(
      models.value(item.id, 'veo'),
      window.CINELIQ_FULL_LEARNING.records[item.id].videoGuide?.veoKoreanPrompt,
    );
    for (const key of ['omni11', 'omni12', 'seedance', 'higgsfield'])
      assert.equal(models.value(item.id, key), undefined);
  }
});
