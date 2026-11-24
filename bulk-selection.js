(() => {
  'use strict';
  window.CINELIQ_BULK_SELECTION = (root) => {
    const rows = [...root.querySelectorAll('[data-choice-row]')];
    const bar = document.createElement('div');
    bar.className = 'bulk-selection';
    bar.innerHTML =
      '<input type="search" aria-label="추가할 즐겨찾기 검색" placeholder="즐겨찾기 검색"><div><label><input type="checkbox" data-select-visible> 검색 결과 전체 선택</label><button type="button" data-clear-selection>전체 해제</button></div><p role="status" aria-live="polite"></p>';
    root.prepend(bar);
    const all = bar.querySelector('[data-select-visible]'),
      count = bar.querySelector('p');
    const inputs = () =>
      rows.filter((row) => !row.hidden).map((row) => row.querySelector('input'));
    const paint = () => {
      const visible = inputs(),
        checked = visible.filter((input) => input.checked).length;
      all.checked = !!visible.length && checked === visible.length;
      all.indeterminate = checked > 0 && checked < visible.length;
      all.disabled = !visible.length;
      count.textContent = `${rows.filter((row) => row.querySelector('input').checked).length}개 선택 · 검색 결과 ${visible.length}개 / 추가 가능 ${rows.length}개`;
    };
    bar.querySelector('[type="search"]').oninput = (event) => {
      const q = event.target.value.trim().toLocaleLowerCase();
      rows.forEach(
        (row) => (row.hidden = !row.textContent.toLocaleLowerCase().includes(q)),
      );
      paint();
    };
    all.onchange = () => {
      inputs().forEach((input) => (input.checked = all.checked));
      paint();
    };
    bar.querySelector('[data-clear-selection]').onclick = () => {
      rows.forEach((row) => (row.querySelector('input').checked = false));
      paint();
    };
    rows.forEach((row) => (row.querySelector('input').onchange = paint));
    paint();
  };
})();
