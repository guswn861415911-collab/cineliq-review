(() => {
  'use strict';
  window.CINELIQ_PRACTICE = ({ items, escape: esc, copyIcon }) => {
    const data = window.CINELIQ_PRODUCTION || {
      profiles: {},
      issues: {},
      comparisons: [],
    };
    const base = window.CINELIQ_TERMINOLOGY || { terms: [], sources: {}, categories: {} };
    const catalog = {
      ...base,
      categories: { ...base.categories, issues: 'AI 생성 오류 점검' },
      terms: [
        ...base.terms,
        ...Object.entries(data.issues).map(([id, issue]) => ({
          id: 'issue-' + id,
          type: 'issues',
          en: issue.en,
          ko: issue.ko,
          abbreviation: null,
          pronunciation: issue.en,
          aliases: [],
          meaning: issue.problem + ' ' + issue.situation,
          note: '프롬프트 점검: ' + issue.prompt + ' 재시도: ' + issue.retry,
          techniqueIds: [],
          sourceIds: [],
        })),
      ],
    };
    const terms = new Map(catalog.terms.map((term) => [term.id, term]));
    const normalize = (value) =>
      String(value || '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s\-‐‑–—.'’·/]+/g, '');
    const labels = (term) =>
      [term.en, term.ko, term.abbreviation, term.pronunciation, ...term.aliases].filter(
        Boolean,
      );
    const termText = new Map(
      catalog.terms.map((term) => [term.id, labels(term).map(normalize)]),
    );
    const shortAliases = new Set(
      catalog.terms.flatMap((term) =>
        [term.abbreviation, ...term.aliases]
          .filter((value) => value && /^[a-z.\-\d]{1,4}$/i.test(value))
          .map(normalize),
      ),
    );
    const techniqueTerms = new Map(
      [...items.keys()].map((id) => [
        id,
        catalog.terms.filter(
          (term) =>
            term.techniqueIds.includes(id) ||
            data.profiles[id]?.relatedTerms.includes(term.id),
        ),
      ]),
    );
    const originalIndex = new Map(
      [...items].map(([id, item]) => [
        id,
        normalize(
          [
            item.ko,
            item.originalKo,
            item.en,
            item.description,
            item.section,
            ...item.tags,
          ].join(' '),
        ),
      ]),
    );
    const termMatch = (term, q) =>
      termText
        .get(term.id)
        .some((label) => (shortAliases.has(q) ? label === q : label.includes(q)));
    const sourceLinks = (ids) =>
      ids
        .filter((id) => catalog.sources[id])
        .map(
          (id) =>
            `<a href="${esc(catalog.sources[id].url)}" target="_blank" rel="noopener noreferrer">${esc(catalog.sources[id].title)}</a>`,
        )
        .join(' · ');
    const techniqueLinks = (ids, detail = false) =>
      ids
        .filter((id) => items.has(id))
        .map(
          (id) =>
            `<button type="button" class="btn outline small" ${detail ? 'data-related-technique' : 'data-open'}="${id}">${esc(items.get(id).ko)}</button>`,
        )
        .join('');
    const paragraph = (value) => `<p>${esc(value)}</p>`;
    const list = (values) =>
      `<ul>${values.map((value) => `<li>${esc(value)}</li>`).join('')}</ul>`;
    const disclosure = (title, body, extra = '') =>
      `<details class="lesson-legacy practice-disclosure ${extra}"><summary>${title}</summary>${body}</details>`;
    const termCard = (term, detail = false) =>
      disclosure(
        `${esc(term.ko)} <small>${esc(term.en)}</small>${term.abbreviation ? ` <span class="practice-badge">${esc(term.abbreviation)}</span>` : ''}`,
        `<p class="practice-sources">${esc(catalog.categories[term.type])}</p>${paragraph(term.meaning)}${term.type === 'issues' ? '' : paragraph('발음: ' + term.pronunciation)}${paragraph(term.note)}${detail ? '' : `<div class="practice-links">${techniqueLinks(term.techniqueIds)}</div>`}${term.sourceIds.length ? `<p class="practice-sources">${sourceLinks(term.sourceIds)}</p>` : ''}`,
      );
    const profileTerm = (id) =>
      terms.get(data.profiles[id]?.termId) ||
      techniqueTerms
        .get(id)
        ?.find((term) => (term.primaryTechniqueIds || term.techniqueIds).includes(id));
    const badges = (id) =>
      (techniqueTerms.get(id) || [])
        .filter(
          (term) =>
            term.abbreviation &&
            (term.primaryTechniqueIds || term.techniqueIds).includes(id),
        )
        .map(
          (term) =>
            `<span class="practice-badge" title="${esc(term.en)}">${esc(term.abbreviation)}</span>`,
        )
        .join(' ');
    const termMarkup = (id) => {
      const term = profileTerm(id);
      if (!term) return '';
      const profile = data.profiles[id],
        item = items.get(id);
      return disclosure(
        '실무 용어와 현장 표현',
        `<dl class="practice-facts"><div><dt>영어 명칭</dt><dd>${esc(item.en)}</dd></div><div><dt>한국어 명칭</dt><dd>${esc(item.ko)}${term.ko !== item.ko ? ' / ' + esc(term.ko) : ''}</dd></div><div><dt>대표 약어</dt><dd>${term.abbreviation ? `${esc(term.abbreviation)} · ${esc(term.pronunciation)}` : '검증된 대표 약어 미등록 · 전체 명칭 사용'}</dd></div>${profile ? `<div><dt>영문명 발음</dt><dd>${esc(profile.pronunciation)}</dd></div>` : ''}${term.aliases.length ? `<div><dt>다른 표기·검색어</dt><dd>${esc(term.aliases.join(' · '))}</dd></div>` : ''}</dl>${paragraph(term.meaning)}${profile ? `<h4>촬영 현장에서</h4>${paragraph(profile.onSetExample)}<h4>AI 제작 대화</h4>${paragraph(profile.aiProductionExample)}` : ''}<p class="lesson-note">${esc(term.note)}</p><p class="practice-sources">${sourceLinks(term.sourceIds)}</p>`,
      );
    };
    const prompt = (id, kind, value) =>
      `<div class="practice-prompt"><div class="lesson-prompt-head"><h4>실무 시나리오 · 완성형 ${kind === 'image' ? '이미지' : '영상'} 프롬프트</h4><button type="button" class="btn outline small" data-practice-copy="${kind}" data-practice-id="${id}">${copyIcon} 전체 복사</button></div><p class="lesson-prompt-text">${esc(value)}</p></div>`;
    const guideMarkup = (id) => {
      const profile = data.profiles[id];
      if (!profile) return '';
      const issueMarkup = Object.entries(profile.issueContexts)
        .map(([key, context]) => {
          const issue = data.issues[key];
          if (!issue) return '';
          return disclosure(
            `${esc(issue.en)} · ${esc(issue.ko)}`,
            paragraph(issue.problem) +
              paragraph(issue.situation) +
              `<p><strong>이 기법에서:</strong> ${esc(context)}</p><p><strong>프롬프트 점검:</strong> ${esc(issue.prompt)}</p><p><strong>재생성할 때:</strong> ${esc(issue.retry)}</p>`,
            'practice-issue',
          );
        })
        .join('');
      return `<div class="practice-guides" aria-label="실무 제작과 편집 가이드">${disclosure('AI 이미지 제작 가이드', list(profile.imageGenerationGuide) + prompt(id, 'image', profile.imagePrompt))}${disclosure('AI 영상 제작 가이드', list(profile.videoGenerationGuide) + prompt(id, 'video', profile.videoPrompt) + `<h4>생성 오류 점검과 재시도</h4>${issueMarkup}<p class="lesson-note">이 항목들은 제작 시 확인할 증상과 재시도 방법입니다. 모든 모델에서 같은 기능이나 개선 결과를 보장하지 않습니다. 참조·길이·카메라 제어는 사용하는 모델의 지원을 확인하세요.</p>`)}${disclosure('영상 편집 활용 가이드', paragraph(profile.editingUsage) + `<h4>추천 컷 연결</h4><div class="practice-links practice-sequence">${techniqueLinks(profile.editingSequence, true)}</div>` + list(profile.editingTips) + `<h4>편집 예시</h4>` + paragraph(profile.editingExample))}${disclosure('함께 익힐 전문 용어', profile.relatedTerms.map((key) => (terms.get(key) ? termCard(terms.get(key), true) : '')).join(''))}</div>`;
    };
    const comparisons = (id) =>
      data.comparisons
        .filter(
          (pair) => pair.ids.includes(id) && pair.ids.every((key) => items.has(key)),
        )
        .map((pair) => {
          const target = pair.ids.find((key) => key !== id);
          return disclosure(
            `${esc(items.get(id).ko)} ↔ ${esc(items.get(target).ko)}`,
            `<dl class="practice-facts">${[
              ['공통점', 'common'],
              ['화면에서 구별하기', 'visual'],
              ['목적의 차이', 'purpose'],
              ['AI 이미지 지시', 'image'],
              ['AI 영상 지시', 'video'],
              ['편집에서의 활용', 'editing'],
            ]
              .map(
                ([label, key]) =>
                  `<div><dt>${label}</dt><dd>${esc(pair[key])}</dd></div>`,
              )
              .join(
                '',
              )}</dl><button class="btn outline small" type="button" data-related-technique="${target}">${esc(items.get(target).ko)} 상세 보기 ↗</button>`,
          );
        })
        .join('');
    let lastQuery = null;
    const matchingTerms = (query) => {
      const q = normalize(query);
      return q ? catalog.terms.filter((term) => termMatch(term, q)) : catalog.terms;
    };
    return {
      normalize,
      badges,
      termMarkup,
      guideMarkup,
      comparisons,
      termCard,
      matches: (item, query) => {
        const q = normalize(query);
        if (!q) return true;
        const termHit = (techniqueTerms.get(item.id) || []).some((term) =>
          termMatch(term, q),
        );
        return (
          termHit || (!shortAliases.has(q) && originalIndex.get(item.id).includes(q))
        );
      },
      matchingTerms,
      copy: (id, kind) =>
        data.profiles[id]?.[kind === 'video' ? 'videoPrompt' : 'imagePrompt'],
      renderSearch: (query, container) => {
        if (!container) return 0;
        const q = normalize(query),
          matches = matchingTerms(query);
        if (q !== lastQuery) {
          container.hidden = !!q && !matches.length;
          container.open = !!q && matches.length > 0;
          container.querySelector('summary').textContent = q
            ? `실무 용어 검색 · ${matches.length}개`
            : `실무 용어집 · ${catalog.terms.length}개`;
          container.querySelector('.practice-term-results').innerHTML = matches
            .map((term) => termCard(term))
            .join('');
          lastQuery = q;
        }
        return q ? matches.length : 0;
      },
    };
  };
})();
