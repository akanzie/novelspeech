(() => {
  const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
  const MESSAGES = CONFIG.MESSAGES || {};

  const normalizeLevel = (level) => {
    if (!level) return 'INFO';
    const upper = String(level).toUpperCase();
    if (upper === 'WARN') return 'WARN';
    if (upper === 'WARNING') return 'WARN';
    if (upper === 'ERROR') return 'ERROR';
    if (upper === 'DEBUG') return 'DEBUG';
    return 'INFO';
  };

  const logLocal = (moduleName, message, level, data = {}) => {
    const tag = moduleName || 'unknown';
    const text = `[${tag}] ${message}`;
    const upper = normalizeLevel(level);
    if (upper === 'ERROR') {
      console.error(text, data || {});
    } else if (upper === 'WARN') {
      console.warn(text, data || {});
    } else if (upper === 'DEBUG') {
      console.debug(text, data || {});
    } else {
      console.log(text, data || {});
    }
  };

  const send = (moduleName, message, level, data = {}) => {
    const payload = {
      level: normalizeLevel(level),
      message: String(message ?? ''),
      module: moduleName || 'unknown',
      data: data || {}
    };

    try {
      logLocal(payload.module, payload.message, payload.level, payload.data);

      if (chrome?.runtime?.sendMessage) {
        // Fire-and-forget; avoid noisy lastError when background closes the port.
        try {
          const maybePromise = chrome.runtime.sendMessage({
            type: MESSAGES.LOG || 'log',
            data: payload
          });
          if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch(() => {
              // ignore
            });
          }
        } catch {
          // ignore
        }
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  const LogService = {
    log: (moduleName, message, level = 'INFO', data = {}) => send(moduleName, message, level, data),
    info: (moduleName, message, data = {}) => send(moduleName, message, 'INFO', data),
    warn: (moduleName, message, data = {}) => send(moduleName, message, 'WARN', data),
    error: (moduleName, message, data = {}) => send(moduleName, message, 'ERROR', data),
    debug: (moduleName, message, data = {}) => send(moduleName, message, 'DEBUG', data)
  };

  if (!globalThis.LogService) {
    globalThis.LogService = LogService;
  }
})();
