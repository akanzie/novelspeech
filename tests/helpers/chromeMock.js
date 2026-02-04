function createEvent() {
  const listeners = new Set();
  return {
    addListener(fn) {
      listeners.add(fn);
    },
    removeListener(fn) {
      listeners.delete(fn);
    },
    hasListener(fn) {
      return listeners.has(fn);
    },
    dispatch(...args) {
      const results = [];
      for (const fn of listeners) {
        results.push(fn(...args));
      }
      return results;
    }
  };
}

function createStorageArea(initial = {}) {
  const store = { ...initial };
  return {
    async get(keys) {
      const keyList = Array.isArray(keys) ? keys : Object.keys(keys || {});
      const out = {};
      for (const k of keyList) out[k] = store[k];
      return out;
    },
    async set(obj) {
      Object.assign(store, obj || {});
    },
    async remove(keys) {
      for (const k of keys || []) delete store[k];
    },
    async clear() {
      for (const k of Object.keys(store)) delete store[k];
    },
    _dump() {
      return { ...store };
    }
  };
}

export function createChromeMock(options = {}) {
  const calls = {
    runtimeSendMessage: [],
    tabsSendMessage: [],
    tabsUpdate: [],
    alarmsCreate: [],
    storageLocalSet: [],
    storageLocalGet: [],
    storageSessionSet: [],
    storageSessionGet: []
  };

  const runtime = {
    lastError: null,
    onMessage: createEvent(),
    onConnect: createEvent(),
    onInstalled: createEvent(),
    onSuspend: createEvent(),
    onStartup: createEvent(),
    sendMessage(message, callback) {
      calls.runtimeSendMessage.push({ message });
      const responder = options.runtimeResponder;

      if (typeof callback === 'function') {
        Promise.resolve()
          .then(() => responder ? responder(message) : { success: true })
          .then((resp) => callback(resp))
          .catch((err) => {
            runtime.lastError = { message: err?.message || String(err) };
            callback(undefined);
            runtime.lastError = null;
          });
        return undefined;
      }

      return Promise.resolve().then(() => responder ? responder(message) : { success: true });
    }
  };

  const action = {
    onClicked: createEvent()
  };

  const alarms = {
    onAlarm: createEvent(),
    create(name, info) {
      calls.alarmsCreate.push({ name, info });
    }
  };

  const tabs = {
    onCreated: createEvent(),
    onUpdated: createEvent(),
    onRemoved: createEvent(),
    async update(tabId, updateProperties) {
      calls.tabsUpdate.push({ tabId, updateProperties });
      return { id: tabId, ...(updateProperties || {}) };
    },
    query(queryInfo, callback) {
      void queryInfo;
      const tabId = options.activeTabId ?? 1;
      callback([{ id: tabId }]);
    },
    async get(tabId) {
      const url = options.tabUrl ?? 'https://metruyencv.com/truyen/foo/chuong-1';
      return { id: tabId, url };
    },
    sendMessage(tabId, message, callback) {
      calls.tabsSendMessage.push({ tabId, message });
      const responder = options.tabsResponder;

      if (typeof callback !== 'function') {
        return Promise.resolve().then(() => responder ? responder(tabId, message) : { success: true, ready: true });
      }

      Promise.resolve()
        .then(() => responder ? responder(tabId, message) : { success: true, ready: true })
        .then((resp) => callback(resp))
        .catch((err) => {
          runtime.lastError = { message: err?.message || String(err) };
          callback(undefined);
          runtime.lastError = null;
        });
    }
  };

  const webNavigation = {
    onCompleted: createEvent()
  };

  const storageLocal = createStorageArea(options.localStorageInitial);
  const storageSession = createStorageArea(options.sessionStorageInitial);
  const storage = {
    local: {
      ...storageLocal,
      async get(keys) {
        calls.storageLocalGet.push({ keys });
        return storageLocal.get(keys);
      },
      async set(obj) {
        calls.storageLocalSet.push({ obj });
        return storageLocal.set(obj);
      }
    },
    session: {
      ...storageSession,
      async get(keys) {
        calls.storageSessionGet.push({ keys });
        return storageSession.get(keys);
      },
      async set(obj) {
        calls.storageSessionSet.push({ obj });
        return storageSession.set(obj);
      }
    },
    onChanged: createEvent()
  };

  const offscreen = options.offscreen || undefined;

  return {
    chrome: {
      runtime,
      action,
      alarms,
      tabs,
      webNavigation,
      storage,
      offscreen,
      tts: options.tts
    },
    calls
  };
}
