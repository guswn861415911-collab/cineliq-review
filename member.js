(() => {
  'use strict';

  const mediaCloud = window.CINELIQ_CLOUD;
  const identityNames = {
    google: 'Google',
    kakao: '카카오',
  };
  const linkAttemptKey = 'cineliq.identity-link';
  const authModeTitles = {
    login: ['로그인', '로그인'],
    signup: ['회원가입', '가입하기'],
    reset: ['비밀번호 찾기', '재설정 링크 보내기'],
    recovery: ['새 비밀번호 설정', '비밀번호 저장'],
  };
  function setup({ items, navigate, notify, escape, thumbnail }) {
    const memberPage = document.querySelector('#memberPage');
    const memberHeaderButton = document.querySelector('#memberToggle');
    const authDialog = document.querySelector('#memberDialog');
    const authForm = document.querySelector('#memberForm');
    const authStatus = document.querySelector('#memberAuthStatus');
    const favoritesStatus = document.querySelector('#favoriteStatus');
    const favoritesList = document.querySelector('#favoriteList');
    const favoritesSearch = document.querySelector('#favoriteSearch');
    const favoritesSort = document.querySelector('#favoriteSort');
    const logoutButton = document.querySelector('#memberLogout');
    const googleLoginButton = document.querySelector('#memberGoogle');
    const kakaoLoginButton = document.querySelector('#memberKakao');
    const identityPanel = memberPage.querySelector('#memberIdentities');
    const identityStatus = memberPage.querySelector('#memberIdentityStatus');
    const authCallback = new URL(location.href);
    let currentSession = null;
    let authMode = 'login';
    let lookupVersion = 0;
    let areFavoritesLoading = false;
    let savedTechniques = new Map();
    const pendingBookmarkIds = new Set();
    let identities = null;
    let identityBusy = false;
    let identityReadVersion = 0;
    let expectedLinkUserId = null;
    const memberLibrary = window.CINELIQ_LIBRARY({
      items,
      escape,
      favoriteButton: renderBookmarkButton,
      thumbnail,
      notify,
      resetPassword: mediaCloud.members.reset,
    });
    const accountDeletion = window.CINELIQ_DELETION({
      navigate,
      notify,
    });
    const mergeNotice = window.CINELIQ_MERGE_NOTICE?.({
      members: mediaCloud.members,
    });
    const folderSaveDialog = window.CINELIQ_FOLDER_SAVE({
      members: mediaCloud.members,
      escape,
      notify,
      isBookmarked: (id) => savedTechniques.has(id),
      setBookmarked: async (id, wanted) => {
        if (savedTechniques.has(id) === wanted) return;
        const button = document.querySelector(`[data-favorite="${CSS.escape(id)}"]`);
        if (!button || !(await toggleBookmark(button))) throw Error('bookmark_failed');
      },
      openAuth: () =>
        openAuth('login', '로그인하면 개인 폴더에 기법을 저장할 수 있어요.'),
    });
    function renderLinkedAccounts() {
      for (const row of identityPanel.querySelectorAll('[data-identity-provider]')) {
        const provider = row.dataset.identityProvider;
        const linked = identities?.some((identity) => identity.provider === provider);
        const hasBackup = identities?.some(
          (identity) =>
            identity.provider !== provider &&
            Object.hasOwn(identityNames, identity.provider),
        );
        const button = row.querySelector('button');
        row.querySelector('span').textContent = identities
          ? linked
            ? '연결됨'
            : '연결 안 됨'
          : '확인 중';
        button.textContent = linked ? '연결 해제' : '연결하기';
        button.setAttribute(
          'aria-label',
          `${identityNames[provider]} ${button.textContent}`,
        );
        button.disabled = identityBusy || !identities || Boolean(linked && !hasBackup);
      }
    }
    async function refreshIdentities(version) {
      const readVersion = ++identityReadVersion;
      memberPage.querySelector('#retryMemberIdentities').hidden = true;
      try {
        const rows = await verifiedIdentities(currentSession?.user.id);
        if (version !== lookupVersion || readVersion !== identityReadVersion) return null;
        identities = rows;
        memberLibrary.setIdentities(rows);
        return rows;
      } catch {
        if (version === lookupVersion && readVersion === identityReadVersion) {
          identities = null;
          identityStatus.textContent =
            '연결된 계정을 불러오지 못했어요. 다시 시도해 주세요.';
          memberPage.querySelector('#retryMemberIdentities').hidden = false;
        }
        return null;
      } finally {
        if (version === lookupVersion && readVersion === identityReadVersion)
          renderLinkedAccounts();
      }
    }
    function identityError(code, description = '') {
      if (code === 'identity_already_exists')
        return '이미 다른 CINELIQ 계정에 연결된 로그인 방법입니다. 별도로 가입한 계정일 수 있어요. 현재 계정은 유지되며 자동 병합·삭제하지 않습니다. 다른 소셜 계정을 선택하거나 두 계정의 소유권 확인 후 별도 통합 절차가 필요합니다.';
      if (code === 'identity_already_linked')
        return '이미 이 CINELIQ 계정에 연결되어 있어요. 연결 상태를 새로 확인해 주세요.';
      if (['user_already_exists', 'email_exists'].includes(code))
        return '기존 회원 또는 이메일과 충돌했어요. 다른 계정 소유로 단정할 수 없어 연결을 중단했습니다. 계정 상태를 확인해 주세요.';
      if (code === 'identity_session_changed')
        return '로그인한 계정이 변경되어 연결 처리를 중단했어요. 현재 계정과 연결 상태를 다시 확인해 주세요.';
      if (code === 'identity_state_unverified')
        return '서버에서 현재 계정의 연결 상태를 확인하지 못했어요. 다시 확인하기 전에는 성공으로 처리하지 않습니다.';
      if (code === 'provider_unavailable')
        return '선택한 로그인 제공자를 현재 이용할 수 없어요. 기존 로그인 상태는 유지됩니다.';
      if (
        [
          'bad_oauth_state',
          'bad_oauth_callback',
          'flow_state_expired',
          'flow_state_not_found',
          'bad_code_verifier',
        ].includes(code)
      )
        return '계정 연결 인증이 만료되었거나 같은 브라우저에서 복귀하지 못했어요. 원래 로그인한 브라우저에서 연결을 다시 시작해 주세요.';
      if (code === 'manual_linking_disabled')
        return '계정 연결 설정이 아직 활성화되지 않았어요.';
      if (
        code === 'access_denied' ||
        /access[ _]+denied|cancel(?:led|ed)?|denied access/i.test(description)
      ) {
        return '계정 연결을 취소했어요.';
      }
      return '계정 연결을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
    }
    function readLinkAttempt() {
      try {
        const attempt = JSON.parse(sessionStorage.getItem(linkAttemptKey) ?? 'null');
        sessionStorage.removeItem(linkAttemptKey);
        return attempt &&
          typeof attempt.userId === 'string' &&
          Number.isFinite(attempt.startedAt) &&
          Date.now() - attempt.startedAt >= 0 &&
          Date.now() - attempt.startedAt < 30 * 60 * 1000 &&
          Object.hasOwn(identityNames, attempt.provider)
          ? attempt
          : null;
      } catch {
        return null;
      }
    }
    function clearLinkAttempt() {
      expectedLinkUserId = null;
      try {
        sessionStorage.removeItem(linkAttemptKey);
      } catch {}
    }
    async function hasSameSession(version, userId) {
      const latest = await mediaCloud.members.session();
      const same = version === lookupVersion && latest?.user.id === userId;
      if (!same && version === lookupVersion)
        identityStatus.textContent = identityError('identity_session_changed');
      return same;
    }
    async function verifiedIdentities(userId) {
      if (!userId)
        throw Object.assign(Error('No current user'), {
          code: 'identity_session_changed',
        });
      if (mediaCloud.members.identityState)
        return (await mediaCloud.members.identityState(userId)).identities;
      const rows = await mediaCloud.members.identities();
      const latest = await mediaCloud.members.session();
      if (
        latest?.user.id !== userId ||
        rows.some((row) => row.user_id && row.user_id !== userId)
      ) {
        throw Object.assign(Error('Identity owner changed'), {
          code: 'identity_session_changed',
        });
      }
      return rows;
    }
    async function changeIdentity(provider) {
      if (!currentSession || !identities || identityBusy) return;
      const current = lookupVersion;
      const userId = currentSession.user.id;
      const linked = identities.some((identity) => identity.provider === provider);
      identityBusy = true;
      delete identityStatus.dataset.authErrorCode;
      renderLinkedAccounts();
      identityStatus.textContent = linked
        ? '연결을 확인하고 있어요…'
        : '계정 연결을 시작하고 있어요…';
      let leaving = false;
      try {
        const rows = await verifiedIdentities(userId);
        if (!(await hasSameSession(current, userId))) return;
        identities = rows;
        const identity = rows.find((item) => item.provider === provider);
        if (!linked && identity) {
          identityStatus.textContent = '이미 이 CINELIQ 계정에 연결되어 있어요.';
          return;
        }
        if (linked) {
          const enabled = await mediaCloud.members.enabledProviders();
          const backup = rows.find(
            (item) =>
              item.provider !== provider &&
              Object.hasOwn(identityNames, item.provider) &&
              enabled[item.provider],
          );
          if (!identity || !backup) {
            identityStatus.textContent =
              '다시 로그인할 수 있는 다른 소셜 계정을 먼저 연결해 주세요.';
            return;
          }
          if (
            !window.confirm(
              `${identityNames[backup.provider]} 계정으로 다시 로그인할 수 있나요? ${identityNames[provider]} 연결을 해제할까요?`,
            )
          ) {
            identityStatus.textContent = '연결 해제를 취소했어요.';
            return;
          }
          if (!(await hasSameSession(current, userId))) return;
          await mediaCloud.members.unlinkIdentity(identity, userId);
          const updated = await refreshIdentities(current);
          if (updated && (await hasSameSession(current, userId)))
            identityStatus.textContent = updated.some((row) => row.provider === provider)
              ? '서버에서 연결 해제를 확인하지 못했어요. 현재 연결 상태를 다시 확인해 주세요.'
              : '로그인 수단 연결을 해제했어요. 기존 계정과 저장 데이터는 유지됩니다.';
          return;
        }
        const url = await mediaCloud.members.linkIdentity(provider, userId);
        if (!(await hasSameSession(current, userId))) return;
        if (!url) throw Error('No identity authorization URL');
        sessionStorage.setItem(
          linkAttemptKey,
          JSON.stringify({
            provider,
            userId,
            startedAt: Date.now(),
          }),
        );
        location.assign(url);
        leaving = true;
      } catch (error) {
        if (current === lookupVersion) {
          identityStatus.dataset.authErrorCode = error.code || 'unknown';
          const updated = await refreshIdentities(current);
          if (!(await hasSameSession(current, userId))) return;
          identityStatus.textContent =
            !linked && updated?.some((row) => row.provider === provider)
              ? '이미 이 CINELIQ 계정에 연결되어 있어요. 서버에서 연결 상태를 확인했습니다.'
              : linked && error.code !== 'manual_linking_disabled'
                ? '연결을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.'
                : identityError(error.code, error.message);
          if (
            !linked &&
            error.code === 'identity_already_exists' &&
            updated &&
            !updated.some((row) => row.provider === provider)
          )
            mergeNotice?.show(userId);
        }
      } finally {
        if (!leaving && current === lookupVersion) {
          identityBusy = false;
          renderLinkedAccounts();
        }
      }
    }
    function setAuthMode(next) {
      authMode = next;
      authForm.elements.password.value = '';
      const password = authForm.elements.password;
      const email = authForm.elements.email;
      email.closest('label').hidden = next === 'recovery';
      email.required = next !== 'recovery';
      password.closest('label').hidden = next === 'reset';
      password.required = next !== 'reset';
      password.minLength = ['signup', 'recovery'].includes(next) ? 6 : 0;
      password.autocomplete = next === 'login' ? 'current-password' : 'new-password';
      document.querySelector('#memberAuthTitle').textContent = authModeTitles[next][0];
      document.querySelector('#memberSubmit').textContent = authModeTitles[next][1];
      document.querySelector('.member-auth-links').hidden = next === 'recovery';
      googleLoginButton.hidden = kakaoLoginButton.hidden = next !== 'login';
      for (const button of authDialog.querySelectorAll('[data-auth-mode]'))
        button.hidden = button.dataset.authMode === next;
      authStatus.textContent = '';
    }
    function openAuth(next = 'login', message = '') {
      setAuthMode(next);
      authStatus.textContent = message;
      if (!authDialog.open) authDialog.showModal();
      (next === 'recovery'
        ? authForm.elements.password
        : authForm.elements.email
      ).focus();
    }
    function renderBookmarkButton(id) {
      const saved = isBookmarked(id);
      const unavailable = areFavoritesLoading || pendingBookmarkIds.has(id);
      return `<button type="button" class="favorite-toggle" data-favorite="${escape(id)}" aria-label="즐겨찾기" aria-pressed="${saved}" aria-disabled="${unavailable}"><svg class="bookmark-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4z"/></svg></button>`;
    }
    function isBookmarked(id) {
      return savedTechniques.has(id) !== pendingBookmarkIds.has(id);
    }
    function updateBookmarkButton(button) {
      const id = button.dataset.favorite;
      button.setAttribute('aria-pressed', String(isBookmarked(id)));
      button.setAttribute(
        'aria-disabled',
        String(areFavoritesLoading || pendingBookmarkIds.has(id)),
      );
    }
    function renderFavorites() {
      const query = favoritesSearch.value.trim().toLocaleLowerCase();
      const saved = [...savedTechniques]
        .map(([id, date]) => ({
          item: items.get(id),
          date,
        }))
        .filter(
          ({ item }) =>
            item &&
            `${item.ko} ${item.originalKo || ''} ${item.en} ${item.description}`
              .toLocaleLowerCase()
              .includes(query),
        );
      saved.sort(
        favoritesSort.value === 'name'
          ? (a, b) => a.item.ko.localeCompare(b.item.ko, 'ko')
          : (a, b) => b.date.localeCompare(a.date),
      );
      favoritesList.innerHTML = saved
        .map(
          ({ item }) =>
            `<li><button class="member-saved-item" type="button" data-open="${escape(item.id)}"><span class="member-thumbnail">${thumbnail(item)}</span><span><strong>${escape(item.ko)}</strong><small>${escape(item.displaySubtitle || item.en)}</small></span></button>${renderBookmarkButton(item.id)}</li>`,
        )
        .join('');
      document.querySelector('#favoriteEmpty').hidden = Boolean(saved.length);
      document.querySelector('#favoriteEmpty').textContent = query
        ? '검색 결과가 없습니다.'
        : '저장한 기법이 없습니다.';
      document.querySelectorAll('[data-favorite]').forEach(updateBookmarkButton);
      memberLibrary.setFavorites(savedTechniques, !areFavoritesLoading);
    }
    async function sync(next) {
      const user = next?.user;
      const changed = currentSession?.user.id !== user?.id;
      currentSession = next;
      window.CINELIQ_THEME?.sync(user || null);
      window.CINELIQ_A11Y?.sync(user || null);
      memberLibrary.sync(next);
      folderSaveDialog.sync(next);
      accountDeletion.sync(next);
      mergeNotice?.sync(user?.id);
      memberHeaderButton.querySelector('.member-toggle-label').textContent = user
        ? '마이페이지'
        : '로그인';
      memberPage.querySelector('#memberEmail').textContent = user
        ? user.email || '등록된 이메일 없음'
        : '';
      memberPage.querySelector('#memberSignedIn').hidden = !user;
      memberPage.querySelector('#memberGuest').hidden = Boolean(user);
      if (!changed) return;
      const current = ++lookupVersion;
      identities = null;
      identityBusy = false;
      identityStatus.textContent = '';
      renderLinkedAccounts();
      if (user) void refreshIdentities(current);
      savedTechniques = new Map();
      pendingBookmarkIds.clear();
      favoritesSearch.value = '';
      areFavoritesLoading = Boolean(user);
      favoritesStatus.textContent = user ? '즐겨찾기를 불러오는 중입니다.' : '';
      renderFavorites();
      if (!user) return;
      await loadFavorites(user.id, current);
    }
    async function loadFavorites(userId, current) {
      areFavoritesLoading = true;
      memberPage.querySelector('#retryMemberFavorites').hidden = true;
      favoritesStatus.textContent = '즐겨찾기를 불러오는 중입니다.';
      try {
        const rows = await mediaCloud.members.favorites(userId);
        if (current !== lookupVersion) return;
        savedTechniques = new Map(rows.map((row) => [row.technique_id, row.created_at]));
        favoritesStatus.textContent = '';
      } catch (error) {
        if (current === lookupVersion) {
          favoritesStatus.textContent = '즐겨찾기를 불러오지 못했습니다.';
          memberPage.querySelector('#retryMemberFavorites').hidden = false;
        }
        console.warn('CINELIQ favorites:', error);
      } finally {
        if (current === lookupVersion) {
          areFavoritesLoading = false;
          renderFavorites();
        }
      }
    }
    async function toggleBookmark(button) {
      if (!currentSession) {
        openAuth('login', '로그인하면 이 기법을 즐겨찾기에 저장할 수 있습니다.');
        return;
      }
      const id = button.dataset.favorite;
      if (areFavoritesLoading || !items.has(id) || pendingBookmarkIds.has(id)) return;
      const userId = currentSession.user.id;
      const version = lookupVersion;
      const saved = savedTechniques.has(id);
      pendingBookmarkIds.add(id);
      const selector = `[data-favorite="${CSS.escape(id)}"]`;
      document.querySelectorAll(selector).forEach(updateBookmarkButton);
      if (
        !saved &&
        !window.CINELIQ_A11Y?.reducedMotion() &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        button.querySelector('.bookmark-icon').animate(
          [
            {
              transform: 'scale(1)',
            },
            {
              transform: 'scale(1.14)',
              offset: 0.45,
            },
            {
              transform: 'scale(1)',
            },
          ],
          {
            duration: 210,
            easing: 'ease-in-out',
          },
        );
      }
      try {
        await mediaCloud.members[saved ? 'remove' : 'save'](userId, id);
        if (version !== lookupVersion) return;
        pendingBookmarkIds.delete(id);
        if (saved) savedTechniques.delete(id);
        else savedTechniques.set(id, new Date().toISOString());
        renderFavorites();
        notify(saved ? '즐겨찾기를 해제했습니다.' : '즐겨찾기에 저장했습니다.');
        return true;
      } catch (error) {
        if (version === lookupVersion) {
          pendingBookmarkIds.delete(id);
          document.querySelectorAll(selector).forEach(updateBookmarkButton);
          notify('즐겨찾기를 변경하지 못했습니다.');
        }
        console.warn('CINELIQ favorite update:', error);
      }
    }
    function showAuthError(error) {
      console.warn('CINELIQ member authentication:', error.code ?? error.status);
      const messages = {
        invalid_credentials: '이메일 또는 비밀번호를 확인해 주세요.',
        email_not_confirmed: '가입 확인 메일의 링크를 먼저 열어 주세요.',
        weak_password: '더 긴 비밀번호를 입력해 주세요.',
        over_email_send_rate_limit:
          '메일 발송 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
        validation_failed: '입력한 이메일과 비밀번호를 확인해 주세요.',
      };
      authStatus.textContent =
        messages[error.code] ?? '요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    }
    memberHeaderButton.addEventListener('click', () =>
      currentSession ? navigate('my') : openAuth(),
    );
    memberPage.querySelector('#retryMemberFavorites').addEventListener('click', () => {
      if (currentSession && !areFavoritesLoading)
        void loadFavorites(currentSession.user.id, lookupVersion);
    });
    memberPage.querySelector('#retryMemberIdentities').addEventListener('click', () => {
      if (currentSession && !identityBusy) void refreshIdentities(lookupVersion);
    });
    identityPanel.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      const row = button.closest('[data-identity-provider]');
      if (row) void changeIdentity(row.dataset.identityProvider);
    });
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted || !identityBusy) return;
      readLinkAttempt();
      identityBusy = false;
      identityStatus.textContent =
        '계정 연결이 완료되지 않았어요. 다시 시도할 수 있어요.';
      renderLinkedAccounts();
    });
    document
      .querySelector('#memberGuestLogin')
      .addEventListener('click', () => openAuth());
    document
      .querySelector('#closeMemberAuth')
      .addEventListener('click', () => authDialog.close());
    authDialog.addEventListener('close', () => {
      authForm.reset();
      setAuthMode('login');
    });
    authDialog
      .querySelectorAll('[data-auth-mode]')
      .forEach((button) =>
        button.addEventListener('click', () => setAuthMode(button.dataset.authMode)),
      );
    favoritesSearch.addEventListener('input', renderFavorites);
    favoritesSort.addEventListener('change', renderFavorites);
    document.addEventListener(
      'click',
      (event) => {
        const folderButton = event.target.closest('[data-save-folders]');
        if (folderButton) {
          event.stopPropagation();
          const item = items.get(folderButton.dataset.saveFolders);
          if (item) void folderSaveDialog.open(item);
          return;
        }
        const button = event.target.closest('[data-favorite]');
        if (!button) return;
        event.stopPropagation();
        const item = items.get(button.dataset.favorite);
        if (item && !areFavoritesLoading && !pendingBookmarkIds.has(item.id))
          void folderSaveDialog.open(item);
      },
      true,
    );
    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      try {
        await mediaCloud.logout();
        clearLinkAttempt();
        void sync(null);
        navigate('hero');
      } catch (error) {
        console.warn('CINELIQ member logout:', error.code ?? error.status);
        notify('로그아웃하지 못했습니다. 다시 시도해 주세요.');
      } finally {
        logoutButton.disabled = false;
      }
    });
    async function startSocialLogin(provider) {
      googleLoginButton.disabled = kakaoLoginButton.disabled = true;
      authStatus.textContent = '';
      clearLinkAttempt();
      try {
        await mediaCloud.members[provider]();
      } catch (error) {
        if (error.code === 'google_unavailable') {
          authStatus.textContent =
            'Google 로그인 연결 설정이 필요합니다. 이메일로 로그인할 수 있습니다.';
        } else if (provider === 'kakao') {
          authStatus.textContent =
            '카카오 로그인을 시작하지 못했어요. 잠시 후 다시 시도하거나 다른 로그인 방법을 이용해 주세요.';
        } else showAuthError(error);
      } finally {
        googleLoginButton.disabled = kakaoLoginButton.disabled = !ready;
      }
    }
    googleLoginButton.addEventListener('click', () => startSocialLogin('google'));
    kakaoLoginButton.addEventListener('click', () => startSocialLogin('kakao'));
    let ready = false;
    authForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = document.querySelector('#memberSubmit');
      if (!ready || submit.disabled) return;
      clearLinkAttempt();
      submit.disabled = true;
      authStatus.textContent = '';
      const email = authForm.elements.email.value.trim();
      const password = authForm.elements.password.value;
      try {
        if (authMode === 'reset') {
          await mediaCloud.members.reset(email);
          authStatus.textContent =
            '계정이 등록되어 있다면 비밀번호 재설정 메일이 발송됩니다.';
        } else if (authMode === 'recovery') {
          await mediaCloud.members.updatePassword(password);
          authDialog.close();
          notify('비밀번호를 변경했습니다.');
        } else {
          const data = await mediaCloud.members[authMode](email, password);
          if (data.session) {
            void sync(data.session);
            authDialog.close();
          } else {
            authStatus.textContent = '이메일에서 가입 확인 링크를 열어 주세요.';
          }
        }
      } catch (error) {
        showAuthError(error);
      } finally {
        authForm.elements.password.value = '';
        submit.disabled = !ready;
      }
    });
    async function start() {
      ready = true;
      document.querySelector('#memberSubmit').disabled = false;
      googleLoginButton.disabled = kakaoLoginButton.disabled = false;
      const fragment = new URLSearchParams(authCallback.hash.slice(1));
      const authError = authCallback.searchParams.get('error') || fragment.get('error');
      const errorCode =
        authCallback.searchParams.get('error_code') || fragment.get('error_code');
      const errorDescription =
        authCallback.searchParams.get('error_description') ||
        fragment.get('error_description') ||
        '';
      const attempt = readLinkAttempt();
      const linkReturn = attempt && (authError || authCallback.searchParams.has('code'));
      expectedLinkUserId = linkReturn ? attempt.userId : null;
      mediaCloud.onAuthChange((event, next) => {
        if (expectedLinkUserId && next && next.user.id !== expectedLinkUserId) {
          notify(
            '연결 전후 로그인 UUID가 달라 회원 화면 갱신을 중단했어요. 원래 계정을 다시 확인해 주세요.',
          );
          return;
        }
        void sync(next);
        if (event === 'PASSWORD_RECOVERY' && next) openAuth('recovery');
      });
      const current = await mediaCloud.members.session();
      if (linkReturn && current && current.user.id !== attempt.userId) {
        openAuth(
          'login',
          '연결 전후 로그인 계정이 달라 결과를 확인할 수 없어요. 연결 성공으로 처리하지 않았습니다. 원래 계정으로 다시 로그인해 주세요.',
        );
        return;
      }
      void sync(current);
      if (accountDeletion.restore(current, authCallback)) return;
      if (authError) {
        const callback = new URL(location.href);
        callback.searchParams.delete('code');
        ['error', 'error_code', 'error_description'].forEach((key) =>
          callback.searchParams.delete(key),
        );
        if (callback.hash.startsWith('#error=')) callback.hash = '';
        history.replaceState(history.state, '', callback.href);
        if (linkReturn) {
          identityStatus.dataset.authErrorCode = errorCode || authError;
          const message = identityError(errorCode || authError, errorDescription);
          if (current?.user.id === attempt.userId) {
            navigate('my');
            memberLibrary.openAccounts();
            const rows = await refreshIdentities(lookupVersion);
            if (currentSession?.user.id !== attempt.userId) return;
            identityStatus.textContent = rows?.some(
              (row) => row.provider === attempt.provider,
            )
              ? '이미 이 CINELIQ 계정에 연결되어 있어요. 서버에서 현재 UUID와 연결 상태를 확인했습니다.'
              : rows
                ? message
                : '연결 결과를 서버에서 확인하지 못했어요. 기존 계정 상태를 다시 확인해 주세요.';
            if (
              rows &&
              !rows.some((row) => row.provider === attempt.provider) &&
              errorCode === 'identity_already_exists'
            )
              mergeNotice?.show(attempt.userId);
          } else notify(message);
          expectedLinkUserId = null;
          return;
        }
        const cancelled =
          authError === 'access_denied' ||
          /access[ _]+denied|cancel(?:led|ed)?|denied access/i.test(errorDescription);
        openAuth(
          'login',
          cancelled
            ? '로그인이 취소됐어요. 원하시면 다시 시도해 주세요.'
            : '인증 링크가 만료되었거나 로그인을 완료하지 못했어요. 다시 시도하거나 다른 로그인 방법을 이용해 주세요.',
        );
      } else if (linkReturn) {
        if (current?.user.id !== attempt.userId) {
          notify('원래 로그인한 계정을 확인할 수 없어 연결 결과를 확인하지 못했어요.');
          return;
        }
        const rows = await refreshIdentities(lookupVersion);
        if (currentSession?.user.id !== attempt.userId) return;
        navigate('my');
        memberLibrary.openAccounts();
        identityStatus.textContent = rows?.some(
          (identity) => identity.provider === attempt.provider,
        )
          ? `${identityNames[attempt.provider]} 계정을 연결했어요.`
          : '계정 연결 결과를 확인하지 못했어요. 다시 로그인하기 전에 연결 상태를 확인해 주세요.';
        expectedLinkUserId = null;
      }
    }
    return {
      start,
      favoriteButton: renderBookmarkButton,
      folderButton: folderSaveDialog.button,
      refreshMedia: () => {
        renderFavorites();
        memberLibrary.refreshMedia();
      },
    };
  }
  window.CINELIQ_MEMBER = setup;
})();
