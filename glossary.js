(() => {
  'use strict';
  window.CINELIQ_GLOSSARY = ({ practice }) => {
    const root = document.querySelector('#glossaryPage'),
      search = root.querySelector('input'),
      results = root.querySelector('.glossary-results'),
      count = root.querySelector('[role="status"]');
    let lastHash = '';
    function paint() {
      const rows = practice.matchingTerms(search.value);
      results.innerHTML =
        rows.map((term) => practice.termCard(term)).join('') ||
        '<p>검색 결과가 없어요. 다른 명칭이나 약어로 검색해 주세요.</p>';
      count.textContent = `전체 ${practice.matchingTerms('').length}개 중 ${rows.length}개 · 영문·한국어·약어·발음·별칭 검색`;
    }
    search.addEventListener('input', paint);
    window.addEventListener('cineliq-glossary-route', () => {
      if (location.hash !== lastHash) {
        lastHash = location.hash;
        search.value =
          new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '';
        paint();
      }
    });
    paint();
  };
})();
