(() => {
  'use strict';
  window.CINELIQ_DELETION = ({ navigate, notify }) => {
    const cloud = window.CINELIQ_CLOUD;
    const root = document.querySelector('#memberDeletion');
    const find = (selector) => root.querySelector(selector);
    const status = find('#memberDeletionStatus');
    const submit = find('#confirmMemberDeletion');
    const consent = find('#memberDeletionConsent');
    const phrase = find('#memberDeletionPhrase');
    const password = find('#memberDeletionPassword');
    const pendingKey = 'cineliq-account-deletion-reauth-v1';
    let user = null,
      busy = false,
      verified = false,
      blocked = false,
      version = 0;
    const messages = {
      authentication_required:
        '로그인 세션을 확인할 수 없습니다. 다시 로그인한 뒤 탈퇴 안내를 확인해 주세요.',
      account_changed:
        '인증한 계정이 원래 계정과 다릅니다. 계정을 삭제하지 않았습니다. 원래 계정으로 다시 로그인해 주세요.',
      support_required:
        '관리자·업로드 소유 계정이거나 별도 확인이 필요한 계정입니다. 공통 자료 보호를 위해 자동 탈퇴를 중단했습니다. 문의하기로 연락해 주세요.',
      recent_login_required:
        '안전을 위해 최근 5분 이내의 로그인이 필요합니다. 아래에서 다시 인증해 주세요.',
      verification_unavailable:
        '탈퇴 안전 확인을 사용할 수 없습니다. 계정은 삭제하지 않았습니다. 잠시 후 다시 확인해 주세요.',
      deletion_unconfirmed:
        '삭제 결과를 확인하지 못했습니다. 완료 또는 로그아웃으로 처리하지 않았습니다. 다시 확인하거나 로그인 상태를 확인한 뒤 문의해 주세요.',
    };
    function paint() {
      submit.disabled =
        !user ||
        busy ||
        blocked ||
        !verified ||
        !consent.checked ||
        phrase.value.trim() !== 'CINELIQ 탈퇴';
      root
        .querySelectorAll('[data-deletion-reauth],#checkMemberDeletion')
        .forEach((button) => (button.disabled = !user || busy || blocked));
      consent.disabled = phrase.disabled = busy || blocked;
      find('#memberDeletionIdentity').textContent = user
        ? (user.email || '이메일 없는 소셜 회원') + ' · ' + user.id
        : '';
      find('#memberDeletionEmailAuth').hidden = !user?.identities?.some(
        (identity) => identity.provider === 'email',
      );
      for (const provider of ['google', 'kakao'])
        find(`[data-deletion-reauth="${provider}"]`).hidden = !user?.identities?.some(
          (identity) => identity.provider === provider,
        );
    }
    function reset() {
      verified = false;
      consent.checked = false;
      phrase.value = '';
      password.value = '';
      paint();
    }
    async function check() {
      if (!user || busy || blocked) return;
      const id = user.id,
        current = version;
      busy = true;
      reset();
      status.textContent = '최근 로그인과 탈퇴 가능 여부를 확인하고 있습니다.';
      try {
        await cloud.members.deletionRequest('check', id);
        if (current !== version) return;
        verified = true;
        status.textContent =
          '탈퇴 가능 여부를 확인했습니다. 삭제 안내를 읽고 아래 최종 확인을 완료해 주세요.';
      } catch (error) {
        if (current === version) {
          status.textContent = messages[error.code] || messages.deletion_unconfirmed;
          if (error.code === 'account_changed') blocked = true;
        }
      } finally {
        if (current === version) {
          busy = false;
          paint();
        }
      }
    }
    root.querySelectorAll('[data-deletion-reauth]').forEach((button) =>
      button.addEventListener('click', async () => {
        if (!user || busy || blocked) return;
        const id = user.id,
          current = version,
          provider = button.dataset.deletionReauth,
          value = password.value;
        if (provider === 'email' && !value) {
          status.textContent = '현재 비밀번호를 입력해 주세요.';
          password.focus();
          return;
        }
        busy = true;
        reset();
        status.textContent = '다시 인증하고 있습니다.';
        try {
          if (provider !== 'email')
            sessionStorage.setItem(
              pendingKey,
              JSON.stringify({ userId: id, started: Date.now() }),
            );
          const url = await cloud.members.deletionReauthenticate(provider, value, id);
          if (current !== version) return;
          if (url) {
            location.assign(url);
            return;
          }
          busy = false;
          await check();
        } catch (error) {
          sessionStorage.removeItem(pendingKey);
          if (current === version) {
            status.textContent =
              messages[error.code] ||
              '다시 인증하지 못했습니다. 비밀번호 또는 로그인 상태를 확인해 주세요.';
            if (error.code === 'account_changed') blocked = true;
          }
        } finally {
          password.value = '';
          if (current === version) {
            busy = false;
            paint();
          }
        }
      }),
    );
    find('#checkMemberDeletion').addEventListener('click', check);
    consent.addEventListener('change', paint);
    phrase.addEventListener('input', paint);
    find('#memberDeletionForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submit.disabled || !user) return;
      const id = user.id,
        current = version;
      if (
        !window.confirm(
          'CINELIQ 회원 계정과 즐겨찾기·개인 폴더를 영구 삭제합니다. 복구할 수 없습니다. 정말 탈퇴하시겠습니까?',
        )
      )
        return;
      busy = true;
      paint();
      status.textContent = '회원 탈퇴를 처리하고 있습니다. 이 화면을 닫지 마세요.';
      try {
        await cloud.members.deletionRequest('delete', id);
        if (current !== version && user?.id && user.id !== id) return;
        sessionStorage.removeItem(pendingKey);
        try {
          await cloud.logout();
        } catch {
          const ref = new URL(window.CINELIQ_MEDIA_CONFIG.projectUrl).hostname.split(
            '.',
          )[0];
          localStorage.removeItem(`sb-${ref}-auth-token`);
        }
        notify('회원 탈퇴가 완료되었습니다.');
        const home = new URL(location.href);
        home.search = '';
        home.hash = 'home';
        location.replace(home.href);
      } catch (error) {
        if (current === version) {
          verified = false;
          status.textContent = messages[error.code] || messages.deletion_unconfirmed;
        }
      } finally {
        if (current === version) {
          busy = false;
          paint();
        }
      }
    });
    return {
      sync(session) {
        if (user?.id !== session?.user.id) {
          version++;
          busy = false;
          blocked = false;
          user = session?.user || null;
          status.textContent = '';
          reset();
        } else {
          user = session?.user || null;
          paint();
        }
      },
      restore(session, callback) {
        let attempt;
        try {
          attempt = JSON.parse(sessionStorage.getItem(pendingKey));
        } catch {}
        if (!attempt) return false;
        sessionStorage.removeItem(pendingKey);
        const fragment = new URLSearchParams(callback.hash.slice(1));
        const error = callback.searchParams.get('error') || fragment.get('error');
        navigate('my');
        const destination = new URL(location.href);
        ['code', 'error', 'error_code', 'error_description'].forEach((key) =>
          destination.searchParams.delete(key),
        );
        destination.hash = 'my/delete-account';
        history.replaceState(null, '', destination.href);
        window.dispatchEvent(new PopStateEvent('popstate'));
        reset();
        if (session?.user.id !== attempt.userId) {
          blocked = true;
          status.textContent = messages.account_changed;
          paint();
          return true;
        }
        if (
          error ||
          !Number.isFinite(attempt.started) ||
          Date.now() - attempt.started > 10 * 60 * 1000
        ) {
          status.textContent =
            '인증이 취소되었거나 시간이 만료되었습니다. 계정은 삭제하지 않았습니다.';
          return true;
        }
        void check();
        return true;
      },
    };
  };
})();
