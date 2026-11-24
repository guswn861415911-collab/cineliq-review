(() => {
  'use strict';

  window.CINELIQ_MERGE_NOTICE = ({ members }) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'merge-notice';
    dialog.setAttribute('aria-labelledby', 'mergeNoticeTitle');
    dialog.innerHTML = `<button type="button" class="merge-close" aria-label="계정 통합 안내 닫기">×</button>
      <h2 id="mergeNoticeTitle">계정 통합 안내</h2>
      <p>이미 다른 CINELIQ 계정에 연결된 로그인 방법입니다.</p>
      <p>기존 계정을 삭제하지 않는 통합 절차를 준비하고 있어요. 지금은 통합을 실행할 수 없습니다. 두 계정으로 각각 로그인해 기존 데이터를 계속 이용할 수 있습니다.</p>
      <button type="button" class="merge-review">통합 전 확인사항 보기</button>
      <section class="merge-details" hidden><h3>현재 로그인한 계정</h3>
        <p class="merge-summary" role="status" aria-live="polite"></p>
        <h3>통합 전에 필요한 확인</h3>
        <ul><li>두 계정의 소유권을 각각 다시 인증합니다.</li><li>유지할 대표 계정을 직접 선택합니다.</li><li>두 계정의 즐겨찾기·폴더 수와 백업을 확인합니다.</li><li>다른 계정의 마지막 로그인 수단은 해제하지 않습니다. 실제로 로그인할 수 있는 대체 수단이 먼저 필요합니다.</li><li>데이터 이전과 Google·카카오 재로그인을 모두 검증한 뒤에만 완료합니다.</li></ul>
        <p>다른 계정의 데이터는 아직 확인하지 않았습니다. 현재 안내는 계정 통합이나 데이터 이전을 실행하지 않습니다.</p>
      </section><button type="button" class="merge-cancel">취소하고 돌아가기</button>`;
    document.body.append(dialog);
    const details = dialog.querySelector('.merge-details');
    const summary = dialog.querySelector('.merge-summary');
    let owner = null,
      revision = 0;
    function close() {
      revision++;
      owner = null;
      dialog.close();
    }
    dialog.querySelector('.merge-close').onclick = close;
    dialog.querySelector('.merge-cancel').onclick = close;
    dialog.addEventListener('close', () => {
      revision++;
      owner = null;
      summary.textContent = '';
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          close();
      }
    });
    dialog.querySelector('.merge-review').onclick = async () => {
      const current = ++revision,
        expected = owner;
      details.hidden = false;
      summary.textContent = '현재 계정의 저장 데이터를 확인하고 있어요…';
      try {
        await members.identityState(expected);
        const [favorites, library] = await Promise.all([
          members.favorites(expected),
          members.library(expected),
        ]);
        await members.identityState(expected);
        if (current !== revision || owner !== expected || !dialog.open) return;
        summary.textContent = `즐겨찾기 ${favorites.length}개 · 개인 폴더 ${library.folders.length}개 · 폴더에 저장한 기법 연결 ${library.entries.length}개. 현재 계정에서 확인한 수치이며 통합 결과가 아닙니다.`;
      } catch {
        if (current === revision && dialog.open)
          summary.textContent =
            '현재 계정의 데이터를 확인하지 못했어요. 계정과 데이터는 변경하지 않았습니다.';
      }
    };
    return {
      show(userId) {
        if (!userId) return;
        revision++;
        owner = userId;
        details.hidden = true;
        summary.textContent = '';
        if (!dialog.open) dialog.showModal();
      },
      sync(userId) {
        if (dialog.open && owner !== userId) close();
      },
    };
  };
})();
