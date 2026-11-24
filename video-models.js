(() => {
  'use strict';
  const models = [
    {
      id: 'veo',
      label: 'Google Veo 3.1 Lite',
      note: '기존 한국어 완성형 예시를 그대로 보존했습니다. 실제 생성 결과를 검증한 프롬프트라는 뜻은 아닙니다.',
      url: 'https://deepmind.google/models/model-cards/veo-3-1-lite/',
    },
    {
      id: 'omni11',
      label: 'Google Flow Omni 1.1',
      note: '요청하신 모델명에 대한 전용 예시와 현재 기능 검증이 준비되지 않았습니다. Flow에서 실제 선택 가능한 모델명을 확인하세요.',
      url: 'https://support.google.com/flow/answer/16352836',
    },
    {
      id: 'omni12',
      label: 'Google Flow Omni 1.2',
      note: '공식 Flow 도움말은 Omni Flash 1.2로 안내합니다. 전용 프롬프트는 준비 중이며 Veo 예시를 이름만 바꿔 제공하지 않습니다.',
      url: 'https://support.google.com/flow/answer/16352836',
    },
    {
      id: 'seedance',
      label: 'Seedance',
      note: 'Seedance는 버전에 따라 참조·길이 등 기능이 다릅니다. 사용할 버전을 정한 전용 예시는 준비 중입니다.',
      url: 'https://seed.bytedance.com/en/',
    },
    {
      id: 'higgsfield',
      label: 'Higgsfield',
      note: 'Higgsfield는 여러 모델과 카메라 프리셋을 제공하는 플랫폼입니다. 선택한 모델과 프리셋을 확인해야 하며 전용 예시는 준비 중입니다.',
      url: 'https://higgsfield.ai/enterprise-help-center/platform/ai-models',
    },
    {
      id: 'common',
      label: '공통 영상 프롬프트',
      note: '기존 모델 비종속 영상 예시입니다. 모델·버전별 길이, 참조 입력, 카메라 제어 지원은 별도로 확인하세요.',
    },
  ];

  const dedicated = window.CINELIQ_MODEL_PROMPTS || {};
  const value = (id, model) =>
    model === 'veo'
      ? window.CINELIQ_FULL_LEARNING?.records[id]?.videoGuide?.veoKoreanPrompt
      : model === 'common'
        ? window.CINELIQ_PRODUCTION?.profiles[id]?.videoPrompt ||
          window.CINELIQ_LEARNING?.[id]?.videoPromptExample
        : dedicated[model]?.[id];
  const markup = (id, esc) =>
    `<section class="lesson-prompt video-model-prompt" data-video-model="${id}" aria-labelledby="video-model-heading"><h3 id="video-model-heading">AI 영상 생성 프롬프트</h3><label>생성 모델<select class="video-model-select" aria-label="AI 영상 생성 모델">${models.map((model) => `<option value="${model.id}">${esc(model.label)}</option>`).join('')}</select></label><div class="video-model-content" aria-live="polite"></div></section>`;
  function bind(root, esc, copyIcon, copy) {
    const section = root.querySelector('[data-video-model]');
    if (!section) return;
    const select = section.querySelector('select'),
      content = section.querySelector('.video-model-content'),
      id = section.dataset.videoModel;
    function paint() {
      const model = models.find((model) => model.id === select.value),
        text = value(id, model.id);
      content.innerHTML =
        `<p class="lesson-note">${esc(model.note)}${model.url ? ` <a href="${model.url}" target="_blank" rel="noopener noreferrer">공식 안내</a>` : ''}</p>` +
        (text
          ? `<div class="lesson-prompt-head"><p>${model.id === 'common' ? '공통 예시' : '모델 전용 예시 · 기존 내용 보존'}</p><button class="btn outline small" type="button" data-video-model-copy>${copyIcon} 전체 복사</button></div><p class="lesson-prompt-text">${esc(text)}</p>`
          : `<p>${model.id === 'veo' || model.id === 'common' ? '이 기법의 해당 영상 예시는 제공되지 않습니다. 이미지 중심 학습 내용을 확인해 주세요.' : '전용 프롬프트 준비 중입니다. 공통 영상 프롬프트를 선택하면 준비된 공통 예시를 확인할 수 있습니다.'}</p>`);
      content
        .querySelector('[data-video-model-copy]')
        ?.addEventListener('click', () => copy(text));
    }
    select.addEventListener('change', paint);
    paint();
  }
  window.CINELIQ_VIDEO_MODELS = { models, value, markup, bind };
})();
