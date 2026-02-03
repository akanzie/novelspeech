(() => {
  const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
  const STORAGE = CONFIG.STORAGE_KEYS || {};

  const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage;

  const getArea = (area) => {
    if (!hasChromeStorage) return null;
    if (area === 'session' && chrome.storage.session) {
      return chrome.storage.session;
    }
    return chrome.storage.local;
  };

  const getValue = async (key, options = {}) => {
    const { area = 'local', defaultValue = null } = options;
    try {
      const storage = getArea(area);
      if (!storage) return defaultValue;
      const result = await storage.get([key]);
      return result[key] ?? defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const setValue = async (key, value, options = {}) => {
    const { area = 'local' } = options;
    try {
      const storage = getArea(area);
      if (!storage) return false;
      await storage.set({ [key]: value });
      return true;
    } catch {
      return false;
    }
  };

  const removeValue = async (keys, options = {}) => {
    const { area = 'local' } = options;
    try {
      const storage = getArea(area);
      if (!storage) return false;
      await storage.remove(keys);
      return true;
    } catch {
      return false;
    }
  };

  const clearArea = async (options = {}) => {
    const { area = 'local' } = options;
    try {
      const storage = getArea(area);
      if (!storage) return false;
      await storage.clear();
      return true;
    } catch {
      return false;
    }
  };

  const StorageService = {
    getArea,
    getValue,
    setValue,
    removeValue,
    clearArea,

    getReadingState: () => getValue(STORAGE.READING_STATE || 'readingState'),
    setReadingState: (state) => setValue(STORAGE.READING_STATE || 'readingState', state),

    getReadingHistory: () => getValue(STORAGE.READING_HISTORY || 'readingHistory', { defaultValue: [] }),
    setReadingHistory: (history) => setValue(STORAGE.READING_HISTORY || 'readingHistory', history),

    getUserSettings: () => getValue(STORAGE.USER_SETTINGS || 'userSettings'),
    setUserSettings: (settings) => setValue(STORAGE.USER_SETTINGS || 'userSettings', settings),

    getSystemLogs: () => getValue(STORAGE.SYSTEM_LOGS || 'systemLogs', { defaultValue: [] }),
    setSystemLogs: (logs) => setValue(STORAGE.SYSTEM_LOGS || 'systemLogs', logs),

    getAutoExtract: () => getValue(STORAGE.AUTO_EXTRACT || 'autoExtract'),
    setAutoExtract: (enabled) => setValue(STORAGE.AUTO_EXTRACT || 'autoExtract', enabled),

    getOcrCache: () => getValue(STORAGE.OCR_CACHE || 'ocrCache', { area: 'session', defaultValue: [] }),
    setOcrCache: (cache) => setValue(STORAGE.OCR_CACHE || 'ocrCache', cache, { area: 'session' }),
    clearOcrCache: () => removeValue([STORAGE.OCR_CACHE || 'ocrCache'], { area: 'session' }),

    clearAll: async (options = {}) => {
      const { includeSession = false } = options;
      const localCleared = await clearArea({ area: 'local' });
      if (!includeSession) return localCleared;
      const sessionCleared = await clearArea({ area: 'session' });
      return localCleared && sessionCleared;
    }
  };

  if (!globalThis.StorageService) {
    globalThis.StorageService = StorageService;
  }
})();
