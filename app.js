(() => {
  'use strict';

  const APP_SETTINGS = {
    DB_NAME: 'frame-camera-atlas-v1',
    DB_STORE: 'media',
    PAGE_SIZE: 24,
  };
  const techniques = window.CAMERA_TECHNIQUES || [];
  const mediaCloud = window.CINELIQ_CLOUD;
  const techniquesById = new Map(techniques.map((item) => [item.id, item]));
  const mainCategories = [
    {
      id: 'all',
      name: '전체 기법',
      icon: '▦',
    },
    {
      id: 'composition',
      name: '카메라 구도',
      icon: '▧',
    },
    {
      id: 'cut',
      name: '카메라 컷',
      icon: '◫',
    },
    {
      id: 'movement',
      name: '카메라 무빙',
      icon: '↗',
    },
    {
      id: 'effects',
      name: '시각 효과',
      icon: '✧',
    },
    {
      id: 'lighting',
      name: '조명',
      icon: '☼',
    },
    {
      id: 'styles',
      name: '아트 스타일',
      icon: '◇',
    },
    {
      id: 'post',
      name: '영상·후반',
      icon: '▷',
    },
  ];
  const sceneTags = ['인물', '풍경', '제품·디테일', '드라마', '역동적 연출', '기본 연출'];
  const libraryState = {
    major: 'all',
    section: 0,
    tags: new Set(),
    media: 'all',
    types: new Set(),
    sort: 'number',
    search: '',
    limit: APP_SETTINGS.PAGE_SIZE,
    admin: false,
    open: null,
    mediaMap: new Map(),
    legacy: new Map(),
  };
  const findElement = (selector) => document.querySelector(selector);
  const escapeHtml = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );
  const getCategoryName = (id) => mainCategories.find((x) => x.id === id)?.name || '기타';
  let toastTimer;
  function showMessage(message) {
    const element = findElement('#toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('show'), 2500);
  }
  let cleanupDetail = () => {};
  let catalogRequest = 0;
  const mediaManager = window.CINELIQ_ADMIN({
    state: libraryState,
    items: techniquesById,
    escape: escapeHtml,
    notify: showMessage,
    refresh: refreshOnlineMedia,
    updateDetail,
  });
  const memberControls = window.CINELIQ_MEMBER({
    items: techniquesById,
    navigate: (view) => navigateView(view),
    notify: showMessage,
    escape: escapeHtml,
    thumbnail: (item) => renderTechniqueMedia(item),
  });
  function readLegacy() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(APP_SETTINGS.DB_NAME, 1);
      request.onupgradeneeded = () => request.transaction.abort();
      request.onerror = () => {
        if (request.error?.name === 'AbortError') resolve([]);
        else reject(request.error);
      };
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(APP_SETTINGS.DB_STORE)) {
          database.close();
          resolve([]);
          return;
        }
        const transaction = database.transaction(APP_SETTINGS.DB_STORE, 'readonly');
        const records = transaction.objectStore(APP_SETTINGS.DB_STORE).getAll();
        records.onsuccess = () => resolve(records.result);
        records.onerror = () => reject(records.error);
        database.close();
      };
    });
  }
  async function refreshOnlineMedia() {
    const request = ++catalogRequest;
    try {
      const catalog = await mediaCloud.catalog(libraryState.admin, libraryState.mediaMap);
      if (request !== catalogRequest) return false;
      const previousMedia = libraryState.mediaMap;
      libraryState.mediaMap = new Map(
        [...catalog].filter(([id]) => techniquesById.has(id)),
      );
      renderCards(previousMedia);
      memberControls.refreshMedia();
      return true;
    } catch (error) {
      if (request === catalogRequest) {
        console.warn('CINELIQ online catalog:', error);
        showMessage('온라인 미디어를 불러오지 못했어요. 잠시 후 새로고침해 주세요.');
      }
      return false;
    }
  }
  async function initializeMedia() {
    const previousMedia = new Map(libraryState.mediaMap);
    try {
      const records = await readLegacy();
      for (const record of records) {
        const item = techniquesById.get(record.id);
        if (!item || !(record.blob instanceof Blob)) continue;
        const url = URL.createObjectURL(record.blob);
        libraryState.legacy.set(record.id, {
          ...record,
          url,
        });
        if (!mediaCloud.configured) {
          libraryState.mediaMap.set(record.id, [
            {
              kind: item.mediaType,
              url,
              is_primary: true,
            },
          ]);
        }
      }
    } catch (error) {
      console.warn('CINELIQ legacy IndexedDB:', error);
    }
    if (!mediaCloud.configured) {
      renderCards(previousMedia);
      updateDetail();
      return;
    }
    try {
      await mediaCloud.connect();
      void memberControls
        .start()
        .catch((error) => console.warn('CINELIQ member session:', error));
      await refreshOnlineMedia();
      await mediaManager.start();
      updateDetail();
      window.addEventListener('focus', () => {
        const expired = [...libraryState.mediaMap.values()].some((rows) =>
          rows.some((row) => row.expiresAt <= Date.now() + 5 * 60 * 1000),
        );
        if (expired) void refreshOnlineMedia();
      });
    } catch (error) {
      console.warn('CINELIQ Supabase connection:', error);
      showMessage('온라인 저장소에 연결하지 못했어요.');
    }
  }
  function refreshCounts() {
    findElement('#totalCount').textContent = techniques.length;
    findElement('#readyCount').textContent = libraryState.mediaMap.size;
    const collections = findElement('#collectionCount');
    if (collections)
      collections.textContent = new Set(techniques.map((x) => x.sectionNo)).size;
  }
  function renderNav() {
    const counts = Object.fromEntries(
      mainCategories.map((x) => [
        x.id,
        x.id === 'all'
          ? techniques.length
          : techniques.filter((technique) => technique.major === x.id).length,
      ]),
    );
    findElement('#majorNav').innerHTML = mainCategories
      .map(
        (x) =>
          `<button class="nav-btn ${libraryState.major === x.id ? 'active' : ''}" data-major="${x.id}" aria-pressed="${libraryState.major === x.id}"><span class="nav-icon">${x.icon}</span>${x.name}<span class="nav-count">${counts[x.id]}</span></button>`,
      )
      .join('');
    const sections = [
      ...new Map(
        techniques
          .filter(
            (technique) =>
              libraryState.major === 'all' || technique.major === libraryState.major,
          )
          .map((technique) => [
            technique.sectionNo,
            {
              id: technique.sectionNo,
              name: technique.section,
            },
          ]),
      ).values(),
    ];
    findElement('#sectionNav').innerHTML =
      `<button class="section-btn ${libraryState.section === 0 ? 'active' : ''}" data-section="0"><span class="sec-no">—</span>모든 세부 분야</button>` +
      sections
        .map(
          (s) =>
            `<button class="section-btn ${libraryState.section === s.id ? 'active' : ''}" data-section="${s.id}"><span class="sec-no">${String(s.id).padStart(2, '0')}</span>${escapeHtml(s.name)}</button>`,
        )
        .join('');
  }
  function renderMobileFilters() {
    const tagRoot = findElement('#mobileTagFilters'),
      mediaRoot = findElement('#mobileMediaFilters');
    if (!tagRoot || !mediaRoot) return;
    tagRoot.innerHTML =
      `<button class="mobile-filter-chip ${libraryState.tags.size === 0 ? 'active' : ''}" data-tag="all">전체</button>` +
      sceneTags
        .map(
          (tagName) =>
            `<button class="mobile-filter-chip ${libraryState.tags.has(tagName) ? 'active' : ''}" data-tag="${escapeHtml(tagName)}">${escapeHtml(tagName)}</button>`,
        )
        .join('');
    mediaRoot.innerHTML = [
      ['image', '이미지 기법'],
      ['video', '영상 기법'],
    ]
      .map(
        ([v, n]) =>
          `<button class="mobile-filter-chip ${libraryState.types.has(v) ? 'active' : ''}" aria-pressed="${libraryState.types.has(v)}" data-type="${v}">${n}</button>`,
      )
      .join('');
  }
  function renderTags() {
    if (!libraryState.admin) libraryState.media = 'all';
    const mediaSort = findElement('#sortSelect option[value=media]');
    mediaSort.hidden = !libraryState.admin;
    mediaSort.disabled = !libraryState.admin;
    if (!libraryState.admin && libraryState.sort === 'media') {
      libraryState.sort = 'number';
      findElement('#sortSelect').value = 'number';
    }
    document.querySelectorAll('[data-type]').forEach((button) => {
      button.classList.toggle('active', libraryState.types.has(button.dataset.type));
      button.setAttribute(
        'aria-pressed',
        String(libraryState.types.has(button.dataset.type)),
      );
    });
    document
      .querySelectorAll('[data-registration-group]')
      .forEach((element) => (element.hidden = !libraryState.admin));
    findElement('#tagFilters').innerHTML =
      `<button class="chip ${libraryState.tags.size === 0 ? 'active' : ''}" data-tag="all">전체</button>` +
      sceneTags
        .map(
          (tagName) =>
            `<button class="chip ${libraryState.tags.has(tagName) ? 'active' : ''}" data-tag="${escapeHtml(tagName)}">${escapeHtml(tagName)}</button>`,
        )
        .join('');
    document
      .querySelectorAll('[data-media]')
      .forEach((button) =>
        button.classList.toggle('active', button.dataset.media === libraryState.media),
      );
    document
      .querySelectorAll('.admin-media-filter')
      .forEach((button) => (button.hidden = !libraryState.admin));
    renderMobileFilters();
  }

  function matchesTechniqueSearch(technique, searchQuery) {
    if (!searchQuery) return true;
    if (practiceGuide) return practiceGuide.matches(technique, searchQuery);
    const searchableText = [
      technique.ko,
      technique.en,
      technique.description,
      technique.section,
      ...technique.tags,
    ]
      .join(' ')
      .toLocaleLowerCase();
    return searchableText.includes(searchQuery);
  }

  function matchesLibraryFilters(technique, searchQuery) {
    if (libraryState.major !== 'all' && technique.major !== libraryState.major)
      return false;
    if (libraryState.section && technique.sectionNo !== libraryState.section)
      return false;
    if (libraryState.tags.size > 0) {
      const hasSelectedTag = Array.from(libraryState.tags).some((tagName) =>
        technique.tags.includes(tagName),
      );
      if (!hasSelectedTag) return false;
    }
    if (libraryState.admin) {
      const hasRegisteredMedia = libraryState.mediaMap.has(technique.id);
      if (libraryState.media === 'ready' && !hasRegisteredMedia) return false;
      if (libraryState.media === 'missing' && hasRegisteredMedia) return false;
    }
    if (!window.CINELIQ_CONTENT_TYPES.matches(technique, libraryState.types))
      return false;
    return matchesTechniqueSearch(technique, searchQuery);
  }

  function getFilteredTechniques() {
    const searchQuery = libraryState.search.toLocaleLowerCase().trim();
    const matchingTechniques = techniques.filter((technique) =>
      matchesLibraryFilters(technique, searchQuery),
    );
    const sort = libraryState.sort;
    if (sort === 'az')
      matchingTechniques.sort((firstTechnique, secondTechnique) =>
        firstTechnique.en.localeCompare(secondTechnique.en, 'en'),
      );
    else if (sort === 'za')
      matchingTechniques.sort((firstTechnique, secondTechnique) =>
        secondTechnique.en.localeCompare(firstTechnique.en, 'en'),
      );
    else if (sort === 'ko')
      matchingTechniques.sort((firstTechnique, secondTechnique) =>
        firstTechnique.ko.localeCompare(secondTechnique.ko, 'ko'),
      );
    else if (sort === 'media')
      matchingTechniques.sort(
        (firstTechnique, secondTechnique) =>
          Number(libraryState.mediaMap.has(secondTechnique.id)) -
            Number(libraryState.mediaMap.has(firstTechnique.id)) ||
          firstTechnique.number - secondTechnique.number,
      );
    return matchingTechniques;
  }
  function renderMediaElement(item, row, detail) {
    const source = detail ? row.url : row.thumbnail || row.url;
    if (row.kind === 'video') {
      const tracks = Array.isArray(row.tracks)
        ? row.tracks
            .filter(
              (track) =>
                ['captions', 'subtitles'].includes(track.kind) &&
                /^https:\/\//.test(track.src),
            )
            .map(
              (track) =>
                `<track kind="${track.kind}" src="${escapeHtml(track.src)}" srclang="${escapeHtml(track.language || 'ko')}" label="${escapeHtml(track.label || '자막')}">`,
            )
            .join('')
        : '';
      return `<video src="${escapeHtml(source)}" aria-label="${escapeHtml(item.ko)} 영상 예시" ${detail ? `controls playsinline preload="metadata" aria-describedby="motion-${item.id}"` : 'muted playsinline preload="metadata"'}>${tracks}</video>`;
    }
    return `<img src="${escapeHtml(source)}" alt="${escapeHtml(item.ko + ': ' + String(item.summary || getCardSummary(item)).slice(0, 200))}" loading="lazy">`;
  }
  function renderTechniqueMedia(
    technique,
    detail = false,
    catalog = libraryState.mediaMap,
  ) {
    const rows = (catalog.get(technique.id) || []).filter((row) => row.url);
    const primary = rows.find((row) => row.is_primary) || rows[0];
    if (primary) {
      if (detail) {
        const ordered = [primary, ...rows.filter((row) => row !== primary)];
        const images = ordered.filter((row) => row.kind !== 'video');
        let imagesShown = false;
        const gallery = ordered
          .map((row) => {
            if (row.kind !== 'video' && images.length > 1) {
              if (imagesShown) return '';
              imagesShown = true;
              return window.CINELIQ_IMAGE_CAROUSEL.markup(
                technique,
                images,
                renderMediaElement,
                escapeHtml,
              );
            }
            return `<div class="detail-media">${renderMediaElement(technique, row, true)}</div>`;
          })
          .join('');
        const guide = window.CINELIQ_FULL_LEARNING?.records[technique.id]?.videoGuide;
        return `<div class="media-gallery">${gallery}</div><p class="media-motion-description" id="motion-${technique.id}">${escapeHtml(guide ? '영상 관찰 기준: 카메라 ' + guide.cameraAction + ' 피사체 ' + guide.subjectAction + ' ' + (guide.direction || '') : technique.summary || getCardSummary(technique))} · 실제 업로드 영상이 이 기준을 충족하는지는 별도 확인이 필요합니다.</p>`;
      }
      return `<div class="card-media">${renderMediaElement(technique, primary, false)}</div>`;
    }
    if (detail)
      return `<div class="detail-media empty"><div class="placeholder-inner"><span class="placeholder-icon">${technique.mediaType === 'video' ? '▷' : '▧'}</span><strong>아직 ${technique.mediaType === 'video' ? '영상' : '이미지'}이 등록되지 않았어요</strong><p>기법 설명과 프롬프트를 먼저 학습해 보세요.<br>등록된 자료는 이곳에 표시됩니다.</p></div></div>`;
    return `<div class="card-media empty"><span class="media-indicator">${technique.mediaType === 'video' ? 'MOTION STUDY' : 'FRAME STUDY'}</span><span class="media-placeholder-label">VISUAL REFERENCE</span></div>`;
  }
  function getCardSummary(technique) {
    if (technique.summary) return technique.summary;
    const full = String(technique.description || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!full) return '';
    const sentence = full.match(/^.+?[.!?。](?=\s|$)/);
    const first = sentence ? sentence[0] : full;
    const max = 76;
    if (first.length <= max) return first;
    const slice = first.slice(0, max);
    const lastSpace = slice.lastIndexOf(' ');
    return (
      (lastSpace > max * 0.65 ? slice.slice(0, lastSpace) : slice).replace(
        /[\s,，;；]+$/,
        '',
      ) + '…'
    );
  }
  const copyIcon = `<svg class="copy-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3.5" y="8.5" width="12" height="12" rx="3"/><path d="M8.5 8.5V6.5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-2"/></svg>`;
  const practiceGuide = window.CINELIQ_PRACTICE?.({
    items: techniquesById,
    escape: escapeHtml,
    copyIcon,
  });
  window.CINELIQ_GLOSSARY({
    practice: practiceGuide,
  });
  const fullLearningGuide = window.CINELIQ_FULL_UI?.({
    items: techniquesById,
    escape: escapeHtml,
    copyIcon,
  });
  function renderTechniqueCard(technique) {
    return `<article class="tech-card" data-open="${technique.id}"${libraryState.open === technique.id ? ' data-selected' : ''} aria-label="${escapeHtml(technique.ko)}">${renderTechniqueMedia(technique)}<div class="card-content"><div class="card-section">${escapeHtml(technique.section)} · ${getCategoryName(technique.major)}</div><div class="card-title-row"><h3 class="card-title"><button class="card-title-open" type="button" data-open="${technique.id}" aria-label="${escapeHtml(technique.ko)} 상세 보기">${escapeHtml(technique.ko)}</button></h3><button class="copy-icon-btn" type="button" data-copy="${technique.id}" aria-label="${escapeHtml(technique.en)} 영문 명칭 복사" title="영문 명칭 복사">${copyIcon}</button></div><div class="card-en">${escapeHtml(technique.displaySubtitle || technique.en)}</div><p class="card-description">${escapeHtml(getCardSummary(technique))}</p><div class="card-actions">${memberControls.favoriteButton(technique.id)}<span class="open-link">기법 살펴보기 <span aria-hidden="true">↗</span></span></div></div></article>`;
  }
  let revealObserver = null;
  let scrollObserver = null;
  function observeReveals() {
    const cards = [...document.querySelectorAll('.tech-card:not(.is-visible)')];
    if (
      !('IntersectionObserver' in window) ||
      window.CINELIQ_A11Y?.reducedMotion() ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      cards.forEach((element) => element.classList.add('is-visible'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort(
              (firstTechnique, secondTechnique) =>
                firstTechnique.boundingClientRect.top -
                  secondTechnique.boundingClientRect.top ||
                firstTechnique.boundingClientRect.left -
                  secondTechnique.boundingClientRect.left,
            );
          visible.forEach((entry) => {
            const element = entry.target;
            element.style.setProperty(
              '--reveal-delay',
              `${Math.min(Number(element.dataset.revealOrder || 0) % 3, 2) * 85}ms`,
            );
            element.classList.add('is-visible');
            revealObserver.unobserve(element);
          });
        },
        {
          threshold: 0.08,
          rootMargin: '0px 0px 35px 0px',
        },
      );
    }
    cards.forEach((element, index) => {
      element.dataset.revealOrder = index;
      revealObserver.observe(element);
    });
  }
  function renderCards(previousMedia) {
    renderTags();
    const arr = getFilteredTechniques(),
      shown = arr.slice(0, libraryState.limit);
    findElement('#visibleCount').textContent = arr.length;
    findElement('#resultSummary').textContent = libraryState.admin
      ? `${arr.length}개 기법 중 ${shown.length}개 표시 · 등록된 미디어 ${libraryState.mediaMap.size}개`
      : `${arr.length}개 기법 중 ${shown.length}개 표시`;
    const grid = findElement('#cardGrid');
    const ids = shown.map((technique) => technique.id);
    const old = [...grid.children].map((element) => element.dataset.open);
    const appendOnly =
      old.length > 0 && old.length <= ids.length && old.every((id, j) => id === ids[j]);
    if (appendOnly) {
      if (previousMedia) {
        shown.slice(0, old.length).forEach((item, index) => {
          const nextMedia = renderTechniqueMedia(item);
          if (nextMedia !== renderTechniqueMedia(item, false, previousMedia)) {
            grid.children[index].querySelector('.card-media').outerHTML = nextMedia;
          }
        });
      }
      grid.insertAdjacentHTML(
        'beforeend',
        shown.slice(old.length).map(renderTechniqueCard).join(''),
      );
    } else {
      revealObserver?.disconnect();
      grid.innerHTML = shown.map(renderTechniqueCard).join('');
    }
    const termCount = libraryState.search.trim()
      ? practiceGuide.matchingTerms(libraryState.search).length
      : 0;
    const termLink = findElement('#termSearchLink');
    termLink.hidden = !termCount;
    termLink.innerHTML = termCount
      ? `<a href="#glossary?q=${encodeURIComponent(libraryState.search)}">관련 실무 용어 ${termCount}개 보기 ↗</a>`
      : '';
    findElement('#emptyState').hidden = arr.length !== 0 || termCount > 0;
    findElement('#loadMore').hidden = true;
    findElement('#scrollSentinel').hidden = arr.length <= libraryState.limit;
    observeReveals();
    refreshCounts();
  }
  function setupInfiniteScroll() {
    const sentinel = findElement('#scrollSentinel');
    if (!('IntersectionObserver' in window)) {
      findElement('#loadMore').hidden = false;
      return;
    }
    scrollObserver = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || sentinel.hidden) return;
        if (document.querySelector('#detailModal:not([hidden])')) return;
        const total = getFilteredTechniques().length;
        if (libraryState.limit >= total) return;
        libraryState.limit = Math.min(libraryState.limit + APP_SETTINGS.PAGE_SIZE, total);
        renderCards();
      },
      {
        rootMargin: '0px 0px 650px 0px',
        threshold: 0,
      },
    );
    scrollObserver.observe(sentinel);
  }
  function copyText(s) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(s)
        .then(() => showMessage('클립보드에 복사했어요'))
        .catch(() => fallbackCopy(s));
    } else fallbackCopy(s);
  }
  function fallbackCopy(s) {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showMessage('클립보드에 복사했어요');
    } catch {
      showMessage('복사할 수 없어요. 텍스트를 선택해 주세요.');
    }
    ta.remove();
  }
  function makePrompt(technique) {
    const isMotion = technique.mediaType === 'video';
    const style =
      technique.major === 'styles'
        ? '해당 아트 스타일의 재질, 캐릭터 비율, 윤곽과 렌더링 특성을 정확하게 표현합니다.'
        : technique.major === 'effects'
          ? '해당 광학·색감 효과를 실제 사진처럼 명확히 보여주고 다른 효과와 혼동되지 않도록 표현합니다.'
          : technique.major === 'lighting'
            ? '광원의 방향과 그림자 형태를 정확하게 표현하고 자연스러운 빛의 물리적 특성을 유지합니다.'
            : technique.major === 'post'
              ? '편집 또는 후반 효과의 시간에 따른 변화가 분명하게 드러나도록 연출합니다.'
              : '실제 촬영이 가능한 자연스러운 프레이밍과 카메라 위치를 유지합니다.';
    return `가로 16:9, ${isMotion ? '고화질 시네마틱 영상' : '초고화질 이미지'}.\n\n기법: ${technique.ko} / ${technique.en}\n${technique.description}\n\n${style}\n\n[피사체와 장소]: 기법이 명확히 드러나는 구체적인 인물·사물·환경을 지정합니다.\n[카메라와 연출]: 피사체의 크기, 카메라 위치, 거리, 렌즈 특성과 조명을 구체적으로 지정합니다.\n${isMotion ? '[움직임]: 시작 프레임, 동작 변화, 종료 프레임과 재생 시간을 지정합니다.' : '[이미지]: 핵심 효과가 한눈에 구분되도록 프레임을 구성합니다.'}\n텍스트, 자막, 워터마크, 로고 없음.`;
  }
  let detailOrder = [],
    detailReturn = null,
    detailAnimation;
  function detailListFor(element) {
    if (element.closest('#cardGrid'))
      return getFilteredTechniques().map((item) => item.id);
    const list = element.closest('#favoriteList,#memberCollectionList');
    return list
      ? [
          ...new Set(
            [...list.querySelectorAll('[data-open]')].map((node) => node.dataset.open),
          ),
        ]
      : [element.dataset.open];
  }
  function paintDetailNavigation() {
    const index = detailOrder.indexOf(libraryState.open);
    findElement('#detailPrevious').disabled = index <= 0;
    findElement('#detailNext').disabled = index < 0 || index >= detailOrder.length - 1;
    findElement('#detailPosition').textContent =
      String(index + 1).padStart(2, '0') + ' / ' + detailOrder.length;
    findElement('#detailPosition').setAttribute(
      'aria-label',
      index +
        1 +
        '번째, 전체 ' +
        detailOrder.length +
        '개: ' +
        techniquesById.get(libraryState.open)?.ko,
    );
  }
  function stepDetail(direction) {
    const index = detailOrder.indexOf(libraryState.open),
      next = index + direction;
    if (index >= 0 && next >= 0 && next < detailOrder.length)
      openDetail(detailOrder[next], false);
  }
  function detailKeys(event) {
    if (
      findElement('#detailModal').hidden ||
      document.querySelector('dialog[open]') ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDetail();
      return;
    }
    if (event.key === 'Tab') {
      const controls = [
        ...findElement('#detailModal').querySelectorAll(
          'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),video[controls],[tabindex="0"]',
        ),
      ].filter((node) => node.getClientRects().length && !node.closest('[hidden]'));
      const first = controls[0],
        last = controls.at(-1),
        active = document.activeElement;
      if (
        !controls.includes(active) ||
        (event.shiftKey && active === first) ||
        (!event.shiftKey && active === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
      return;
    }
    if (event.shiftKey) return;
    const interactive = event.target.closest?.(
      'input,textarea,select,button,a,[contenteditable],[role="slider"],[role="textbox"],summary,video,audio',
    );
    if (interactive && !interactive.matches('#closeDetail,#detailPrevious,#detailNext'))
      return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      stepDetail(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }
  findElement('#detailPrevious').addEventListener('click', () => stepDetail(-1));
  findElement('#detailNext').addEventListener('click', () => stepDetail(1));
  function updateDetail() {
    if (libraryState.open) openDetail(libraryState.open, false);
  }
  function openDetail(id, focus = true, order = null) {
    const technique = techniquesById.get(id);
    if (!technique) return;
    const panel = findElement('.detail-panel'),
      scroll = panel.scrollTop,
      changed = libraryState.open !== id;
    if (order) {
      detailOrder = [...new Set(order)].filter((key) => techniquesById.has(key));
      detailReturn = document.activeElement;
    }
    if (!detailOrder.includes(id)) detailOrder = [id];
    findElement('#detailBody')
      .querySelectorAll('video')
      .forEach((video) => video.pause());
    cleanupDetail();
    detailAnimation?.cancel();
    libraryState.open = id;
    document.querySelector('.tech-card[data-selected]')?.removeAttribute('data-selected');
    findElement('.tech-card[data-open="' + id + '"]')?.setAttribute('data-selected', '');
    const prompt = makePrompt(technique);
    const lesson =
      window.CINELIQ_LESSON?.({
        item: technique,
        items: techniquesById,
        escape: escapeHtml,
        media: (item) => renderTechniqueMedia(item),
        copyIcon,
        practice: practiceGuide,
        fullLearning: fullLearningGuide,
      }) || '';
    findElement('#detailBody').innerHTML =
      `<div class="detail-inner"><div class="detail-overline">${escapeHtml(getCategoryName(technique.major).toUpperCase())} / ${escapeHtml(technique.section)}</div><div class="detail-heading"><h2 id="detailTitle" tabindex="-1">${escapeHtml(technique.ko)}</h2><div class="detail-actions">${memberControls.favoriteButton(technique.id)}<button class="btn outline small" data-copy="${technique.id}" type="button">${copyIcon} 영문명 복사</button></div></div><p class="detail-en">${escapeHtml(technique.displaySubtitle || technique.en)} ${practiceGuide?.badges(id) || ''}</p><p class="detail-summary">${escapeHtml(technique.summary || getCardSummary(technique))}</p>${renderTechniqueMedia(technique, true)}<div class="detail-info">${lesson || `<p class="info-label">ABOUT THIS TECHNIQUE</p><p class="detail-description">${escapeHtml(technique.description)}</p>`}<div class="detail-tags">${technique.tags.map((tagName) => `<span>${escapeHtml(tagName)}</span>`).join('')}</div></div><div class="prompt-box"><div class="prompt-head"><strong>프롬프트 템플릿 (수정용)</strong><button class="btn outline small" type="button" id="copyPrompt">${copyIcon} 템플릿 복사</button></div><p class="prompt-text">${escapeHtml(prompt)}</p><div class="prompt-hint">인물·장소·연출을 바꿔 쓰는 수정용 템플릿입니다. 위의 완성형 예시와 구분해 활용하세요.</div></div>${libraryState.admin ? mediaManager.markup(technique, libraryState.mediaMap.get(technique.id) || []) : legacyDownload(technique)}</div>`;
    findElement('#detailModal').hidden = false;
    findElement('.app-shell').inert = true;
    panel.scrollTop = changed ? 0 : scroll;
    paintDetailNavigation();
    window.CINELIQ_IMAGE_CAROUSEL.bind(findElement('#detailBody'));
    document.addEventListener('keydown', detailKeys);
    if (
      changed &&
      !(
        window.CINELIQ_A11Y?.reducedMotion() ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
    )
      detailAnimation = findElement('#detailBody').animate(
        [
          {
            opacity: 0.65,
          },
          {
            opacity: 1,
          },
        ],
        {
          duration: 140,
          easing: 'ease-out',
        },
      );
    document.body.style.overflow = 'hidden';
    if (focus) findElement('#closeDetail').focus();
    findElement('#copyPrompt').addEventListener('click', () => copyText(prompt));
    window.CINELIQ_VIDEO_MODELS?.bind(
      findElement('#detailBody'),
      escapeHtml,
      copyIcon,
      copyText,
    );
    findElement('#detailBody').onclick = (event) => {
      const fullCopy = event.target.closest('[data-full-video-copy]');
      if (fullCopy) {
        const value = fullLearningGuide?.copy(fullCopy.dataset.fullVideoCopy);
        if (value) copyText(value);
        return;
      }
      const practicalCopy = event.target.closest('[data-practice-copy]');
      if (practicalCopy) {
        const value = practiceGuide?.copy(
          practicalCopy.dataset.practiceId,
          practicalCopy.dataset.practiceCopy,
        );
        if (value) copyText(value);
        return;
      }
      const copy = event.target.closest('[data-lesson-copy]');
      if (copy) {
        const data = window.CINELIQ_LEARNING?.[id];
        const value =
          copy.dataset.lessonCopy === 'video'
            ? data?.videoPromptExample
            : data?.imagePromptExample;
        if (value) copyText(value);
        return;
      }
      const related = event.target.closest('[data-related-technique]');
      if (related && techniquesById.has(related.dataset.relatedTechnique)) {
        const next = related.dataset.relatedTechnique,
          origin = detailReturn;
        const order = detailOrder.includes(next)
          ? null
          : [id, ...(window.CINELIQ_LEARNING?.[id]?.relatedTechniqueIds || [])];
        openDetail(next, false, order);
        detailReturn = origin;
        findElement('#detailTitle').focus({
          preventScroll: true,
        });
      }
    };
    cleanupDetail = mediaManager.bind(technique, findElement('#mediaManager'));
  }
  function legacyDownload(item) {
    const record = libraryState.legacy.get(item.id);
    if (mediaCloud.configured || !record) return '';
    return `<p class="storage-status"><a class="btn outline small" href="${escapeHtml(record.url)}" download="cineliq-${escapeHtml(item.id)}-${escapeHtml(record.name)}">로컬 원본 다운로드</a></p>`;
  }
  function closeDetail() {
    cleanupDetail();
    detailAnimation?.cancel();
    findElement('#detailBody')
      .querySelectorAll('video')
      .forEach((video) => video.pause());
    findElement('#detailModal').hidden = true;
    findElement('.app-shell').inert = false;
    document.removeEventListener('keydown', detailKeys);
    document.querySelector('.tech-card[data-selected]')?.removeAttribute('data-selected');
    libraryState.open = null;
    document.body.style.overflow = '';
    const target = detailReturn?.isConnected
      ? detailReturn
      : document.querySelector(
          '.tech-card[data-open="' + detailOrder[0] + '"] .card-title-open',
        ) || findElement('#catalogTitle');
    target?.focus({
      preventScroll: true,
    });
    detailOrder = [];
    detailReturn = null;
  }
  function resetFilters() {
    libraryState.major = 'all';
    libraryState.section = 0;
    libraryState.tags.clear();
    libraryState.types.clear();
    libraryState.media = 'all';
    libraryState.search = '';
    libraryState.sort = 'number';
    libraryState.limit = APP_SETTINGS.PAGE_SIZE;
    findElement('#searchInput').value = '';
    findElement('#sortSelect').value = 'number';
    renderLibrary();
  }
  function renderLibrary() {
    renderNav();
    renderTags();
    renderCards();
  }
  function setupNavigation(openLibrary) {
    const toggle = findElement('#navToggle'),
      panel = findElement('#techniqueNav'),
      backdrop = findElement('#navBackdrop');
    let scrollLock = null;
    const main = findElement('.main-content');
    const setOpen = (open) => {
      if (open === (toggle.getAttribute('aria-expanded') === 'true')) return;
      if (open) {
        const body = document.body;
        scrollLock = {
          x: scrollX,
          y: scrollY,
          styles: Object.fromEntries(
            ['position', 'top', 'left', 'width', 'overflow'].map((key) => [
              key,
              body.style[key],
            ]),
          ),
        };
        Object.assign(body.style, {
          position: 'fixed',
          top: `-${scrollLock.y}px`,
          left: `-${scrollLock.x}px`,
          width: '100%',
          overflow: 'hidden',
        });
      }
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('menu-open', open);
      backdrop.setAttribute('aria-hidden', String(!open));
      panel.inert = !open;
      panel.setAttribute('aria-hidden', String(!open));
      main.inert = open;
      findElement('.header-actions').inert = open;
      findElement('.brand').inert = open;
      if (open) {
        panel.scrollTop = 0;
        const first = [...panel.querySelectorAll('button,a[href]')].find(
          (element) => element.getClientRects().length && !element.hidden,
        );
        first?.focus({
          preventScroll: true,
        });
      } else if (scrollLock) {
        Object.assign(document.body.style, scrollLock.styles);
        window.scrollTo({
          left: scrollLock.x,
          top: scrollLock.y,
          behavior: 'instant',
        });
        scrollLock = null;
      }
    };
    const close = (focus = false) => {
      setOpen(false);
      if (focus) toggle.focus();
    };
    findElement('#mobileMenuClose')?.addEventListener('click', () => close(true));
    const mobile = matchMedia('(max-width:760px)');
    let swipeStart = null;
    panel.addEventListener(
      'touchstart',
      (event) => {
        swipeStart =
          mobile.matches && event.touches.length === 1
            ? {
                x: event.touches[0].clientX,
                y: event.touches[0].clientY,
              }
            : null;
      },
      {
        passive: true,
      },
    );
    panel.addEventListener(
      'touchcancel',
      () => {
        swipeStart = null;
      },
      {
        passive: true,
      },
    );
    panel.addEventListener(
      'touchend',
      (event) => {
        const start = swipeStart;
        swipeStart = null;
        const end = event.changedTouches[0];
        if (!start || !end || event.touches.length) return;
        const distance = start.x - end.clientX;
        if (distance >= 72 && distance > Math.abs(end.clientY - start.y) * 1.6)
          close(true);
      },
      {
        passive: true,
      },
    );
    toggle.addEventListener('click', () =>
      setOpen(toggle.getAttribute('aria-expanded') !== 'true'),
    );
    backdrop.addEventListener('click', () => close());
    panel.addEventListener('click', (event) => {
      if (event.target.closest('.service-menu a,[data-site-view]')) {
        close();
        return;
      }
      if (
        !event.target.closest(
          '[data-major],[data-section],[data-tag],[data-media],[data-type]',
        )
      )
        return;
      close();
      openLibrary();
    });
    panel.addEventListener(
      'click',
      (event) => {
        if (event.target.closest('#adminToggle')) close();
      },
      true,
    );
    window.addEventListener('popstate', () => close());
    window.addEventListener('hashchange', () => close());
    document.addEventListener('keydown', (event) => {
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [
        ...(mobile.matches ? [] : [toggle]),
        ...panel.querySelectorAll(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary',
        ),
      ].filter((element) => element.getClientRects().length && !element.hidden);
      const index = controls.indexOf(document.activeElement);
      const next = event.shiftKey
        ? index <= 0
          ? controls.length - 1
          : index - 1
        : (index + 1) % controls.length;
      event.preventDefault();
      controls[next]?.focus();
    });
  }
  function setupMobileViews(updateHeroVideo) {
    const main = findElement('.main-content');
    const hero = findElement('.hero');
    const library = findElement('.catalog');
    const mobile = matchMedia('(max-width:760px)');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let animation;
    let transitionId = 0;
    const currentRoute = () =>
      /^#my(?:\/|$)/.test(location.hash)
        ? 'my'
        : location.hash.startsWith('#glossary')
          ? 'glossary'
          : location.hash === '#library'
            ? 'library'
            : 'hero';
    const panelFor = (view) =>
      view === 'glossary'
        ? findElement('#glossaryPage')
        : view === 'my'
          ? findElement('#memberPage')
          : view === 'library'
            ? library
            : hero;
    async function renderView({ animate = false, focus = false } = {}) {
      const id = ++transitionId;
      animation?.cancel();
      const next = currentRoute();
      if (next === 'my') window.dispatchEvent(new Event('cineliq-member-route'));
      if (next === 'glossary') window.dispatchEvent(new Event('cineliq-glossary-route'));
      if (!mobile.matches && next !== 'my' && next !== 'glossary') {
        const leavingMember = ['my', 'glossary'].includes(main.dataset.mobileView);
        delete main.dataset.mobileView;
        history.scrollRestoration = 'auto';
        updateHeroVideo();
        if (leavingMember) {
          if (next === 'library')
            findElement('#catalogTitle').scrollIntoView({
              behavior: 'instant',
            });
          else
            window.scrollTo({
              top: 0,
              behavior: 'instant',
            });
          if (focus)
            findElement(next === 'library' ? '#catalogTitle' : '.brand').focus({
              preventScroll: true,
            });
        }
        return;
      }
      history.scrollRestoration = 'manual';
      const current = main.dataset.mobileView;
      if (current === next) return;
      const fade =
        animate &&
        current &&
        !reducedMotion.matches &&
        !window.CINELIQ_A11Y?.reducedMotion();
      if (fade) {
        animation = panelFor(current).animate(
          [
            {
              opacity: 1,
            },
            {
              opacity: 0,
            },
          ],
          {
            duration: 130,
            fill: 'forwards',
          },
        );
        await animation.finished.catch(() => {});
        if (id !== transitionId) return;
        animation.cancel();
      }
      main.dataset.mobileView = next;
      window.scrollTo({
        top: 0,
        behavior: 'instant',
      });
      updateHeroVideo();
      if (focus)
        (next === 'glossary'
          ? findElement('#glossaryTitle')
          : next === 'my'
            ? findElement('#memberPageTitle')
            : next === 'hero'
              ? findElement('.hero-explore')
              : findElement('#catalogTitle')
        ).focus({
          preventScroll: true,
        });
      if (fade) {
        animation = panelFor(next).animate(
          [
            {
              opacity: 0,
            },
            {
              opacity: 1,
            },
          ],
          {
            duration: 180,
            easing: 'ease-out',
          },
        );
      }
    }
    function navigate(view) {
      if (
        (!mobile.matches &&
          view === 'library' &&
          !['my', 'glossary'].includes(currentRoute())) ||
        (currentRoute() === view && (view !== 'my' || location.hash === '#my'))
      )
        return;
      if (libraryState.open) closeDetail();
      history.pushState(
        null,
        '',
        view === 'glossary'
          ? '#glossary'
          : view === 'my'
            ? '#my'
            : view === 'library'
              ? '#library'
              : '#home',
      );
      void renderView({
        animate: true,
        focus: true,
      });
    }
    findElement('.hero-explore').addEventListener('click', (event) => {
      if (!mobile.matches) return;
      event.preventDefault();
      navigate('library');
    });
    findElement('.brand').addEventListener('click', (event) => {
      if (!mobile.matches && !['my', 'glossary'].includes(currentRoute())) return;
      event.preventDefault();
      navigate('hero');
    });
    window.addEventListener(
      'popstate',
      () =>
        void renderView({
          focus: true,
        }),
    );
    window.addEventListener(
      'hashchange',
      () =>
        void renderView({
          focus: true,
        }),
    );
    mobile.addEventListener('change', () => void renderView());
    reducedMotion.addEventListener('change', () => void renderView());
    void renderView();
    return navigate;
  }
  function refreshFilteredCards() {
    libraryState.limit = APP_SETTINGS.PAGE_SIZE;
    renderTags();
    renderCards();
  }
  function selectMainCategory(button) {
    if (button.dataset.major === 'all') {
      resetFilters();
      return;
    }
    const restoreFocus = document.activeElement === button;
    libraryState.major = button.dataset.major;
    libraryState.section = 0;
    libraryState.limit = APP_SETTINGS.PAGE_SIZE;
    renderLibrary();
    if (restoreFocus) findElement('.nav-btn.active')?.focus();
  }
  function selectSubcategory(button) {
    const restoreFocus = document.activeElement === button;
    libraryState.section = Number(button.dataset.section);
    libraryState.limit = APP_SETTINGS.PAGE_SIZE;
    renderLibrary();
    if (restoreFocus) findElement('.section-btn.active')?.focus();
  }
  function toggleSceneTag(button) {
    const tagName = button.dataset.tag;
    if (tagName === 'all') libraryState.tags.clear();
    else if (libraryState.tags.has(tagName)) libraryState.tags.delete(tagName);
    else libraryState.tags.add(tagName);
    refreshFilteredCards();
  }
  function selectContentType(button) {
    const contentType = button.dataset.type;
    if (libraryState.types.has(contentType)) libraryState.types.clear();
    else libraryState.types = new Set([contentType]);
    refreshFilteredCards();
  }
  function selectRegistrationStatus(button) {
    if (!libraryState.admin) return;
    libraryState.media = button.dataset.media;
    refreshFilteredCards();
  }
  function openTechniqueFromCard(card) {
    detailReturn = card;
    openDetail(card.dataset.open, true, detailListFor(card));
    detailReturn = card;
  }
  function handleLibraryClick(event) {
    const copyButton = event.target.closest('[data-copy]');
    if (copyButton) {
      event.stopPropagation();
      const technique = techniquesById.get(copyButton.dataset.copy);
      if (technique) copyText(technique.en);
      return;
    }
    const categoryButton = event.target.closest('[data-major]');
    if (categoryButton) return selectMainCategory(categoryButton);
    const subcategoryButton = event.target.closest('[data-section]');
    if (subcategoryButton) return selectSubcategory(subcategoryButton);
    const tagButton = event.target.closest('[data-tag]');
    if (tagButton) return toggleSceneTag(tagButton);
    const contentButton = event.target.closest('[data-type]');
    if (contentButton) return selectContentType(contentButton);
    const registrationButton = event.target.closest('[data-media]');
    if (registrationButton) return selectRegistrationStatus(registrationButton);
    const card = event.target.closest('[data-open]');
    if (card) return openTechniqueFromCard(card);
    if (event.target.closest('[data-close]')) closeDetail();
  }
  function handleLibraryShortcuts(event) {
    const activeTag = document.activeElement?.tagName;
    const canFocusSearch = activeTag !== 'INPUT' && activeTag !== 'TEXTAREA';
    if (event.key === '/' && canFocusSearch && findElement('#detailModal').hidden) {
      event.preventDefault();
      findElement('#searchInput').focus();
    }
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      event.target.matches('.tech-card')
    ) {
      event.preventDefault();
      openDetail(event.target.dataset.open, true, detailListFor(event.target));
      detailReturn = event.target;
    }
  }
  function setupLibraryEvents(openLibrary) {
    document.addEventListener(
      'pointerdown',
      () => {
        document.documentElement.dataset.pointerInput = 'true';
      },
      true,
    );
    document.addEventListener(
      'keydown',
      () => {
        document.documentElement.dataset.pointerInput = 'false';
      },
      true,
    );
    setupNavigation(openLibrary);
    setupInfiniteScroll();
    const filterToggle = findElement('#filterToggle');
    filterToggle.addEventListener('click', () => {
      const expanded = filterToggle.getAttribute('aria-expanded') === 'true';
      filterToggle.setAttribute('aria-expanded', String(!expanded));
    });
    document.addEventListener('click', handleLibraryClick);
    document.addEventListener('keydown', handleLibraryShortcuts);
    findElement('#searchInput').addEventListener('input', (event) => {
      libraryState.search = event.target.value;
      libraryState.limit = APP_SETTINGS.PAGE_SIZE;
      renderCards();
    });
    findElement('#sortSelect').addEventListener('change', (event) => {
      libraryState.sort = event.target.value;
      renderCards();
    });
    findElement('#clearFilters').addEventListener('click', resetFilters);
    findElement('#emptyReset').addEventListener('click', resetFilters);
    findElement('#loadMore').addEventListener('click', () => {
      libraryState.limit += APP_SETTINGS.PAGE_SIZE;
      renderCards();
    });
    findElement('#closeDetail').addEventListener('click', closeDetail);
  }
  function setupHeroVideo() {
    const video = document.querySelector('.hero-background-video');
    const mobile = matchMedia('(max-width:760px)');
    const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
    video.addEventListener('play', () => {
      if (reducedMotion.matches || window.CINELIQ_A11Y?.reducedMotion()) video.pause();
    });
    function updateVideo() {
      const device = mobile.matches ? 'mobile' : 'pc';
      const revision = mobile.matches ? '?v=mobile-v02' : '';
      const source = `assets/cineliq-hero-${device}.mp4${revision}`;
      video.poster = `assets/cineliq-hero-${device}-poster.jpg${revision}`;
      const reduced = reducedMotion.matches || window.CINELIQ_A11Y?.reducedMotion();
      if (reduced) {
        if (video.hasAttribute('src')) {
          video.pause();
          video.removeAttribute('src');
          video.load();
        }
        return;
      }
      const view = findElement('.main-content').dataset.mobileView;
      if (
        view === 'my' ||
        view === 'glossary' ||
        (mobile.matches && view === 'library')
      ) {
        video.pause();
        return;
      }
      if (video.getAttribute('src') !== source) video.src = source;
      else if (video.paused) void video.play().catch(() => {});
    }
    window.addEventListener('cineliq-a11y-change', updateVideo);
    mobile.addEventListener('change', updateVideo);
    reducedMotion.addEventListener('change', updateVideo);
    return updateVideo;
  }
  const navigateView = setupMobileViews(setupHeroVideo());
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-site-view]');
    if (!link) return;
    event.preventDefault();
    if (
      link.dataset.siteView === 'library' &&
      !matchMedia('(max-width:760px)').matches &&
      !['my', 'glossary'].includes(location.hash.slice(1))
    ) {
      document.querySelector('.catalog').scrollIntoView();
      document.querySelector('#catalogTitle').focus({
        preventScroll: true,
      });
      return;
    }
    navigateView(link.dataset.siteView);
  });
  renderLibrary();
  setupLibraryEvents(() => navigateView('library'));
  void initializeMedia();
})();
