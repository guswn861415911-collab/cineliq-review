(() => {
  'use strict';
  const cloud = window.CINELIQ_CLOUD;

  function createAdmin({ state, items, escape, notify, refresh, updateDetail }) {
    const dialog = document.querySelector('#adminDialog');
    const toggle = document.querySelector('#adminToggle');
    const label = document.querySelector('#adminText');
    const loginForm = dialog.querySelector('form');
    const loginStatus = dialog.querySelector('#loginStatus');
    const sessionPanel = dialog.querySelector('#adminSession');
    const importPanel = dialog.querySelector('#legacyImport');
    let busy = false;
    let authRequest = 0;
    let sessionAction = false;
    let connected = false;

    function message(error) {
      console.warn('CINELIQ media:', error);
      const code = error.code;
      if (code === 'invalid_credentials') return '이메일 또는 비밀번호를 확인해 주세요.';
      if (code === '42501' || error.status === 401 || error.status === 403)
        return '접근이 거부됐어요. 관리자 계정과 쓰기 설정을 확인해 주세요.';
      if (error instanceof Error && /[가-힣]/.test(error.message)) return error.message;
      return '요청을 완료하지 못했어요. 네트워크와 Supabase 설정을 확인한 뒤 다시 시도해 주세요.';
    }

    function update() {
      toggle.hidden = !state.admin;
      toggle.closest('.sidebar-admin').hidden = !state.admin;
      label.textContent = state.admin ? '미디어 관리' : '관리자 로그인';
      toggle.classList.toggle('active-admin', state.admin);
      document
        .querySelectorAll('.admin-media-filter, .admin-only-count')
        .forEach((el) => {
          el.hidden = !state.admin;
        });
      if (!state.admin && (state.media === 'ready' || state.media === 'missing'))
        state.media = 'all';
      loginForm.hidden = state.admin;
      sessionPanel.hidden = !state.admin;
      if (state.admin && dialog.open) showImport();
    }

    async function checkSession() {
      if (sessionAction || !connected) return;
      const request = ++authRequest;
      let allowed = false;
      try {
        allowed = cloud.showAdmin && (await cloud.canWrite());
      } catch (error) {
        console.warn('CINELIQ auth:', error);
      }
      if (request !== authRequest || sessionAction || allowed === state.admin) return;
      state.admin = allowed;
      update();
      await refresh();
      if (!busy) updateDetail();
    }

    function lock(locked) {
      for (const button of dialog.querySelectorAll('button:not(#closeAdmin)'))
        button.disabled = locked;
    }

    async function changeSession(action) {
      if (sessionAction || busy) return;
      sessionAction = true;
      authRequest++;
      lock(true);
      loginStatus.textContent = '';
      try {
        await action();
        loginStatus.textContent = '';
        loginForm.reset();
      } catch (error) {
        loginStatus.textContent = message(error);
        if (state.admin) notify(loginStatus.textContent);
      } finally {
        sessionAction = false;
        lock(false);
        await checkSession();
      }
    }

    function showImport() {
      const records = [...state.legacy.values()].filter((record) => items.has(record.id));
      const statuses = new Map(
        [...importPanel.querySelectorAll('[data-import-status]')].map((el) => [
          el.dataset.importStatus,
          el.textContent,
        ]),
      );
      importPanel.innerHTML = records.length
        ? `
        <h3>이 브라우저의 기존 미디어</h3>
        <p>목록에서 이전할 파일을 선택하세요. 원본은 이 브라우저에 계속 남습니다.</p>
        <ul class="media-admin-list">${records
          .map(
            (record) => `<li>
          <label><input type="checkbox" value="${escape(record.id)}"> ${escape(record.id)} · ${escape(record.name)}</label>
          <div class="admin-actions">
            <a class="btn outline small" href="${escape(record.url)}" download="cineliq-${escape(record.id)}-${escape(record.name)}">원본 다운로드</a>
            <span data-import-status="${escape(record.id)}" role="status">${escape(statuses.get(record.id) ?? '')}</span>
          </div></li>`,
          )
          .join('')}</ul>
        <button class="btn dark" id="importSelected" type="button">선택한 파일 이전</button>
      `
        : '<p>이 주소의 브라우저에 이전할 로컬 미디어가 없어요.</p>';
      importPanel
        .querySelector('#importSelected')
        ?.addEventListener('click', importSelected);
    }

    async function importSelected() {
      if (busy || !state.admin) return;
      const ids = [...importPanel.querySelectorAll('input:checked')].map(
        (input) => input.value,
      );
      if (!ids.length) {
        notify('이전할 파일을 선택해 주세요.');
        return;
      }
      if (
        !confirm(
          `선택한 ${ids.length}개 파일을 공개 미디어로 등록할까요? 로컬 원본은 유지됩니다.`,
        )
      )
        return;
      busy = true;
      lock(true);
      let completed = 0;
      try {
        for (const id of ids) {
          if (!state.admin) break;
          const record = state.legacy.get(id);
          const item = items.get(id);
          const status = importPanel.querySelector(`[data-import-status="${id}"]`);
          try {
            const file = new File([record.blob], record.name, { type: record.type });
            await cloud.validate(file, item.mediaType);
            const fingerprint = await cloud.digest(file);
            const clean = await cloud.upload(
              item,
              file,
              null,
              (value) => {
                status.textContent = `이전 중 ${value}%`;
              },
              fingerprint,
            );
            status.textContent = clean
              ? '이전 확인 · 원본 유지'
              : '이전 확인 · 저장소 정리 필요';
            importPanel.querySelector(`input[value="${id}"]`).checked = false;
            completed++;
          } catch (error) {
            status.textContent = message(error);
          }
        }
        const refreshed = await refresh();
        updateDetail();
        notify(
          refreshed
            ? `${completed}/${ids.length}개 이전 확인 · 로컬 원본 유지`
            : '공개 미디어 목록을 확인하려면 새로고침해 주세요.',
        );
      } finally {
        busy = false;
        lock(false);
      }
    }

    toggle.addEventListener('click', () => {
      dialog.showModal();
      if (!busy) update();
    });
    document.querySelector('#closeAdmin').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', (event) => {
      if (sessionAction) event.preventDefault();
    });
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (sessionAction || busy) return;
      const form = new FormData(loginForm);
      const password = form.get('password');
      loginForm.elements.password.value = '';
      void changeSession(() => cloud.login(form.get('email').trim(), password));
    });
    dialog
      .querySelector('#adminLogout')
      .addEventListener('click', () => void changeSession(cloud.logout));

    async function start() {
      connected = true;
      await checkSession();
      update();
      cloud.onAuthChange(() => void checkSession());
    }

    function markup(item, rows) {
      const accept = Object.keys(cloud.types)
        .filter((type) => type.startsWith(item.mediaType))
        .join(',');
      const formats =
        item.mediaType === 'image'
          ? 'JPG, PNG, WebP · 최대 8MB'
          : 'MP4, WebM · 최대 40MB';
      return `<section class="admin-box" id="mediaManager"><h3>공개 미디어 관리</h3>
        <p>${formats}</p>
        <ul class="media-admin-list">${rows
          .map(
            (row, index) => `<li data-media-id="${escape(row.id)}">
          <strong>${escape(row.name || `미디어 ${index + 1}`)}${row.is_primary ? ' · 대표' : ''}</strong>
          <div class="admin-actions">
            <label class="btn outline small">교체<input class="file-input" data-replace type="file" accept="${accept}"></label>
            <button class="btn outline small" type="button" data-mutation="up" ${index === 0 ? 'disabled' : ''}>위로</button>
            <button class="btn outline small" type="button" data-mutation="down" ${index === rows.length - 1 ? 'disabled' : ''}>아래로</button>
            <button class="btn outline small" type="button" data-mutation="primary" ${row.is_primary ? 'disabled' : ''}>대표 지정</button>
            <button class="btn outline small" type="button" data-mutation="delete">삭제</button>
          </div></li>`,
          )
          .join('')}</ul>
        <div class="media-drop" id="mediaDrop">
          <label class="btn dark">파일 선택<input class="file-input" id="mediaUpload" type="file" multiple accept="${accept}"></label>
          <span>또는 여기에 파일을 놓으세요</span>
        </div>
        ${
          item.mediaType === 'image'
            ? `<div class="media-paste">
          <label for="mediaPaste">이미지 붙여넣기</label>
          <textarea id="mediaPaste" rows="2" aria-describedby="mediaPasteHelp" placeholder="PC는 Ctrl+V / Cmd+V · 모바일은 길게 눌러 붙여넣기"></textarea>
          <p id="mediaPasteHelp">이미지 데이터가 복사된 경우 미리보기가 표시됩니다. 붙여넣기가 제공되지 않으면 파일 선택으로 사진을 선택하세요.</p>
          <button class="btn outline" id="readMediaClipboard" type="button" hidden>클립보드 이미지 읽기</button>
        </div>`
            : ''
        }
        <div class="media-preview" id="mediaPreview" hidden></div>
        <div class="admin-actions" id="mediaSubmit" hidden>
          <button class="btn dark" type="button" id="confirmMedia">등록</button>
          <button class="btn outline" type="button" id="cancelMedia">취소</button>
        </div>
        <progress id="mediaProgress" max="100" value="0" hidden aria-label="미디어 업로드 진행률"></progress>
        <p id="mediaStatus" role="status"></p></section>`;
    }

    function bind(item, root) {
      if (!root) return () => {};
      const search = (selector) => root.querySelector(selector);
      const drop = search('#mediaDrop'),
        preview = search('#mediaPreview');
      const submit = search('#mediaSubmit'),
        progress = search('#mediaProgress'),
        status = search('#mediaStatus');
      const openedBox = root;
      let queue = [];
      let replacement = null;
      let previewUrls = [];
      let selection = 0;
      let readingClipboard = false;
      let disposed = false;

      function clear() {
        selection++;
        previewUrls.forEach((url) => URL.revokeObjectURL(url));
        previewUrls = [];
        queue = [];
        preview.replaceChildren();
        preview.hidden = true;
        submit.hidden = true;
        status.textContent = '';
      }

      async function choose(files, replaceId = null) {
        if (busy || !state.admin || !files?.length) return;
        clear();
        const request = selection;
        const rejected = [];
        const selected = [];
        for (const file of files) {
          try {
            await cloud.validate(file, item.mediaType);
            selected.push(file);
          } catch (error) {
            rejected.push(`${file.name} · ${message(error)}`);
          }
        }
        if (request !== selection || !openedBox.isConnected) return;
        status.textContent = rejected.join(' / ');
        if (!selected.length) return;
        queue = selected;
        replacement = replaceId;
        search('#confirmMedia').textContent = replaceId ? '교체 확인' : '등록';
        preview.hidden = false;
        submit.hidden = false;
        for (const file of queue) {
          const url = URL.createObjectURL(file);
          previewUrls.push(url);
          const figure = document.createElement('figure');
          const element = document.createElement(
            item.mediaType === 'image' ? 'img' : 'video',
          );
          element.src = url;
          if (element.tagName === 'VIDEO') {
            element.controls = true;
            element.playsInline = true;
            element.preload = 'metadata';
          } else element.alt = '업로드 미리보기';
          const caption = document.createElement('figcaption');
          caption.textContent = file.name;
          figure.append(element, caption);
          preview.append(figure);
        }
      }

      function setBusy(on) {
        busy = on;
        for (const control of root.querySelectorAll('button,input')) {
          if (on && !control.disabled) {
            control.dataset.busyDisabled = '';
            control.disabled = true;
          } else if (!on && Object.hasOwn(control.dataset, 'busyDisabled')) {
            control.disabled = false;
            delete control.dataset.busyDisabled;
          }
        }
      }

      async function commitQueue() {
        if (busy || !state.admin || !queue.length) return;
        setBusy(true);
        const files = queue.slice();
        const failures = [];
        let needsCleanup = false;
        progress.hidden = false;
        try {
          for (const [index, file] of files.entries()) {
            try {
              const clean = await cloud.upload(item, file, replacement, (value) => {
                progress.value = (100 * index + value) / files.length;
                status.textContent = `${index + 1}/${files.length} · ${value}%`;
              });
              needsCleanup ||= !clean;
            } catch (error) {
              failures.push([file, message(error)]);
            }
          }
          const refreshed = await refresh();
          const completed = files.length - failures.length;
          const summary = `${completed}/${files.length}개 저장${needsCleanup ? ' · 저장소 정리 필요' : ''}${refreshed ? '' : ' · 목록을 확인하려면 새로고침해 주세요.'}`;
          if (failures.length && openedBox.isConnected && state.admin) {
            setBusy(false);
            await choose(
              failures.map(([file]) => file),
              replacement,
            );
            status.textContent =
              summary +
              ' / ' +
              failures.map(([file, error]) => `${file.name} · ${error}`).join(' / ');
          } else {
            notify(failures.length ? `${summary} · ${failures[0][1]}` : summary);
            if (state.open === item.id) updateDetail();
          }
        } finally {
          progress.hidden = true;
          setBusy(false);
        }
      }

      search('#mediaUpload').addEventListener('change', (event) => {
        void choose([...event.target.files]);
        event.target.value = '';
      });
      const pasteArea = search('#mediaPaste');
      const readClipboard = search('#readMediaClipboard');
      const noImage =
        '이미지 데이터가 없어요. Gemini에서 이미지 자체를 복사하거나, 기기에 저장한 뒤 파일 선택을 이용해 주세요. URL이나 텍스트는 이미지로 등록되지 않습니다.';
      if (pasteArea) {
        pasteArea.addEventListener('paste', (event) => {
          event.preventDefault();
          pasteArea.value = '';
          if (busy || readingClipboard || !state.admin) return;
          const data = event.clipboardData;
          const files = [...(data?.files ?? [])];
          if (!files.length) {
            for (const entry of data?.items ?? []) {
              if (entry.kind === 'file') {
                const file = entry.getAsFile();
                if (file) files.push(file);
              }
            }
          }
          const images = files.filter((file) => file.type.startsWith('image/'));
          if (images.length) void choose(images);
          else status.textContent = noImage;
        });
        readClipboard.hidden =
          !window.isSecureContext || typeof navigator.clipboard?.read !== 'function';
        readClipboard.addEventListener('click', async () => {
          if (busy || readingClipboard || !state.admin) return;
          readingClipboard = true;
          readClipboard.disabled = true;
          const request = selection;
          try {
            const entries = await navigator.clipboard.read();
            const files = [];
            for (const entry of entries) {
              const type =
                entry.types.find(
                  (type) => Object.hasOwn(cloud.types, type) && type.startsWith('image/'),
                ) || entry.types.find((type) => type.startsWith('image/'));
              if (!type) continue;
              const blob = await entry.getType(type);
              files.push(
                new File(
                  [blob],
                  `clipboard-${Date.now()}-${files.length}.${cloud.types[type] || 'image'}`,
                  { type },
                ),
              );
            }
            if (
              disposed ||
              !openedBox.isConnected ||
              busy ||
              !state.admin ||
              request !== selection
            )
              return;
            if (files.length) await choose(files);
            else status.textContent = noImage;
          } catch {
            if (!disposed && openedBox.isConnected && request === selection) {
              status.textContent =
                '클립보드를 읽을 수 없어요. 붙여넣기 영역을 길게 눌러 붙여넣거나 파일 선택으로 사진을 선택해 주세요.';
            }
          } finally {
            readingClipboard = false;
            readClipboard.disabled = busy;
          }
        });
      }
      drop.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (!busy) drop.dataset.dragging = '';
      });
      drop.addEventListener('dragleave', () => delete drop.dataset.dragging);
      drop.addEventListener('drop', (event) => {
        event.preventDefault();
        delete drop.dataset.dragging;
        void choose([...event.dataTransfer.files]);
      });
      root.addEventListener('change', (event) => {
        const input = event.target.closest('[data-replace]');
        if (!input) return;
        void choose([...input.files], input.closest('[data-media-id]').dataset.mediaId);
        input.value = '';
      });
      root.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-mutation]');
        if (!button || busy || !state.admin) return;
        const { mutation } = button.dataset;
        if (mutation === 'delete' && !confirm('이 공개 미디어를 삭제할까요?')) return;
        const { mediaId } = button.closest('[data-media-id]').dataset;
        setBusy(true);
        try {
          const clean = await cloud.mutate(item.id, mutation, mediaId);
          const refreshed = await refresh();
          if (state.open === item.id) updateDetail();
          notify(
            !refreshed
              ? '변경사항을 확인하려면 새로고침해 주세요.'
              : clean
                ? '변경사항을 저장했어요.'
                : '변경은 저장됐어요. 이전 파일은 저장소에서 확인해 주세요.',
          );
        } catch (error) {
          status.textContent = message(error);
        } finally {
          setBusy(false);
        }
      });
      search('#confirmMedia').addEventListener('click', () => void commitQueue());
      search('#cancelMedia').addEventListener('click', clear);
      return () => {
        disposed = true;
        clear();
      };
    }

    return { start, markup, bind };
  }

  window.CINELIQ_ADMIN = createAdmin;
})();
