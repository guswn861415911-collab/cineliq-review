(() => {
  'use strict';

  const folderIconPath =
    'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z';
  window.CINELIQ_FOLDER_SAVE = ({
    members: memberApi,
    escape: escapeHtml,
    openAuth,
    notify,
    isBookmarked,
    setBookmarked,
  }) => {
    const saveDialog = document.createElement('dialog');
    saveDialog.className = 'folder-save-dialog';
    saveDialog.setAttribute('aria-labelledby', 'folderSaveTitle');
    saveDialog.innerHTML =
      '<form><h2 id="folderSaveTitle">기법 저장</h2><p class="folder-save-technique"></p><label class="folder-save-bookmark"><input type="checkbox" data-save-bookmark> 즐겨찾기에 저장</label><p>저장할 폴더를 선택하세요.</p><div class="folder-save-list"></div><div class="folder-save-create"><label>새 폴더<input maxlength="60" autocomplete="off" placeholder="폴더 이름"></label><button type="button" data-folder-create>만들고 선택</button></div><p role="status" aria-live="polite"></p><div class="member-dialog-actions"><button type="button" data-folder-cancel>취소</button><button type="submit" data-folder-commit disabled>저장</button></div></form>';
    document.body.append(saveDialog);
    let currentUser = null,
      sessionVersion = 0,
      activeSaveRequest = null,
      isSaving = false,
      previouslyFocusedElement = null;
    const folderList = saveDialog.querySelector('.folder-save-list'),
      saveStatus = saveDialog.querySelector('[role="status"]'),
      saveButton = saveDialog.querySelector('[type="submit"]');
    function closeSaveDialog() {
      if (!isSaving) {
        activeSaveRequest = null;
        saveDialog.close();
        previouslyFocusedElement?.focus({
          preventScroll: true,
        });
      }
    }
    saveDialog.querySelector('[data-folder-cancel]').onclick = closeSaveDialog;
    saveDialog.addEventListener('cancel', (event) => {
      if (isSaving) event.preventDefault();
      else activeSaveRequest = null;
    });
    function setSaveBusy(value) {
      isSaving = value;
      saveDialog
        .querySelectorAll('input,button')
        .forEach((control) => (control.disabled = value));
    }
    async function verifySaveSession(saveRequest) {
      if (
        !currentUser ||
        saveRequest.version !== sessionVersion ||
        saveRequest.userId !== currentUser.id
      )
        throw Error('session_changed');
      await memberApi.identityState(saveRequest.userId);
      if (saveRequest.version !== sessionVersion) throw Error('session_changed');
    }
    function renderFolderChoice(folder, checked) {
      return `<label><input type="checkbox" value="${escapeHtml(folder.id)}" ${checked ? 'checked' : ''}><span>${escapeHtml(folder.name)}</span></label>`;
    }
    async function openSaveDialog(technique) {
      if (!currentUser) {
        openAuth();
        return;
      }
      if (isSaving) return;
      previouslyFocusedElement = document.activeElement;
      const saveRequest = {
        item: technique,
        userId: currentUser.id,
        version: sessionVersion,
        expected: [],
      };
      activeSaveRequest = saveRequest;
      saveDialog.querySelector('[data-save-bookmark]').checked = true;
      folderList.replaceChildren();
      saveStatus.textContent = '폴더를 불러오고 있어요…';
      saveButton.disabled = true;
      saveDialog.querySelector('.folder-save-create input').value = '';
      saveDialog.querySelector('.folder-save-technique').textContent = technique.ko;
      if (!saveDialog.open) saveDialog.showModal();
      setSaveBusy(true);
      try {
        await verifySaveSession(saveRequest);
        if (!(await memberApi.folderStorageReady())) throw Error('not_ready');
        const memberLibrary = await memberApi.library(saveRequest.userId);
        await verifySaveSession(saveRequest);
        if (activeSaveRequest !== saveRequest) return;
        saveRequest.expected = memberLibrary.entries
          .filter((entry) => entry.technique_id === technique.id)
          .map((entry) => entry.folder_id);
        folderList.innerHTML =
          memberLibrary.folders
            .map((folder) =>
              renderFolderChoice(folder, saveRequest.expected.includes(folder.id)),
            )
            .join('') || '<p>새 폴더를 만들어 저장할 수 있어요.</p>';
        saveDialog.querySelector('[data-save-bookmark]').checked =
          isBookmarked(technique.id) || !saveRequest.expected.length;
        saveStatus.textContent =
          '즐겨찾기와 폴더를 각각 선택할 수 있어요. 체크 해제한 폴더에서만 제거됩니다.';
        saveRequest.ready = true;
      } catch {
        if (activeSaveRequest === saveRequest)
          saveStatus.textContent =
            '폴더 저장 기능을 준비 중이거나 목록을 불러오지 못했어요. 기존 데이터는 변경하지 않았습니다.';
      } finally {
        if (activeSaveRequest === saveRequest) {
          setSaveBusy(false);
          saveButton.disabled = !saveRequest.ready;
          saveDialog.querySelector('[data-folder-create]').disabled = !saveRequest.ready;
          (
            folderList.querySelector('input') ||
            saveDialog.querySelector('[data-folder-cancel]')
          ).focus();
        }
      }
    }
    saveDialog.querySelector('[data-folder-create]').onclick = async () => {
      const saveRequest = activeSaveRequest;
      if (!saveRequest?.ready || isSaving) return;
      const folderName = saveDialog
        .querySelector('.folder-save-create input')
        .value.trim();
      if (!folderName || [...folderName].length > 60) {
        saveStatus.textContent = '폴더 이름을 1~60자로 입력해 주세요.';
        return;
      }
      setSaveBusy(true);
      try {
        await verifySaveSession(saveRequest);
        const folder = await memberApi.createFolder(folderName, saveRequest.userId);
        await verifySaveSession(saveRequest);
        if (activeSaveRequest !== saveRequest) return;
        folderList.querySelector('p')?.remove();
        folderList.insertAdjacentHTML('beforeend', renderFolderChoice(folder, true));
        saveDialog.querySelector('.folder-save-create input').value = '';
        saveStatus.textContent =
          '폴더를 만들고 선택했어요. 저장을 눌러 기법을 추가하세요.';
        window.dispatchEvent(new Event('cineliq-library-changed'));
      } catch {
        if (activeSaveRequest === saveRequest)
          saveStatus.textContent =
            '폴더를 만들지 못했어요. 같은 이름이 있는지 확인해 주세요.';
      } finally {
        if (activeSaveRequest === saveRequest) setSaveBusy(false);
      }
    };
    saveDialog.querySelector('form').onsubmit = async (event) => {
      event.preventDefault();
      const saveRequest = activeSaveRequest;
      if (!saveRequest?.ready || isSaving) return;
      setSaveBusy(true);
      const selectedFolderIds = [...folderList.querySelectorAll('input:checked')].map(
        (control) => control.value,
      );
      try {
        await verifySaveSession(saveRequest);
        await setBookmarked(
          saveRequest.item.id,
          saveDialog.querySelector('[data-save-bookmark]').checked,
        );
        await verifySaveSession(saveRequest);
        await memberApi.setTechniqueFolders(
          saveRequest.item.id,
          selectedFolderIds,
          saveRequest.expected,
        );
        await verifySaveSession(saveRequest);
        if (activeSaveRequest !== saveRequest) return;
        notify('저장 상태를 반영했어요.');
        window.dispatchEvent(new Event('cineliq-library-changed'));
        setSaveBusy(false);
        closeSaveDialog();
      } catch {
        if (activeSaveRequest === saveRequest) {
          saveStatus.textContent =
            '일부 저장이 완료되지 않았어요. 즐겨찾기는 이미 반영됐을 수 있습니다. 취소 후 다시 열어 현재 상태를 확인해 주세요.';
          saveRequest.ready = false;
        }
      } finally {
        if (activeSaveRequest === saveRequest) {
          setSaveBusy(false);
          saveButton.disabled = !saveRequest.ready;
        }
      }
    };
    return {
      open: openSaveDialog,
      sync(next) {
        const nextUser = next?.user ?? null;
        if (currentUser?.id !== nextUser?.id) {
          sessionVersion++;
          activeSaveRequest = null;
          isSaving = false;
          saveDialog.close();
        }
        currentUser = nextUser;
      },
      button: (id) =>
        `<button class="folder-save-button" type="button" data-save-folders="${id}" aria-label="개인 폴더에 저장" title="개인 폴더에 저장"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${folderIconPath}"/></svg></button>`,
    };
  };
})();
