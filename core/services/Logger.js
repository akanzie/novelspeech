/**
 * Logger Service - Quản lý logging toàn hệ thống
 */

class Logger {
  constructor() {
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };

    this.currentLevel = this.logLevels.INFO;
    this.logHistory = [];
    this.maxHistorySize = 100;

    this.init();
  }

  init() {
    // Load log level from settings
    this.loadLogLevel();

    // Setup console overrides for debugging
    this.setupConsoleOverrides();

    console.log('📝 Logger initialized');
  }

  async loadLogLevel() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      if (result.settings?.advanced?.enableDebug) {
        this.currentLevel = this.logLevels.DEBUG;
      }
    } catch (error) {
      // Use default level
    }
  }

  setupConsoleOverrides() {
    if (this.currentLevel >= this.logLevels.DEBUG) {
      // Save original console methods
      this.originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
      };

      // Override console methods
      console.log = this.createLogMethod('log', this.logLevels.INFO);
      console.warn = this.createLogMethod('warn', this.logLevels.WARN);
      console.error = this.createLogMethod('error', this.logLevels.ERROR);
      console.info = this.createLogMethod('info', this.logLevels.INFO);
      console.debug = this.createLogMethod('debug', this.logLevels.DEBUG);
    }
  }

  createLogMethod(method, level) {
    return (...args) => {
      // Check if we should log this level
      if (level <= this.currentLevel) {
        // Call original method
        this.originalConsole[method](...args);

        // Save to history
        this.saveToHistory(method.toUpperCase(), args);
      }
    };
  }

  saveToHistory(level, args) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '),
      module: this.getCallerModule()
    };

    this.logHistory.unshift(logEntry);

    // Keep only recent logs
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.pop();
    }

    // Save to storage periodically
    if (this.logHistory.length % 10 === 0) {
      this.saveHistoryToStorage();
    }
  }

  getCallerModule() {
    try {
      const stack = new Error().stack;
      const lines = stack.split('\n');

      // Skip first 3 lines (Error, getCallerModule, saveToHistory)
      if (lines.length > 3) {
        const callerLine = lines[3];
        const match = callerLine.match(/at\s+(.+?)\s+\(/);
        if (match) {
          return match[1];
        }
      }
    } catch (error) {
      // Ignore
    }

    return 'unknown';
  }

  async saveHistoryToStorage() {
    try {
      const result = await chrome.storage.local.get(['systemLogs']);
      const existingLogs = result.systemLogs || [];

      // Combine and keep only last 200 logs
      const allLogs = [...this.logHistory, ...existingLogs];
      const limitedLogs = allLogs.slice(0, 200);

      await chrome.storage.local.set({ systemLogs: limitedLogs });
    } catch (error) {
      // Ignore storage errors
    }
  }

  log(message, data = {}) {
    this.logWithLevel('INFO', message, data);
  }

  error(message, data = {}) {
    this.logWithLevel('ERROR', message, data);
  }

  warn(message, data = {}) {
    this.logWithLevel('WARN', message, data);
  }

  debug(message, data = {}) {
    this.logWithLevel('DEBUG', message, data);
  }

  logWithLevel(level, message, data = {}) {
    const levelNum = this.logLevels[level] || this.logLevels.INFO;

    if (levelNum <= this.currentLevel) {
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
      const module = data.module || 'Logger';

      const logMessage = `[${timestamp}] [${module}] [${level}] ${message}`;

      // Log to console with appropriate method
      switch (level) {
        case 'ERROR':
          console.error(logMessage, data);
          break;
        case 'WARN':
          console.warn(logMessage, data);
          break;
        case 'DEBUG':
          console.debug(logMessage, data);
          break;
        default:
          console.log(logMessage, data);
      }

      // Save to history
      this.saveToHistory(level, [message, data]);
    }
  }

  getLogs(limit = 50) {
    return this.logHistory.slice(0, limit);
  }

  clearLogs() {
    this.logHistory = [];
    chrome.storage.local.remove(['systemLogs']);
  }

  setLogLevel(level) {
    if (typeof level === 'string') {
      this.currentLevel = this.logLevels[level.toUpperCase()] || this.logLevels.INFO;
    } else {
      this.currentLevel = level;
    }
  }
}

export default Logger;
