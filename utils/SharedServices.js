/**
 * Shared Services for all UI components
 */

(() => {
  const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
  const STORAGE = CONFIG.STORAGE_KEYS || {};
  const MESSAGES = CONFIG.MESSAGES || {};

  class SharedServices {
    // Logging Service
    static log(module, message, level = 'info', data = {}) {
      if (globalThis.LogService?.log) {
        globalThis.LogService.log(module || 'SharedServices', message, level, data || {});
        return;
      }

      const tag = module || 'SharedServices';
      const upper = String(level).toUpperCase();
      if (upper === 'ERROR') {
        console.error(`[${tag}] ${message}`, data || {});
      } else if (upper === 'WARN') {
        console.warn(`[${tag}] ${message}`, data || {});
      } else {
        console.log(`[${tag}] ${message}`, data || {});
      }
    }

    static warn(module, message, data = {}) {
      return this.log(module, message, 'warn', data);
    }

    static error(module, message, data = {}) {
      return this.log(module, message, 'error', data);
    }

    // Storage Service
    static async getStorage(key) {
      try {
        if (globalThis.StorageService?.getValue) {
          return await globalThis.StorageService.getValue(key);
        }
        const result = await chrome.storage.local.get(key);
        return result[key] || null;
      } catch (error) {
        if (globalThis.LogService?.warn) {
          globalThis.LogService.warn('SharedServices', 'Storage get error', { error });
        } else {
          console.error('Storage get error:', error);
        }
        return null;
      }
    }

    static async setStorage(key, value) {
      try {
        if (globalThis.StorageService?.setValue) {
          return await globalThis.StorageService.setValue(key, value);
        }
        await chrome.storage.local.set({ [key]: value });
        return true;
      } catch (error) {
        if (globalThis.LogService?.warn) {
          globalThis.LogService.warn('SharedServices', 'Storage set error', { error });
        } else {
          console.error('Storage set error:', error);
        }
        return false;
      }
    }

    static async removeStorage(keys) {
      try {
        if (globalThis.StorageService?.removeValue) {
          return await globalThis.StorageService.removeValue(keys);
        }
        await chrome.storage.local.remove(keys);
        return true;
      } catch (error) {
        if (globalThis.LogService?.warn) {
          globalThis.LogService.warn('SharedServices', 'Storage remove error', { error });
        } else {
          console.error('Storage remove error:', error);
        }
        return false;
      }
    }

    // Message Service
    static async sendMessage(type, data = {}) {
      try {
        return await chrome.runtime.sendMessage({ type, data });
      } catch (error) {
        const message = String(error?.message || error || '');
        if (message.includes('message channel closed before a response was received')) {
          if (globalThis.LogService?.debug) {
            globalThis.LogService.debug('SharedServices', 'Message channel closed before response', { type, data, error: message });
          } else if (globalThis.LogService?.log) {
            globalThis.LogService.log('SharedServices', 'Message channel closed before response', 'DEBUG', { type, data, error: message });
          } else {
            console.debug('[SharedServices] Message channel closed before response', { type, error: message });
          }
          return { success: false, ignored: true, error: message };
        }
        if (globalThis.LogService?.warn) {
          globalThis.LogService.warn('SharedServices', 'Message send error', { error });
        } else {
          console.error('Message send error:', error);
        }
        return { success: false, error: error.message };
      }
    }

    static onMessage(callback) {
      chrome.runtime.onMessage.addListener(callback);
    }

    // Theme Service
    static setTheme(theme) {
      document.body.classList.toggle('dark-mode', theme === 'dark');
    }

    // UI Notification
    static showNotification(message, type = 'info') {
      const notification = document.getElementById('notification');
      const messageEl = document.getElementById('notificationMessage');
      if (!notification || !messageEl) return;

      messageEl.textContent = message;
      notification.className = `notification ${type}`;
      notification.classList.add('show');

      setTimeout(() => {
        notification.classList.remove('show');
      }, 3000);
    }

    // Shortcut helpers
    static async getUserSettings() {
      return this.getStorage(STORAGE.USER_SETTINGS || 'userSettings');
    }

    static async setUserSettings(settings) {
      return this.setStorage(STORAGE.USER_SETTINGS || 'userSettings', settings);
    }

    static async getReadingState() {
      return this.getStorage(STORAGE.READING_STATE || 'readingState');
    }

    static async setReadingState(state) {
      return this.setStorage(STORAGE.READING_STATE || 'readingState', state);
    }

    static async getSystemLogs() {
      return this.getStorage(STORAGE.SYSTEM_LOGS || 'systemLogs');
    }

    static async setSystemLogs(logs) {
      return this.setStorage(STORAGE.SYSTEM_LOGS || 'systemLogs', logs);
    }

    static async sendCommand(type, data = {}) {
      return this.sendMessage(type, data);
    }

    static async notify(message, type = 'info') {
      return this.sendMessage(MESSAGES.NOTIFICATION || 'notification', { message, type });
    }
  }

  if (!globalThis.SharedServices) {
    globalThis.SharedServices = SharedServices;
  }
})();
