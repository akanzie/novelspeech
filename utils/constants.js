(() => {
  const CONFIG = {
    STORAGE_KEYS: {
      READING_STATE: 'readingState',
      USER_SETTINGS: 'userSettings',
      OCR_CACHE: 'ocrCache',
      READING_HISTORY: 'readingHistory',
      SYSTEM_LOGS: 'systemLogs',
      AUTO_EXTRACT: 'autoExtract'
    },
    TTS_ENGINES: {
      EDGE_TTS: 'edge',
      WEB_SPEECH: 'web_speech',
      CUSTOM_API: 'custom_api',
      CHROME_TTS: 'chrome_tts'
    },
    READING_STATUS: {
      IDLE: 'idle',
      LOADING: 'loading',
      PLAYING: 'playing',
      PAUSED: 'paused',
      STOPPED: 'stopped',
      FINISHED: 'finished',
      ERROR: 'error'
    },
    MESSAGES: {
      START_READING: 'startReading',
      PAUSE_READING: 'pauseReading',
      RESUME_READING: 'resumeReading',
      STOP_READING: 'stopReading',
      NEXT_LINE: 'nextLine',
      PREV_LINE: 'prevLine',
      UPDATE_SETTINGS: 'updateSettings',
      GET_STATE: 'getState',
      EXTRACT_CONTENT: 'extractContent',
      HIGHLIGHT_LINE: 'highlightLine',
      SYNC_STATE: 'syncState',
      SETTINGS_UPDATED: 'settingsUpdated',
      PREV_CHAPTER: 'prevChapter',
      NEXT_CHAPTER: 'nextChapter',
      SWITCH_CHAPTER: 'switchChapter',
      GET_VOICES: 'getVoices',
      LOG: 'log',
      APPLY_APPEARANCE: 'applyAppearance',
      GET_CHAPTER_LINKS: 'getChapterLinks',
      CLEAR_HIGHLIGHT: 'clearHighlight',
      MAP_CONTENT: 'mapContent',
      GET_CONTENT: 'getContent',
      PING: 'ping',
      CONTENT_SCRIPT_READY: 'contentScriptReady',
      CONTENT_EXTRACTED: 'contentExtracted',
      STATE_UPDATE: 'stateUpdate',
      NOTIFICATION: 'notification',
      CHAPTER_UPDATED: 'chapterUpdated',
      HISTORY_UPDATED: 'historyUpdated',
      BOOKMARK_ADDED: 'bookmarkAdded',
      ADD_BOOKMARK: 'addBookmark',
      GO_TO_BOOKMARK: 'goToBookmark',
      DELETE_BOOKMARK: 'deleteBookmark',
      CLEAR_HISTORY: 'clearHistory',
      EXPORT_LOGS: 'exportLogs',
      DATA_CLEARED: 'dataCleared'
    },
    DEFAULT_SETTINGS: {
      general: {
        autoStart: false,
        autoNextChapter: false,
        saveHistory: true,
        pageLoadTimeout: 10,
        autoScroll: true,
        highlight: true
      },
      tts: {
        engine: 'edge',
        defaultVoice: 'vi-VN-HoaiMyNeural',
        defaultSpeed: 1.0,
        defaultPitch: 1.0,
        volume: 100
      },
      appearance: {
        theme: 'auto',
        highlightColor: '#ffeb3b',
        highlightOpacity: 0.3,
        fontSize: 14
      },
      advanced: {
        ocrLanguage: 'vie',
        cacheOCRResults: true,
        enableDebug: false,
        maxCacheSize: 100
      }
    },
    DEFAULT_RUNTIME_SETTINGS: {
      engine: 'edge',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      voice: 'vi-VN-HoaiMyNeural',
      autoScroll: true,
      highlight: true
    }
  };

  const existing = globalThis.NOVELSPEECH_CONFIG || {};

  globalThis.NOVELSPEECH_CONFIG = {
    ...CONFIG,
    ...existing,
    STORAGE_KEYS: { ...CONFIG.STORAGE_KEYS, ...(existing.STORAGE_KEYS || {}) },
    TTS_ENGINES: { ...CONFIG.TTS_ENGINES, ...(existing.TTS_ENGINES || {}) },
    READING_STATUS: { ...CONFIG.READING_STATUS, ...(existing.READING_STATUS || {}) },
    MESSAGES: { ...CONFIG.MESSAGES, ...(existing.MESSAGES || {}) },
    DEFAULT_SETTINGS: { ...CONFIG.DEFAULT_SETTINGS, ...(existing.DEFAULT_SETTINGS || {}) },
    DEFAULT_RUNTIME_SETTINGS: { ...CONFIG.DEFAULT_RUNTIME_SETTINGS, ...(existing.DEFAULT_RUNTIME_SETTINGS || {}) }
  };
})();
