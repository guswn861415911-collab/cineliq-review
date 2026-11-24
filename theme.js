(() => {
  'use strict';

  const documentRoot = document.documentElement,
    systemColorScheme = matchMedia('(prefers-color-scheme: dark)'),
    isSupportedTheme = (value) => ['dark', 'light', 'system'].includes(value);
  const readStoredTheme = (storageKey) => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };
  const storeTheme = (storageKey, value) => {
    try {
      localStorage.setItem(storageKey, value);
    } catch {}
  };
  let currentUser = null,
    sessionVersion = 0,
    isSaving = false,
    selectedTheme =
      readStoredTheme('cineliq.theme.last') ||
      readStoredTheme('cineliq.theme.guest') ||
      'dark';
  if (!isSupportedTheme(selectedTheme)) selectedTheme = 'dark';
  const getStorageKey = () =>
    currentUser ? 'cineliq.theme.' + currentUser.id : 'cineliq.theme.guest';
  function applyTheme() {
    storeTheme('cineliq.theme.last', selectedTheme);
    let resolvedTheme = selectedTheme;
    if (selectedTheme === 'system') {
      resolvedTheme = systemColorScheme.matches ? 'dark' : 'light';
    }
    documentRoot.dataset.theme = resolvedTheme;
    documentRoot.dataset.themePreference = selectedTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        documentRoot.dataset.theme === 'dark' ? '#0b0b0b' : '#fafafa',
      );
    document.querySelectorAll('[data-theme-control]').forEach((control) => {
      control.value = selectedTheme;
      control.disabled = isSaving;
    });
  }
  async function changeTheme(nextTheme) {
    if (!isSupportedTheme(nextTheme) || isSaving) return;
    const requestVersion = sessionVersion,
      userId = currentUser?.id,
      previousTheme = selectedTheme,
      storageKey = getStorageKey();
    selectedTheme = nextTheme;
    isSaving = true;
    applyTheme();
    try {
      if (userId) {
        const updatedUser = await window.CINELIQ_CLOUD.members.updateTheme(
          nextTheme,
          userId,
        );
        if (requestVersion !== sessionVersion) return;
        currentUser = updatedUser;
      }
      if (requestVersion === sessionVersion) {
        storeTheme(storageKey, nextTheme);
        document
          .querySelector('#themeStatus')
          ?.replaceChildren(document.createTextNode('화면 모드를 저장했어요.'));
      }
    } catch {
      if (requestVersion === sessionVersion) {
        selectedTheme = previousTheme;
        document
          .querySelector('#themeStatus')
          ?.replaceChildren(
            document.createTextNode('저장하지 못해 이전 화면 모드로 되돌렸어요.'),
          );
      }
    } finally {
      if (requestVersion === sessionVersion) {
        isSaving = false;
        applyTheme();
      }
    }
  }
  window.CINELIQ_THEME = {
    sync(nextUser) {
      const userChanged = currentUser?.id !== nextUser?.id;
      if (userChanged) {
        sessionVersion++;
        isSaving = false;
      }
      currentUser = nextUser;
      const accountTheme = currentUser?.user_metadata?.cineliq_preferences?.theme;
      if (isSupportedTheme(accountTheme)) {
        selectedTheme = accountTheme;
      } else {
        selectedTheme =
          readStoredTheme(getStorageKey()) ||
          readStoredTheme('cineliq.theme.guest') ||
          'dark';
      }
      if (!isSupportedTheme(selectedTheme)) selectedTheme = 'dark';
      applyTheme();
    },
    change: changeTheme,
  };
  systemColorScheme.addEventListener('change', () => {
    if (selectedTheme === 'system') applyTheme();
  });
  document.addEventListener('DOMContentLoaded', () => {
    document
      .querySelectorAll('[data-theme-control]')
      .forEach((control) =>
        control.addEventListener('change', () => void changeTheme(control.value)),
      );
    applyTheme();
  });
  applyTheme();
})();
