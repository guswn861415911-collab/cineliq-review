const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const window = {};
for (const file of ['data.js', 'learning-data.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    window,
  });
}
test('all existing techniques have usable lessons, complete prompts and valid comparison targets', () => {
  const items = window.CAMERA_TECHNIQUES;
  const lessons = window.CINELIQ_LEARNING;
  const ids = new Set(items.map((item) => item.id));
  assert.equal(Object.keys(lessons).length, items.length);
  const imagePrompts = new Set();
  let videos = 0;
  for (const item of items) {
    const lesson = lessons[item.id];
    assert.ok(lesson, item.id);
    for (const key of [
      'beginnerExplanation',
      'shootingMethod',
      'directingEffects',
      'shootingTips',
      'commonMistakes',
    ]) {
      assert.ok(lesson[key]?.trim(), `${item.id}: ${key}`);
    }
    assert.ok(lesson.visualCharacteristics.length >= 3, item.id);
    assert.ok(lesson.practicalExamples.length >= 2, item.id);
    assert.ok(
      lesson.relatedTechniqueIds.length >= 2 && lesson.relatedTechniqueIds.length <= 4,
      item.id,
    );
    assert.equal(
      new Set(lesson.relatedTechniqueIds).size,
      lesson.relatedTechniqueIds.length,
      item.id,
    );
    for (const id of lesson.relatedTechniqueIds) {
      assert.ok(ids.has(id) && id !== item.id, `${item.id}: ${id}`);
      assert.ok(lesson.relatedTechniqueDifferences[id]?.trim(), `${item.id}: ${id}`);
    }
    for (const value of [lesson.imagePromptExample, lesson.videoPromptExample].filter(
      Boolean,
    )) {
      assert.ok(value.length > 150, item.id);
      assert.doesNotMatch(value, /\[[^\]]+\]|undefined|\*\*|^#{1,6}\s/m, item.id);
    }
    assert.ok(lesson.imagePromptExample, item.id);
    imagePrompts.add(lesson.imagePromptExample);
    if (item.mediaType === 'video') assert.ok(lesson.videoPromptExample, item.id);
    if (lesson.videoPromptExample) {
      videos++;
      for (const phase of ['0~2초:', '2~6초:', '6~8초:'])
        assert.ok(lesson.videoPromptExample.includes(phase), item.id);
      assert.notEqual(lesson.videoPromptExample, lesson.imagePromptExample, item.id);
    }
  }
  assert.equal(imagePrompts.size, items.length);
  assert.equal(videos, 218);
});
