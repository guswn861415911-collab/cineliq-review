(() => {
  'use strict';
  const config = window.CINELIQ_MEDIA_CONFIG;
  const configured =
    /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(config.projectUrl) &&
    /^sb_publishable_[a-zA-Z0-9_-]+$/.test(config.publishableKey);
  const types = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };
  const megabyte = 1024 * 1024;
  const limits = { image: 8 * megabyte, video: 40 * megabyte };
  const bucket = 'cineliq-media';
  const pageSize = 100;
  const signedLifetime = 3600;
  let client;
  let uploader;

  function unwrap(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  async function connect() {
    const { createClient } =
      await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.102.0/+esm');
    client = createClient(config.projectUrl, config.publishableKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        autoRefreshToken: true,
        persistSession: true,
      },
    });
  }

  async function canWrite() {
    const { session } = unwrap(await client.auth.getSession());
    return Boolean(session && unwrap(await client.rpc('cineliq_can_write')));
  }

  async function login(email, password) {
    const { session } = unwrap(await client.auth.getSession());
    if (session) {
      if (await canWrite()) return;
      throw Error('관리자 계정으로 전환하려면 마이페이지에서 먼저 로그아웃해 주세요.');
    }
    unwrap(await client.auth.signInWithPassword({ email, password }));
    try {
      if (!(await canWrite())) throw Error('미디어를 관리할 권한이 없는 계정입니다.');
    } catch (error) {
      try {
        await logout();
      } catch (logoutError) {
        console.warn('CINELIQ sign-out:', logoutError);
      }
      throw error;
    }
  }

  async function logout() {
    unwrap(await client.auth.signOut({ scope: 'local' }));
  }

  function onAuthChange(callback) {
    return client.auth.onAuthStateChange((event, session) =>
      setTimeout(() => callback(event, session), 0),
    );
  }

  const callbackUrl = () => new URL('.', location.href).href;
  const kakaoQueryParams = {
    scope: 'profile_image,profile_nickname',
    prompt: 'select_account',
  };
  const googleQueryParams = { prompt: 'select_account' };

  async function enabledProviders() {
    const settingsUrl = new URL('/auth/v1/settings', config.projectUrl);
    const response = await fetch(settingsUrl, {
      headers: { apikey: config.publishableKey },
    });
    if (!response.ok) throw Error('Auth settings are unavailable');
    return (await response.json()).external ?? {};
  }

  async function loginWithGoogle() {
    if (!(await enabledProviders()).google) {
      throw Object.assign(Error('Google provider is disabled'), {
        code: 'google_unavailable',
      });
    }
    return unwrap(
      await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl(), queryParams: googleQueryParams },
      }),
    );
  }

  const identityFailure = (code) => Object.assign(Error(code), { code });
  async function identityState(expectedUserId) {
    const { user } = unwrap(await client.auth.getUser());
    const { session } = unwrap(await client.auth.getSession());
    if (
      !user ||
      user.id !== session?.user.id ||
      (expectedUserId && user.id !== expectedUserId)
    ) {
      throw identityFailure('identity_session_changed');
    }
    const identities = user.identities;
    if (
      !Array.isArray(identities) ||
      identities.some((row) => row.user_id && row.user_id !== user.id)
    ) {
      throw identityFailure('identity_state_unverified');
    }
    return { userId: user.id, identities };
  }

  async function linkIdentity(provider, expectedUserId) {
    if (!['google', 'kakao'].includes(provider))
      throw identityFailure('provider_unavailable');
    const state = await identityState(expectedUserId);
    if (state.identities.some((row) => row.provider === provider))
      throw identityFailure('identity_already_linked');
    if (!(await enabledProviders())[provider])
      throw identityFailure('provider_unavailable');
    return unwrap(
      await client.auth.linkIdentity({
        provider,
        options: {
          redirectTo: callbackUrl(),
          queryParams: provider === 'kakao' ? kakaoQueryParams : googleQueryParams,
          skipBrowserRedirect: true,
        },
      }),
    ).url;
  }

  async function unlinkIdentity(identity, expectedUserId) {
    const state = await identityState(expectedUserId);
    const current = state.identities.find(
      (row) =>
        row.identity_id === identity.identity_id && row.provider === identity.provider,
    );
    if (!current) throw identityFailure('identity_not_found');
    const enabled = await enabledProviders();
    if (
      !state.identities.some(
        (row) =>
          row.provider !== current.provider &&
          ['google', 'kakao'].includes(row.provider) &&
          enabled[row.provider],
      )
    ) {
      throw identityFailure('single_identity_not_deletable');
    }
    unwrap(await client.auth.unlinkIdentity(current));
    const updated = await identityState(state.userId);
    if (updated.identities.some((row) => row.provider === current.provider))
      throw identityFailure('identity_still_linked');
    return updated;
  }

  const members = {
    session: async () => unwrap(await client.auth.getSession()).session,
    login: async (email, password) =>
      unwrap(await client.auth.signInWithPassword({ email, password })),
    signup: async (email, password) =>
      unwrap(
        await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callbackUrl() },
        }),
      ),
    google: loginWithGoogle,
    kakao: async () =>
      unwrap(
        await client.auth.signInWithOAuth({
          provider: 'kakao',
          options: {
            redirectTo: callbackUrl(),
            queryParams: kakaoQueryParams,
          },
        }),
      ),
    reset: async (email) =>
      unwrap(
        await client.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl() }),
      ),
    updatePassword: async (password) =>
      unwrap(await client.auth.updateUser({ password })),
    enabledProviders,
    identities: async () => (await identityState()).identities,
    identityState,
    linkIdentity,
    unlinkIdentity,
    updateName: async (displayName) =>
      unwrap(await client.auth.updateUser({ data: { display_name: displayName } })).user,
    favorites: async (userId) =>
      unwrap(
        await client
          .from('cineliq_favorites')
          .select('technique_id,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      ),
    save: async (userId, techniqueId) =>
      unwrap(
        await client
          .from('cineliq_favorites')
          .upsert(
            { user_id: userId, technique_id: techniqueId },
            { onConflict: 'user_id,technique_id', ignoreDuplicates: true },
          ),
      ),
    remove: async (userId, techniqueId) =>
      unwrap(
        await client
          .from('cineliq_favorites')
          .delete()
          .eq('user_id', userId)
          .eq('technique_id', techniqueId),
      ),
  };

  async function readLibraryRows(table, userId, order) {
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = unwrap(
        await client
          .from(table)
          .select('*')
          .eq('user_id', userId)
          .order(order)
          .order(table === 'cineliq_folder_items' ? 'folder_id' : 'id')
          .range(offset, offset + pageSize - 1),
      );
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
  }

  members.library = async (userId) => {
    const [folders, entries] = await Promise.all([
      readLibraryRows('cineliq_folders', userId, 'id'),
      readLibraryRows('cineliq_folder_items', userId, 'technique_id'),
    ]);
    return { folders, entries };
  };
  members.createFolder = async (name, expectedUserId) => {
    const { user } = unwrap(await client.auth.getUser());
    if (!user || (expectedUserId && user.id !== expectedUserId))
      throw identityFailure('identity_session_changed');
    return unwrap(
      await client
        .from('cineliq_folders')
        .insert({ name, user_id: user.id })
        .select()
        .single(),
    );
  };
  members.renameFolder = async (id, name) =>
    unwrap(
      await client
        .from('cineliq_folders')
        .update({ name })
        .eq('id', id)
        .select()
        .single(),
    );
  members.deleteFolder = async (id) =>
    unwrap(await client.from('cineliq_folders').delete().eq('id', id));
  members.addFolderItems = async (folderId, ids) =>
    unwrap(
      await client.from('cineliq_folder_items').upsert(
        ids.map((techniqueId) => ({ folder_id: folderId, technique_id: techniqueId })),
        {
          onConflict: 'user_id,folder_id,technique_id',
          ignoreDuplicates: true,
          defaultToNull: false,
        },
      ),
    );
  members.removeFolderItem = async (folderId, techniqueId) =>
    unwrap(
      await client
        .from('cineliq_folder_items')
        .delete()
        .eq('folder_id', folderId)
        .eq('technique_id', techniqueId),
    );
  members.folderStorageReady = async () =>
    unwrap(await client.rpc('cineliq_folder_storage_version')) === 2;
  members.updateTheme = async (theme, expectedUserId) => {
    if (!['dark', 'light', 'system'].includes(theme)) throw Error('invalid_theme');
    const { user } = unwrap(await client.auth.getUser());
    if (!user || user.id !== expectedUserId)
      throw identityFailure('identity_session_changed');
    const updated = unwrap(
      await client.auth.updateUser({
        data: {
          cineliq_preferences: { ...user.user_metadata?.cineliq_preferences, theme },
        },
      }),
    ).user;
    if (updated.id !== expectedUserId) throw identityFailure('identity_session_changed');
    return updated;
  };
  members.updateAccessibility = async (preferences, expectedUserId) => {
    const { user } = unwrap(await client.auth.getUser());
    if (!user || user.id !== expectedUserId)
      throw identityFailure('identity_session_changed');
    const safe = {
      textSize: ['normal', 'large', 'xlarge'].includes(preferences.textSize)
        ? preferences.textSize
        : 'normal',
    };
    for (const key of ['contrast', 'motion', 'links', 'captions'])
      safe[key] = preferences[key] === true;
    const updated = unwrap(
      await client.auth.updateUser({ data: { cineliq_accessibility: safe } }),
    ).user;
    if (updated.id !== expectedUserId) throw identityFailure('identity_session_changed');
    return updated;
  };
  members.setTechniqueFolders = async (technique, selected, expected) =>
    unwrap(
      await client.rpc('cineliq_set_technique_folders', {
        technique,
        selected_folders: selected,
        expected_folders: expected,
      }),
    );

  members.deletionRequest = async (action, expectedUserId) => {
    const { session } = unwrap(await client.auth.getSession());
    if (!session)
      throw Object.assign(Error('Authentication required'), {
        code: 'authentication_required',
      });
    const { data, error } = await client.functions.invoke('delete-account', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { action, expectedUserId, confirmation: 'CINELIQ 탈퇴' },
    });
    if (error) {
      let code = 'deletion_unconfirmed';
      try {
        code = (await error.context.json()).code || code;
      } catch {}
      throw Object.assign(Error('Account deletion request failed'), { code });
    }
    if (
      data?.code !== (action === 'check' ? 'ready' : 'deleted') ||
      data.userId !== expectedUserId
    )
      throw Object.assign(Error('Deletion result not confirmed'), {
        code: 'deletion_unconfirmed',
      });
    return data;
  };
  members.deletionReauthenticate = async (provider, password, expectedUserId) => {
    const { user } = unwrap(await client.auth.getUser());
    if (user?.id !== expectedUserId)
      throw Object.assign(Error('Account changed'), { code: 'account_changed' });
    if (provider === 'email') {
      if (
        !user.email ||
        !user.identities?.some((identity) => identity.provider === 'email')
      )
        throw Error('Email login unavailable');
      const data = unwrap(
        await client.auth.signInWithPassword({ email: user.email, password }),
      );
      if (data.user?.id !== expectedUserId)
        throw Object.assign(Error('Account changed'), { code: 'account_changed' });
      return null;
    }
    if (
      !['google', 'kakao'].includes(provider) ||
      !user.identities?.some((identity) => identity.provider === provider)
    )
      throw Error('Provider unavailable');
    return unwrap(
      await client.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl(),
          skipBrowserRedirect: true,
          queryParams: provider === 'kakao' ? kakaoQueryParams : googleQueryParams,
        },
      }),
    ).url;
  };

  async function catalog(admin, previous = new Map()) {
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = unwrap(
        await client
          .from('cineliq_media')
          .select('id,technique_id,kind,object_path,thumbnail_path,position,is_primary')
          .order('id')
          .range(offset, offset + pageSize - 1),
      );
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    const names = admin
      ? new Map(
          unwrap(await client.rpc('cineliq_file_names')).map((row) => [
            row.id,
            row.original_name,
          ]),
        )
      : new Map();
    const paths = [
      ...new Set(
        rows.flatMap((row) => [row.object_path, row.thumbnail_path].filter(Boolean)),
      ),
    ];
    const urls = new Map();
    for (const entries of previous.values()) {
      for (const entry of entries) {
        if (entry.expiresAt <= Date.now() + 5 * 60 * 1000) continue;
        urls.set(entry.object_path, { url: entry.url, expiresAt: entry.expiresAt });
        if (entry.thumbnail_path && entry.thumbnail) {
          urls.set(entry.thumbnail_path, {
            url: entry.thumbnail,
            expiresAt: entry.expiresAt,
          });
        }
      }
    }
    const missing = paths.filter((path) => !urls.get(path)?.url);
    for (let start = 0; start < missing.length; start += pageSize) {
      const expiresAt = Date.now() + signedLifetime * 1000;
      const signed = unwrap(
        await client.storage
          .from(bucket)
          .createSignedUrls(missing.slice(start, start + pageSize), signedLifetime),
      );
      for (const entry of signed) {
        if (entry.signedUrl) urls.set(entry.path, { url: entry.signedUrl, expiresAt });
      }
    }
    const byTechnique = new Map();
    rows.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    for (const row of rows) {
      const original = urls.get(row.object_path);
      const thumbnail = urls.get(row.thumbnail_path);
      const entry = {
        ...row,
        name: names.get(row.id),
        url: original?.url,
        thumbnail: thumbnail?.url,
        expiresAt: Math.min(original?.expiresAt ?? 0, thumbnail?.expiresAt ?? Infinity),
      };
      if (!byTechnique.has(row.technique_id)) byTechnique.set(row.technique_id, []);
      byTechnique.get(row.technique_id).push(entry);
    }
    return byTechnique;
  }

  async function validate(file, kind) {
    if (!Object.hasOwn(types, file.type) || !file.type.startsWith(kind + '/')) {
      throw Error(
        kind === 'image'
          ? 'JPG, PNG, WebP 이미지를 선택해 주세요.'
          : 'MP4 또는 WebM 영상을 선택해 주세요.',
      );
    }
    if (!file.size || file.size > limits[kind]) {
      throw Error(
        `파일은 0바이트보다 크고 ${limits[kind] / megabyte}MB 이하여야 합니다.`,
      );
    }
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const ascii = String.fromCharCode(...bytes);
    const valid = {
      'image/jpeg': hex.startsWith('ffd8ff'),
      'image/png': hex.startsWith('89504e470d0a1a0a'),
      'image/webp': ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP',
      'video/mp4':
        ascii.slice(4, 8) === 'ftyp' &&
        !/^(avif|avis|heic|heix|mif1|msf1)$/.test(ascii.slice(8, 12)),
      'video/webm': hex.startsWith('1a45dfa3'),
    };
    if (!valid[file.type]) throw Error('파일 내용이 선택한 형식과 일치하지 않습니다.');
  }

  async function makeThumbnail(file) {
    const image = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 640 / Math.max(image.width, image.height));
      if (scale === 1 && file.size < 200 * 1024) return null;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#181818';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    } finally {
      image.close();
    }
  }

  async function put(path, file, progress) {
    const { session } = unwrap(await client.auth.getSession());
    if (!session) throw Error('관리자로 다시 로그인해 주세요.');
    uploader ??= import('https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/+esm');
    const { Upload } = await uploader;
    const ref = new URL(config.projectUrl).hostname.split('.')[0];
    await new Promise((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`,
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: config.publishableKey,
        },
        metadata: {
          bucketName: bucket,
          objectName: path,
          contentType: file.type,
          cacheControl: '3600',
        },
        retryDelays: [0, 1000, 3000, 5000],
        chunkSize: 6 * megabyte,
        uploadDataDuringCreation: true,
        storeFingerprintForResuming: false,
        onProgress: (sent, size) => progress(Math.round((100 * sent) / size)),
        onError: reject,
        onSuccess: resolve,
      });
      upload.start();
    });
  }

  async function cleanup(paths) {
    if (!paths.length) return true;
    try {
      unwrap(await client.storage.from(bucket).remove(paths));
      return true;
    } catch (error) {
      console.warn('CINELIQ Storage cleanup:', error);
      return false;
    }
  }

  async function mutate(technique, action, id, details = {}) {
    const paths = unwrap(
      await client.rpc('cineliq_change_media', {
        technique,
        action,
        media_id: id ?? null,
        ...details,
      }),
    );
    return cleanup(paths);
  }

  async function upload(item, file, id, progress, digest = null) {
    await validate(file, item.mediaType);
    const thumbnail = item.mediaType === 'image' ? await makeThumbnail(file) : null;
    const prefix = `${item.id}/${crypto.randomUUID()}`;
    const path = `${prefix}.${types[file.type]}`;
    const thumb = thumbnail ? `${prefix}.thumb.jpg` : null;
    try {
      await put(path, file, (value) => progress(Math.round(value * 0.95)));
      if (thumb)
        await put(thumb, thumbnail, (value) => progress(95 + Math.floor(value * 0.04)));
      const clean = await mutate(item.id, id ? 'replace' : 'add', id, {
        path,
        thumb,
        filename: (file.name || 'media').slice(0, 255),
        bytes: file.size,
        mime: file.type,
        digest,
      });
      progress(100);
      return clean;
    } catch (error) {
      await cleanup([path, thumb].filter(Boolean));
      throw error;
    }
  }

  async function digest(file) {
    const bytes = new Uint8Array(
      await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
    );
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  window.CINELIQ_CLOUD = {
    configured,
    showAdmin: config.showAdmin,
    connect,
    canWrite,
    login,
    logout,
    onAuthChange,
    members,
    catalog,
    upload,
    mutate,
    validate,
    digest,
    limits,
    types,
  };
})();
