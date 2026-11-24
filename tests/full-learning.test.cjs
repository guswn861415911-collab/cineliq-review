const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const root = path.join(__dirname, '..'),
  window = {};
for (const file of [
  'data.js',
  'learning-data.js',
  'full-learning-data.js',
  'full-learning-ui.js',
])
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { window });
const items = new Map(window.CAMERA_TECHNIQUES.map((item) => [item.id, item]));
const data = window.CINELIQ_FULL_LEARNING;
test('414 ID coverage, 399 video guides, explicit omissions and valid original-data connections', () => {
  assert.equal(Object.keys(data.records).length, items.size);
  assert.equal(data.counts.previousVideoPrompts, 223);
  assert.equal(data.counts.newlyCoveredVideoPrompts, 176);
  assert.equal(data.counts.videoGuides, 399);
  assert.equal(
    data.counts.imageApplicable +
      data.counts.videoApplicable -
      data.counts.commonApplicable,
    414,
  );
  let videoCount = 0,
    omissionCount = 0;
  const prompts = new Set();
  const ui = window.CINELIQ_FULL_UI({ items, escape: String, copyIcon: '' });
  for (const [id, item] of items) {
    const record = data.records[id];
    assert.ok(record, id);
    assert.ok(
      record.imageGuide.setup && record.imageGuide.scene && record.imageGuide.pitfall,
      id,
    );
    assert.equal(record.imageGuide.visualChecks.length, 3, id);
    assert.ok(ui.markup(id).includes('data-full-learning="' + id + '"'), id);
    for (const key of record.comparisonIds)
      assert.ok(items.has(key) && key !== id, id + ' -> ' + key);
    const video = record.videoGuide;
    if (!video) {
      omissionCount++;
      assert.ok(record.videoOmissionReason, id);
      assert.notEqual(item.mediaType, 'video', id);
      continue;
    }
    videoCount++;
    for (const key of [
      'definition',
      'beginnerExplanation',
      'cameraAction',
      'subjectAction',
      'start',
      'change',
      'end',
      'effect',
    ])
      assert.ok(video[key], id + ': ' + key);
    assert.ok(video.control.equipment && video.issues.retry && video.editing.postFix, id);
    assert.ok(video.veoKoreanPrompt.length > 300, id);
    assert.doesNotMatch(
      video.veoKoreanPrompt,
      /\[[^\]]+\]|undefined|\*\*|입력해\s*주세요/,
      id,
    );
    prompts.add(video.veoKoreanPrompt);
    assert.equal(ui.copy(id), video.veoKoreanPrompt);
    if (
      [
        'fixed',
        'framing',
        'lighting',
        'optical',
        'style',
        'post',
        'focus',
        'zoom',
      ].includes(video.control.kind)
    )
      assert.equal(video.direction, null, id);
  }
  assert.equal(videoCount, 399);
  assert.equal(prompts.size, 399);
  assert.equal(omissionCount, 15);
  for (const pair of data.comparisons) {
    assert.equal(new Set(pair.ids).size, 2);
    pair.ids.forEach((id) => assert.ok(items.has(id)));
    assert.ok(pair.common && pair.difference && pair.ai);
  }
  assert.equal(data.model.executionVerified, false);
});
test('core camera movement families never collapse pan/truck, tilt/pedestal, dolly/zoom, or orbit/actor rotation', () => {
  const kind = (n) =>
    data.records['CAM-' + String(n).padStart(3, '0')].videoGuide.control.kind;
  for (const [n, expected] of [
    [105, 'fixed'],
    [106, 'fixed'],
    [107, 'pan'],
    [108, 'pan'],
    [109, 'tilt'],
    [110, 'tilt'],
    [111, 'roll'],
    [112, 'roll'],
    [113, 'dolly'],
    [114, 'dolly'],
    [117, 'truck'],
    [118, 'truck'],
    [120, 'pedestal'],
    [121, 'pedestal'],
    [122, 'zoom'],
    [123, 'zoom'],
    [124, 'tracking'],
    [125, 'tracking'],
    [132, 'orbit'],
    [133, 'orbit'],
    [187, 'handheld'],
    [168, 'handheld'],
  ])
    assert.equal(kind(n), expected);
  assert.match(
    data.records['CAM-133'].videoGuide.subjectAction,
    /피사체의 제자리 회전만으로/,
  );
  assert.match(data.records['CAM-105'].videoGuide.start, /고정/);
  assert.match(data.records['CAM-106'].videoGuide.change, /미세한 카메라 이동도 넣지/);
  assert.match(data.records['CAM-107'].videoGuide.change, /왼쪽/);
  assert.match(data.records['CAM-108'].videoGuide.change, /오른쪽/);
  assert.match(data.records['CAM-111'].videoGuide.change, /시계 방향/);
  assert.match(data.records['CAM-112'].videoGuide.change, /반시계 방향/);
});
