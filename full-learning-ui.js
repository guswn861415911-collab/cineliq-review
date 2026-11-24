(() => {
  'use strict';
  window.CINELIQ_FULL_UI = ({ items, escape: esc, copyIcon }) => {
    const data = window.CINELIQ_FULL_LEARNING;
    if (!data) return { markup: () => '', copy: () => null };
    const p = (value) => `<p>${esc(value)}</p>`;
    const ul = (values) =>
      `<ul>${values.map((value) => `<li>${esc(value)}</li>`).join('')}</ul>`;
    const details = (title, body) =>
      `<details class="lesson-legacy practice-disclosure full-disclosure"><summary>${title}</summary>${body}</details>`;
    const facts = (rows) =>
      `<dl class="practice-facts">${rows
        .filter(([, value]) => value)
        .map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`)
        .join('')}</dl>`;
    const links = (ids) =>
      ids
        .filter((id) => items.has(id))
        .map(
          (id) =>
            `<button class="btn outline small" type="button" data-related-technique="${id}">${esc(items.get(id).ko)}</button>`,
        )
        .join('');
    const markup = (id) => {
      const record = data.records[id],
        item = items.get(id);
      if (!record || !item) return '';
      const image = record.imageGuide,
        video = record.videoGuide;
      const imageMarkup = details(
        record.imageApplicable
          ? '이미지 학습 · 촬영과 생성 점검'
          : '이미지 학습 · 시간 변화의 스토리보드',
        p(image.setup) +
          ul(image.visualChecks) +
          p(image.scene) +
          p(image.pitfall) +
          (!record.imageApplicable
            ? p(
                '이 항목의 핵심 변화는 정지 이미지 한 장으로 입증할 수 없습니다. 기존 이미지 예시는 단계 비교·스토리보드로 읽고 실제 동작은 영상에서 확인하세요.',
              )
            : '') +
          p(
            '기존 완성형 이미지 예시와 수정용 템플릿은 아래 프롬프트 영역에 보존되어 있습니다.',
          ),
      );
      if (!video)
        return `<div class="full-learning" data-full-learning="${id}">${imageMarkup}${details('영상 예시 검토', p(record.videoOmissionReason))}</div>`;
      const comparisons = data.comparisons.filter((pair) => pair.ids.includes(id));
      const videoMarkup = details(
        '영상 촬영 · 카메라·피사체·장비',
        facts([
          ['영어 명칭', item.en],
          ['한국어 명칭', item.ko],
          [video.readingKind, video.reading],
          [
            '검증된 약어',
            video.abbreviations.length
              ? video.abbreviations.join(' · ')
              : '대표 약어 미등록 · 전체 명칭으로 지시',
          ],
          ['별칭·다른 표기', video.aliases.join(' · ')],
          ['정의', video.definition],
          ['쉬운 설명', video.beginnerExplanation],
          ['구현 방식', video.control.label],
          ['카메라 동작', video.cameraAction],
          ['피사체 동작', video.subjectAction],
          ['이동·회전 방향', video.direction],
          ['속도·특징', video.speed],
          ['시작 구도', video.start],
          ['동작 변화', video.change],
          ['종료 구도', video.end],
          ['장비·실제 구현', video.control.equipment],
        ]) +
          `<h4>영상에서 확인할 기준</h4>` +
          ul(video.visualChecks) +
          `<h4>연출과 활용 장면</h4>` +
          p(
            video.effect +
              '을 의도할 수 있지만 연기·빛·소리·편집 맥락에 따라 인상이 달라집니다.',
          ) +
          ul(video.situations) +
          (video.limitation ? `<p class="lesson-note">${esc(video.limitation)}</p>` : ''),
      );
      const promptMarkup = details(
        'Veo 3.1 Lite · 한국어 완성형 영상 예시',
        `<p class="lesson-note">${esc(data.model.notice)} <a href="${data.model.sources[0]}" target="_blank" rel="noopener noreferrer">공식 모델 사양</a></p><div class="lesson-prompt-head"><p>기존 예시를 보존한 추가 학습 예시 · 빈칸 없음</p><button class="btn outline small" type="button" data-full-video-copy="${id}">${copyIcon} 전체 복사</button></div><p class="lesson-prompt-text">${esc(video.veoKoreanPrompt)}</p>`,
      );
      const editingMarkup = details(
        'AI 오류 점검 · 영상 편집 활용',
        `<h4>생성 단계에서 점검</h4>` +
          p(video.issues.problem) +
          ul(video.issues.check) +
          p(video.editing.generationFix) +
          `<h4>편집 단계에서 조절</h4>` +
          p(video.editing.use) +
          p(video.editing.rhythm) +
          p(video.editing.continuity) +
          p(video.editing.postFix) +
          `<h4>함께 연결할 기법</h4><div class="practice-links">${links(record.comparisonIds)}</div>` +
          ul(
            video.editing.connection.map(
              (row) => items.get(row.id).ko + ': ' + row.difference,
            ),
          ),
      );
      const comparisonMarkup = comparisons.length
        ? details(
            '혼동하기 쉬운 영상 기법 비교',
            comparisons
              .map(
                (pair) =>
                  `<h4>${pair.ids.map((key) => esc(items.get(key).ko)).join(' / ')}</h4>${facts(
                    [
                      ['공통점', pair.common],
                      ['결정적 차이·관찰', pair.difference],
                      ['AI 지시 주의', pair.ai],
                    ],
                  )}<div class="practice-links">${links(pair.ids.filter((key) => key !== id))}</div>`,
              )
              .join(''),
          )
        : '';
      return `<div class="full-learning" data-full-learning="${id}">${imageMarkup}${videoMarkup}${window.CINELIQ_VIDEO_MODELS ? '' : promptMarkup}${editingMarkup}${comparisonMarkup}</div>`;
    };
    return {
      markup,
      copy: (id) => data.records[id]?.videoGuide?.veoKoreanPrompt || null,
    };
  };
})();
