/**
 * Logger Service - Quản lý logging toàn hệ thống extension
 * Hỗ trợ các mức log (ERROR, WARN, INFO, DEBUG), lưu lịch sử log,
 * override console khi debug, và lưu log vào chrome.storage.local
 */

import '../utils/constants.js';
import '../utils/StorageService.js';
const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
const STORAGE = CONFIG.STORAGE_KEYS || {};

class Logger {
  constructor() {
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };

    this.currentLevel = this.logLevels.INFO; // Mức log mặc định
    this.logHistory = [];                    // Lịch sử log trong memory (mới nhất ở đầu)
    this.maxHistorySize = 100;               // Giới hạn lịch sử trong memory

    this.init();
  }

  /**
   * Khởi tạo Logger: load mức log từ settings và override console nếu cần
   */
  init() {
    // Load mức log từ settings (nếu enable debug thì chuyển sang DEBUG)
    this.loadLogLevel();

    // Override các phương thức console để capture log (chỉ khi đang ở mức DEBUG)
    this.setupConsoleOverrides();

    console.log('📝 Bộ ghi log đã khởi tạo');
  }

  /**
   * Load mức log từ chrome.storage (async)
   * Nếu người dùng bật debug trong settings → chuyển sang mức DEBUG
   */
  async loadLogLevel() {
    try {
      let settings = null;
      if (globalThis.StorageService?.getUserSettings) {
        settings = await globalThis.StorageService.getUserSettings();
      } else {
        const key = STORAGE.USER_SETTINGS || 'userSettings';
        const result = await chrome.storage.local.get([key, 'settings']);
        settings = result[key] || result.settings || null;
      }
      if (settings?.advanced?.enableDebug) {
        this.currentLevel = this.logLevels.DEBUG;
      }
    } catch (error) {
      // Nếu lỗi storage thì giữ mức mặc định (INFO)
      console.warn('⚠️ Không thể load mức log từ storage:', error);
    }
  }

  /**
   * Override các phương thức console để tự động capture log vào history
   * Chỉ thực hiện khi mức log hiện tại là DEBUG
   */
  setupConsoleOverrides() {
    if (this.currentLevel >= this.logLevels.DEBUG) {
      // Lưu lại các phương thức console gốc để gọi lại
      this.originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
      };

      // Override từng phương thức
      console.log = this.createLogMethod('log', this.logLevels.INFO);
      console.warn = this.createLogMethod('warn', this.logLevels.WARN);
      console.error = this.createLogMethod('error', this.logLevels.ERROR);
      console.info = this.createLogMethod('info', this.logLevels.INFO);
      console.debug = this.createLogMethod('debug', this.logLevels.DEBUG);
    }
  }

  /**
   * Tạo phương thức log override
   * @param {string} method - Tên phương thức console (log, warn, error...)
   * @param {number} level - Mức độ của phương thức
   * @returns {Function} Hàm override
   */
  createLogMethod(method, level) {
    return (...args) => {
      // Chỉ log nếu mức hiện tại cho phép
      if (level <= this.currentLevel) {
        // Gọi phương thức console gốc để hiển thị bình thường
        this.originalConsole[method](...args);

        // Lưu vào lịch sử log
        this.saveToHistory(method.toUpperCase(), args);
      }
    };
  }

  /**
   * Lưu một entry log vào history
   * @param {string} level - Mức log (ERROR, WARN, INFO, DEBUG)
   * @param {Array} args - Các đối số gốc từ console.xxx
   */
  saveToHistory(level, args) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' '),
      module: this.getCallerModule() || 'unknown'
    };

    // Thêm vào đầu mảng (mới nhất ở trên cùng)
    this.logHistory.unshift(logEntry);

    // Giới hạn kích thước history trong memory
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.pop();
    }

    // Cứ mỗi 10 log thì lưu vào storage (tránh gọi storage quá thường xuyên)
    if (this.logHistory.length % 10 === 0) {
      this.saveHistoryToStorage();
    }
  }

  /**
   * Lấy tên module/function caller từ stack trace
   * (dùng để biết log đến từ đâu - EventHandler, TTSService, v.v.)
   */
  getCallerModule() {
    try {
      const stack = new Error().stack;
      const lines = stack.split('\n');

      // Bỏ qua các frame nội bộ của Logger (Error, getCallerModule, saveToHistory, createLogMethod...)
      // Thường caller thực sự nằm ở dòng thứ 4 hoặc sâu hơn
      for (let i = 3; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/at\s+(.*?)[\s(]/); // Lấy tên function hoặc file
        if (match && match[1] && !match[1].includes('Logger')) {
          return match[1].trim();
        }
      }
    } catch (error) {
      // Ignore lỗi phân tích stack
    }

    return 'unknown';
  }

  /**
   * Lưu lịch sử log vào chrome.storage.local (async)
   * Giữ tối đa 200 log gần nhất (kết hợp memory + storage cũ)
   */
  async saveHistoryToStorage() {
    try {
      let existingLogs = [];
      if (globalThis.StorageService?.getSystemLogs) {
        existingLogs = await globalThis.StorageService.getSystemLogs();
      } else {
        const key = STORAGE.SYSTEM_LOGS || 'systemLogs';
        const result = await chrome.storage.local.get([key]);
        existingLogs = result[key] || [];
      }

      // Ghép history hiện tại với log cũ trong storage
      const allLogs = [...this.logHistory, ...existingLogs];

      // Giữ lại 200 log mới nhất
      const limitedLogs = allLogs.slice(0, 200);

      if (globalThis.StorageService?.setSystemLogs) {
        await globalThis.StorageService.setSystemLogs(limitedLogs);
      } else {
        const key = STORAGE.SYSTEM_LOGS || 'systemLogs';
        await chrome.storage.local.set({ [key]: limitedLogs });
      }
    } catch (error) {
      // Ignore lỗi storage (không làm gián đoạn extension)
      console.warn('⚠️ Lỗi lưu log vào storage:', error);
    }
  }

  /** Log mức INFO */
  log(message, data = {}) {
    this.logWithLevel('INFO', message, data);
  }

  /** Log mức ERROR */
  error(message, data = {}) {
    this.logWithLevel('ERROR', message, data);
  }

  /** Log mức WARN */
  warn(message, data = {}) {
    this.logWithLevel('WARN', message, data);
  }

  /** Log mức DEBUG */
  debug(message, data = {}) {
    this.logWithLevel('DEBUG', message, data);
  }

  /**
   * Log với mức chỉ định
   * @param {string} level - ERROR | WARN | INFO | DEBUG
   * @param {string} message - Nội dung log chính
   * @param {Object} data - Dữ liệu bổ sung (object sẽ được in riêng)
   */
  logWithLevel(level, message, data = {}) {
    const levelNum = this.logLevels[level.toUpperCase()] || this.logLevels.INFO;

    if (levelNum <= this.currentLevel) {
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
      const module = data.module || this.getCallerModule() || 'unknown';

      const logMessage = `[${timestamp}] [${module}] [${level}] ${message}`;

      // In ra console bằng phương thức phù hợp
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

      // Lưu vào history (truyền cả message và data riêng để dễ đọc)
      this.saveToHistory(level, [message, data]);
    }
  }

  /**
   * Lấy lịch sử log gần nhất từ memory
   * @param {number} limit - Số lượng log trả về (mặc định 50)
   */
  getLogs(limit = 50) {
    return this.logHistory.slice(0, limit);
  }

  /** Xóa toàn bộ lịch sử log (memory + storage) */
  async clearLogs() {
    this.logHistory = [];
    try {
      const key = STORAGE.SYSTEM_LOGS || 'systemLogs';
      if (globalThis.StorageService?.removeValue) {
        await globalThis.StorageService.removeValue([key]);
      } else {
        await chrome.storage.local.remove([key]);
      }
    } catch (error) {
      console.warn('⚠️ Lỗi xóa log trong storage:', error);
    }
  }

  /**
   * Thiết lập mức log mới
   * @param {string|number} level - Tên mức (DEBUG, INFO...) hoặc số
   */
  setLogLevel(level) {
    if (typeof level === 'string') {
      this.currentLevel = this.logLevels[level.toUpperCase()] ?? this.logLevels.INFO;
    } else if (typeof level === 'number') {
      this.currentLevel = level;
    }

    // Nếu thay đổi mức log thì cần reload override console (nếu chuyển sang/khỏi DEBUG)
    this.setupConsoleOverrides();
  }
}

export default Logger;

