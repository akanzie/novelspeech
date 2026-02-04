export function createSpy(fn = () => undefined) {
  const calls = [];
  const spy = (...args) => {
    calls.push(args);
    return fn(...args);
  };
  spy.calls = calls;
  return spy;
}

export function createFakeLogger() {
  return {
    log: createSpy(),
    debug: createSpy(),
    warn: createSpy(),
    error: createSpy()
  };
}

export function createFakeStateManager(initialState = {}) {
  let state = {
    status: 'stopped',
    tabId: null,
    chapterUrl: '',
    chapterTitle: '',
    storyTitle: '',
    autoContinue: false,
    currentLine: 0,
    totalLines: 0,
    content: [],
    settings: {},
    metadata: { startTime: null, endTime: null, readTime: 0 },
    ...initialState
  };

  const updateCalls = [];
  const listeners = new Set();

  return {
    _getUpdateCalls() {
      return [...updateCalls];
    },
    addListener(fn) {
      listeners.add(fn);
    },
    async getState() {
      return { ...state };
    },
    async updateState(updates) {
      const old = { ...state };
      state = { ...state, ...(updates || {}) };
      updateCalls.push(updates || {});
      for (const fn of listeners) fn(old, { ...state });
      return { ...state };
    },
    async saveToStorage() {},
    async saveReadingHistory() {}
  };
}

export function createFakeTTSService() {
  return {
    speak: createSpy(async () => {}),
    pause: createSpy(() => true),
    resume: createSpy(() => true),
    stop: createSpy(() => true),
    setVoice: createSpy(() => true),
    getVoices: createSpy(async () => ({ webSpeech: [], edgeTTS: [], chromeTTS: [] }))
  };
}
