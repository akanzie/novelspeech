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

  const send = (moduleName, message, level, data = {}) => {
    const payload = {
      level: normalizeLevel(level),
      message: String(message ?? ''),
      module: moduleName || 'unknown',
      data: data || {}
    };

    try {
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

  const installGlobalErrorHandlers = () => {
    if (globalThis.__novelSpeechLogHandlersInstalled) return;
    globalThis.__novelSpeechLogHandlersInstalled = true;

    const handleErrorEvent = (event) => {
      try {
        const error = event?.error || event?.reason || event;
        const message = error?.message || event?.message || 'Unknown error';
        const stack = error?.stack || '';
        send('GlobalError', message, 'ERROR', { stack });
      } catch {
        // ignore
      }
    };

    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('error', handleErrorEvent);
      globalThis.addEventListener('unhandledrejection', handleErrorEvent);
    } else if (typeof globalThis.onerror === 'function') {
      const original = globalThis.onerror;
      globalThis.onerror = (...args) => {
        try {
          const message = args?.[0] || 'Unknown error';
          send('GlobalError', message, 'ERROR', {});
        } catch {
          // ignore
        }
        return original.apply(globalThis, args);
      };
    }
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

  installGlobalErrorHandlers();
})();
