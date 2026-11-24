(() => {
  'use strict';
  window.CINELIQ_LESSON = ({
    item,
    items,
    escape,
    media,
    copyIcon,
    practice,
    fullLearning,
  }) => {
    const lesson = window.CINELIQ_LEARNING?.[item.id];
    if (!lesson) return '';
    const paragraph = (text) => `<p>${escape(text)}</p>`;
    const known = Object.values(lesson)
      .filter((value) => typeof value === 'string')
      .join(' ')
      .replace(/\s+/g, '');
    const uniqueDefinition = String(item.description || '')
      .split(/(?<=[.!?。])\s+/)
      .filter((sentence) => !known.includes(sentence.replace(/\s+/g, '')))
      .join(' ');
    const list = (rows) =>
      `<ul>${rows.map((text) => `<li>${escape(text)}</li>`).join('')}</ul>`;
    const section = (number, title, body) =>
      `<section class="lesson-section" aria-labelledby="lesson-${item.id}-${number}"><h3 id="lesson-${item.id}-${number}"><span>${number}.</span> ${title}</h3>${body}</section>`;
    const related = lesson.relatedTechniqueIds.filter(
      (id) => id !== item.id && items.has(id),
    );
    const prompt = (kind, title, value) =>
      value
        ? `<section class="lesson-prompt" aria-label="${title}"><div class="lesson-prompt-head"><div><h3>${title}</h3><p>완성형 예시 · 그대로 복사하여 사용</p></div><button class="btn outline small" type="button" data-lesson-copy="${kind}">${copyIcon} 전체 복사</button></div>${kind === 'image' && lesson.imagePromptMode === 'storyboard' ? '<p class="lesson-note">시간 변화·움직임은 정지 이미지 한 장으로 검증할 수 없어, 이미지 예시는 시작·중간·끝의 비교 스토리보드로 작성했습니다. 실제 움직임과 소리의 연결은 영상 예시를 확인해 주세요.</p>' : ''}<p class="lesson-prompt-text">${escape(value)}</p></section>`
        : '';
    return `<div class="lesson-content">
      ${practice?.termMarkup(item.id) || ''}
      ${section('01', '한눈에 이해하기', paragraph(lesson.beginnerExplanation) + (uniqueDefinition ? `<div class="lesson-definition"><h4>정의와 구별점</h4>${paragraph(uniqueDefinition)}</div>` : ''))}
      ${section('02', '촬영·제작 방법', paragraph(lesson.shootingMethod))}
      ${section('03', '시각적 특징', paragraph('대표 예시를 볼 때 다음 기준을 확인해 보세요. 실제 업로드 자료가 모든 기준을 충족하는지는 별도 확인이 필요합니다.') + list(lesson.visualCharacteristics))}
      ${section('04', '감정과 연출 효과', paragraph(lesson.directingEffects) + paragraph('이 효과는 고정된 결과가 아닙니다. 같은 기법도 인물의 연기, 빛, 소리와 앞뒤 편집에 따라 다른 인상을 줄 수 있습니다.'))}
      ${section('05', '실전 활용 예시', `<ol class="lesson-examples">${lesson.practicalExamples.map((text) => `<li>${escape(text)}</li>`).join('')}</ol>`)}
      ${section('06', '촬영 팁과 주의사항', paragraph(lesson.shootingTips))}
      ${section('07', '초보자가 자주 헷갈리는 부분', paragraph(lesson.commonMistakes) + (lesson.terminologyNotes ? `<div class="lesson-note">${escape(lesson.terminologyNotes)}</div>` : ''))}
      ${practice?.guideMarkup(item.id) || ''}
      ${fullLearning?.markup(item.id) || ''}
      <div class="lesson-prompts">${prompt('image', 'AI 이미지 프롬프트', lesson.imagePromptExample)}${window.CINELIQ_VIDEO_MODELS?.markup(item.id, escape) || prompt('video', 'AI 영상 프롬프트', lesson.videoPromptExample)}${!lesson.videoPromptExample && !window.CINELIQ_PRODUCTION?.profiles[item.id]?.videoPrompt && !window.CINELIQ_FULL_LEARNING?.records[item.id]?.videoGuide ? '<p class="lesson-note">이 항목은 이미지의 배치·광학 특성·미술 표현을 중심으로 안내합니다. 핵심을 바꾸는 불필요한 영상 움직임은 추가하지 않았습니다.</p>' : ''}<p class="lesson-note">생성 모델마다 지시를 따르는 정도가 다릅니다. 결과에서 위 관찰 기준을 확인하고, 실제 장비로 촬영한 자료나 사실 검증 결과로 오인하지 마세요.</p></div>
      <section class="lesson-section lesson-related" aria-labelledby="related-${item.id}"><h3 id="related-${item.id}">비슷한 촬영 기법 비교하기</h3><div class="lesson-related-grid">${related
        .map((id) => {
          const target = items.get(id);
          return `<button class="lesson-related-card" type="button" data-related-technique="${id}" aria-label="${escape(target.ko)} 상세 보기"><span class="lesson-related-media">${media(target)}</span><strong>${escape(target.ko)}</strong><small>${escape(target.en)}</small><span class="lesson-related-difference">${escape(lesson.relatedTechniqueDifferences[id])}</span><span class="lesson-related-open">상세 보기 <span aria-hidden="true">↗</span></span></button>`;
        })
        .join('')}</div>${practice?.comparisons(item.id) || ''}</section>
    </div>`;
  };
})();
