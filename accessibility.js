(() => {
  'use strict';

  const defaultPreferences = {
    textSize: 'normal',
    contrast: false,
    motion: false,
    links: false,
    captions: false,
  };
  function normalizePreferences(value = {}) {
    return {
      textSize: ['normal', 'large', 'xlarge'].includes(value?.textSize)
        ? value.textSize
        : 'normal',
      contrast: value?.contrast === true,
      motion: value?.motion === true,
      links: value?.links === true,
      captions: value?.captions === true,
    };
  }
  const readStoredPreferences = (storageKey) => {
    try {
      return normalizePreferences(JSON.parse(localStorage.getItem(storageKey)) || {});
    } catch {
      return {
        ...defaultPreferences,
      };
    }
  };
  const storePreferences = (storageKey, value) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {}
  };
  let currentUser = null,
    sessionVersion = 0,
    isSaving = false,
    preferences = readStoredPreferences('cineliq.a11y.last');
  const systemMotionPreference = matchMedia('(prefers-reduced-motion: reduce)'),
    observedVideos = new WeakSet(),
    automaticallyEnabledCaptions = new WeakMap();
  const getStorageKey = () =>
    currentUser ? 'cineliq.a11y.' + currentUser.id : 'cineliq.a11y.guest';
  const shouldReduceMotion = () => systemMotionPreference.matches || preferences.motion;
  function applyVideoCaptions(video) {
    const tracks = [...video.textTracks].filter((track) =>
      ['captions', 'subtitles'].includes(track.kind),
    );
    if (!preferences.captions) {
      const previousTrack = automaticallyEnabledCaptions.get(video);
      if (previousTrack?.mode === 'showing') previousTrack.mode = 'disabled';
      automaticallyEnabledCaptions.delete(video);
      return;
    }
    if (tracks.length === 0) return;
    const preferredTrack =
      tracks.find((track) => track.language?.startsWith('ko')) || tracks[0];
    const captionsAlreadyShowing = tracks.some((track) => track.mode === 'showing');
    if (captionsAlreadyShowing) return;
    preferredTrack.mode = 'showing';
    automaticallyEnabledCaptions.set(video, preferredTrack);
  }
  function updateVideoCaptions() {
    document.querySelectorAll('video').forEach((video) => {
      if (!observedVideos.has(video)) {
        observedVideos.add(video);
        video.addEventListener('loadedmetadata', () => applyVideoCaptions(video));
        video.textTracks.addEventListener('addtrack', () => applyVideoCaptions(video));
      }
      applyVideoCaptions(video);
    });
  }
  function applyAccessibilityPreferences() {
    storePreferences('cineliq.a11y.last', preferences);
    const root = document.documentElement;
    root.dataset.textSize = preferences.textSize;
    root.dataset.highContrast = String(preferences.contrast);
    root.dataset.reduceMotion = String(shouldReduceMotion());
    root.dataset.linkUnderlines = String(preferences.links);
    document.querySelectorAll('[data-a11y]').forEach((input) => {
      const value = preferences[input.dataset.a11y];
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
      input.disabled = isSaving;
    });
    if (shouldReduceMotion())
      document.getAnimations?.().forEach((animation) => animation.cancel());
    updateVideoCaptions();
    window.dispatchEvent(new Event('cineliq-a11y-change'));
  }
  async function changeAccessibilityPreference(keyName, value) {
    if (isSaving || !Object.hasOwn(defaultPreferences, keyName)) return;
    const requestVersion = sessionVersion,
      userId = currentUser?.id,
      previousPreferences = preferences,
      storageKey = getStorageKey();
    preferences = normalizePreferences({
      ...preferences,
      [keyName]: value,
    });
    isSaving = true;
    applyAccessibilityPreferences();
    const status = document.querySelector('#accessibilityStatus');
    try {
      if (userId) {
        const updatedUser = await window.CINELIQ_CLOUD.members.updateAccessibility(
          preferences,
          userId,
        );
        if (requestVersion !== sessionVersion) return;
        currentUser = updatedUser;
      }
      if (requestVersion === sessionVersion) {
        storePreferences(storageKey, preferences);
        if (status) status.textContent = '접근성 설정을 저장했어요.';
      }
    } catch {
      if (requestVersion === sessionVersion) {
        preferences = previousPreferences;
        if (status) status.textContent = '저장하지 못해 이전 접근성 설정으로 되돌렸어요.';
      }
    } finally {
      if (requestVersion === sessionVersion) {
        isSaving = false;
        applyAccessibilityPreferences();
      }
    }
  }
  window.CINELIQ_A11Y = {
    reducedMotion: shouldReduceMotion,
    sync(nextUser) {
      const userChanged = currentUser?.id !== nextUser?.id;
      if (userChanged) {
        sessionVersion++;
        isSaving = false;
      }
      currentUser = nextUser;
      preferences = currentUser?.user_metadata?.cineliq_accessibility
        ? normalizePreferences(currentUser.user_metadata.cineliq_accessibility)
        : readStoredPreferences(getStorageKey());
      applyAccessibilityPreferences();
    },
    change: changeAccessibilityPreference,
  };
  systemMotionPreference.addEventListener('change', applyAccessibilityPreferences);
  document.addEventListener('DOMContentLoaded', () => {
    document
      .querySelectorAll('[data-a11y]')
      .forEach((input) =>
        input.addEventListener(
          'change',
          () =>
            void changeAccessibilityPreference(
              input.dataset.a11y,
              input.type === 'checkbox' ? input.checked : input.value,
            ),
        ),
      );
    new MutationObserver(updateVideoCaptions).observe(document.body, {
      childList: true,
      subtree: true,
    });
    applyAccessibilityPreferences();
  });
  applyAccessibilityPreferences();
})();
