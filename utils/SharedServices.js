/**
 * Shared Services for all UI components
 */

class SharedServices {
  // Storage Service
  static async getStorage(key) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] || null;
    } catch (error) {
      console.error('Storage get error:', error);
      return null;
    }
  }

  static async setStorage(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (error) {
      console.error('Storage set error:', error);
      return false;
    }
  }

  static async removeStorage(keys) {
    try {
      await chrome.storage.local.remove(keys);
      return true;
    } catch (error) {
      console.error('Storage remove error:', error);
      return false;
    }
  }

  // Message Service
  static async sendMessage(type, data = {}) {
    try {
      return await chrome.runtime.sendMessage({ type, data });
    } catch (error) {
      console.error('Message send error:', error);
      return { success: false, error: error.message };
    }
  }

  static onMessage(callback) {
    chrome.runtime.onMessage.addListener(callback);
  }

  // Theme Service
  static setupTheme() {
    const darkMode = localStorage.getItem('darkMode') === 'true';
    document.body.classList.toggle('dark-mode', darkMode);

    // Listen for system theme changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const isDarkMode = e.matches;
        if (localStorage.getItem('themePreference') === 'auto') {
          document.body.classList.toggle('dark-mode', isDarkMode);
        }
      });
    }
  }

  static setTheme(theme) {
    const isDark = theme === 'dark' ||
      (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('darkMode', isDark);
    localStorage.setItem('themePreference', theme);
  }

  // Notification Service
  static showNotification(message, type = 'info', duration = 3000) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `shared-notification notification-${type}`;
    notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;

    // Add styles if not already present
    const styleId = 'shared-notification-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
                .shared-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 12px 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    z-index: 10000;
                    animation: slideIn 0.3s ease;
                    max-width: 300px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    color: white;
                    font-size: 14px;
                }
                
                .notification-info { background: #2196F3; }
                .notification-success { background: #4CAF50; }
                .notification-error { background: #f44336; }
                .notification-warning { background: #ff9800; }
                
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Auto remove
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        if (notification.parentNode) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, duration);

    return notification;
  }

  static getNotificationIcon(type) {
    const icons = {
      'info': 'info-circle',
      'success': 'check-circle',
      'error': 'exclamation-circle',
      'warning': 'exclamation-triangle'
    };
    return icons[type] || 'info-circle';
  }

  // Logger Service
  static log(module, message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      module,
      level,
      message,
      url: window.location.href
    };

    // Console logging with colors
    const colors = {
      info: 'color: blue;',
      success: 'color: green; font-weight: bold',
      error: 'color: red; font-weight: bold',
      warn: 'color: orange;'
    };

    const style = colors[level] || colors.info;
    console.log(`%c[${module}] ${message}`, style);

    // Save to storage (keep last 100 logs)
    this.getStorage('systemLogs').then(logs => {
      const systemLogs = logs || [];
      systemLogs.unshift(logEntry);
      if (systemLogs.length > 100) {
        systemLogs.pop();
      }
      this.setStorage('systemLogs', systemLogs);
    });
  }

  // Error Handler
  static handleError(error, context) {
    this.log('ErrorHandler', `${context}: ${error.message}`, 'error');
    this.showNotification(`Lỗi: ${context}`, 'error');
    return { success: false, error: error.message };
  }

  // Loading States
  static showLoading(selector = 'body') {
    const element = document.querySelector(selector);
    if (element) {
      element.style.opacity = '0.7';
      element.style.pointerEvents = 'none';
    }
  }

  static hideLoading(selector = 'body') {
    const element = document.querySelector(selector);
    if (element) {
      element.style.opacity = '1';
      element.style.pointerEvents = 'auto';
    }
  }

  // Formatting utilities
  static formatNumber(num) {
    return num.toLocaleString('vi-VN');
  }

  static formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours} giờ ${minutes % 60} phút`;
    } else if (minutes > 0) {
      return `${minutes} phút ${seconds % 60} giây`;
    } else {
      return `${seconds} giây`;
    }
  }

  static formatProgress(current, total) {
    if (total === 0) return '0%';
    const percentage = Math.round((current / total) * 100);
    return `${percentage}%`;
  }

  // Validation utilities
  static isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  static isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  // DOM utilities
  static async waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkElement = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        } else {
          setTimeout(checkElement, 100);
        }
      };

      checkElement();
    });
  }

  static createElement(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);

    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'textContent') {
        element.textContent = value;
      } else if (key === 'html') {
        element.innerHTML = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        element.addEventListener(key.substring(2).toLowerCase(), value);
      } else {
        element.setAttribute(key, value);
      }
    });

    children.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        element.appendChild(child);
      }
    });

    return element;
  }

  // Audio utilities
  static async playAudio(url, volume = 1.0) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audio.volume = volume;
      audio.onended = resolve;
      audio.onerror = reject;
      audio.play().catch(reject);
    });
  }

  // File utilities
  static downloadFile(filename, content, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Performance utilities
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // Cache utilities
  static cache = new Map();

  static async cacheGet(key, fetchFn, ttl = 60000) {
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.value;
    }

    const value = await fetchFn();
    this.cache.set(key, { value, timestamp: Date.now() });
    return value;
  }

  static cacheSet(key, value) {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  static cacheClear() {
    this.cache.clear();
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.SharedServices = SharedServices;
}
