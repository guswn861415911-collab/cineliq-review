(() => {
  const user = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'test@example.invalid',
      user_metadata: {},
      identities: [
        { provider: 'google', user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      ],
    },
    callbacks = [];
  let session = { user },
    admin = false;
  let favorites = Array.from({ length: 120 }, (_, i) => ({
    technique_id: 'CAM-' + String(i + 1).padStart(3, '0'),
    created_at: '2026-11-23T00:00:00Z',
  }));
  let folders = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: '기존 폴더',
      updated_at: '2026-11-23T00:00:00Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: '다른 폴더',
      updated_at: '2026-11-23T00:00:00Z',
    },
  ];
  let entries = [
    { folder_id: folders[0].id, technique_id: 'CAM-001' },
    { folder_id: folders[0].id, technique_id: 'CAM-225' },
  ];
  const emit = () => callbacks.forEach((cb) => cb('SIGNED_IN', session));
  const cloud = {
    configured: true,
    showAdmin: true,
    connect: async () => {},
    canWrite: async () => admin,
    catalog: async () => new Map(),
    onAuthChange: (fn) => callbacks.push(fn),
    logout: async () => {
      session = null;
      callbacks.forEach((cb) => cb('SIGNED_OUT', null));
    },
    members: {
      session: async () => session,
      identityState: async (id) => {
        if (!session || id !== user.id) throw Error('changed');
        return { userId: user.id, identities: user.identities };
      },
      identities: async () => user.identities,
      enabledProviders: async () => ({ google: true, kakao: true }),
      favorites: async () => structuredClone(favorites),
      library: async () => structuredClone({ folders, entries }),
      folderStorageReady: async () => true,
      setTechniqueFolders: async (id, selected, expected) => {
        const old = entries
          .filter((e) => e.technique_id === id)
          .map((e) => e.folder_id)
          .sort();
        if (JSON.stringify(old) !== JSON.stringify([...expected].sort()))
          throw Error('stale');
        entries = entries
          .filter((e) => e.technique_id !== id)
          .concat(selected.map((folder_id) => ({ folder_id, technique_id: id })));
      },
      createFolder: async (name) => {
        if (folders.some((f) => f.name === name)) throw Error('duplicate');
        const folder = {
          id: crypto.randomUUID(),
          name,
          updated_at: new Date().toISOString(),
        };
        folders.push(folder);
        return folder;
      },
      renameFolder: async (id, name) => {
        folders.find((f) => f.id === id).name = name;
      },
      deleteFolder: async (id) => {
        folders = folders.filter((f) => f.id !== id);
        entries = entries.filter((e) => e.folder_id !== id);
      },
      addFolderItems: async (folder_id, ids) => {
        for (const technique_id of ids)
          if (
            !entries.some(
              (e) => e.folder_id === folder_id && e.technique_id === technique_id,
            )
          )
            entries.push({ folder_id, technique_id });
      },
      removeFolderItem: async (f, id) => {
        entries = entries.filter((e) => !(e.folder_id === f && e.technique_id === id));
      },
      save: async (_, id) => {
        favorites.push({ technique_id: id, created_at: new Date().toISOString() });
      },
      remove: async (_, id) => {
        favorites = favorites.filter((f) => f.technique_id !== id);
      },
      updateTheme: async (theme, id) => {
        if (id !== user.id) throw Error();
        user.user_metadata.cineliq_preferences = { theme };
        emit();
        return structuredClone(user);
      },
      updateAccessibility: async (prefs, id) => {
        if (id !== user.id) throw Error();
        user.user_metadata.cineliq_accessibility = prefs;
        emit();
        return structuredClone(user);
      },
      reset: async () => {},
      updateName: async () => user,
    },
  };
  window.CINELIQ_CLOUD = cloud;
  window.__mock = {
    data: () => structuredClone({ favorites, folders, entries }),
    admin(value) {
      admin = value;
      emit();
    },
    guest() {
      session = null;
      callbacks.forEach((cb) => cb('SIGNED_OUT', null));
    },
  };
})();
