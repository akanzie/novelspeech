/**
 * Base class for all UI components
 * Đã sửa để hỗ trợ popup và các UI components khác
 */

class BaseUI {
  constructor() {
    this.services = null;
    this.state = {};
    this.elements = {};
    this.isInitialized = false;

    // Initialize SharedServices
    if (typeof SharedServices !== 'undefined') {
      this.services = SharedServices;
    } else {
      // Fallback basic services
      this.services = {
        log: (message, level = 'info') => {
          if (globalThis.LogService?.log) {
            globalThis.LogService.log('BaseUI', message, level);
            return;
          }
          console.log(`[${level}] ${message}`);
        },
        showNotification: (message, type = 'info') => {
          console.log(`Thông báo [${type}]: ${message}`);
          this.showNotification(message, type);
        },
        getStorage: async (key) => {
          if (globalThis.StorageService?.getValue) {
            return globalThis.StorageService.getValue(key);
          }
          return new Promise(resolve => {
            chrome.storage.local.get([key], result => resolve(result[key]));
          });
        },
        setStorage: async (key, value) => {
          if (globalThis.StorageService?.setValue) {
            return globalThis.StorageService.setValue(key, value);
          }
          return new Promise(resolve => {
            chrome.storage.local.set({ [key]: value }, () => resolve());
          });
        },
        sendMessage: async (type, data = {}) => {
          return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type, data }, response => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
        },
        setTheme: (theme) => {
          document.body.classList.toggle('dark-mode', theme === 'dark');
        }
      };
    }

    // Auto-initialize when DOM is ready
    this.autoInitialize();
  }

  autoInitialize() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      this.services.log(this.constructor.name, 'Đang khởi tạo...', 'info');

      this.initElements();
      this.bindEvents();
      await this.loadData();
      this.setupTheme();

      this.isInitialized = true;
      this.services.log(this.constructor.name, 'Khởi tạo thành công', 'info');

    } catch (error) {
      this.services.handleError?.(error, `Khoi tao ${this.constructor.name} that bai`);
      this.services.log(this.constructor.name, 'Lỗi khởi tạo', 'error');
    }
  }

  log(message, level = 'info') {
    this.services?.log(this.constructor.name, message, level);
  }

  initElements() {
    throw new Error('initElements() must be implemented by child class');
  }

  bindEvents() {
    throw new Error('bindEvents() must be implemented by child class');
  }

  async loadData() {
    // Can be overridden by child class
  }

  setupTheme() {
    // Auto-detect dark mode preference
    const darkMode = localStorage.getItem('darkMode') === 'true';
    document.body.classList.toggle('dark-mode', darkMode);
  }

  async sendCommand(command, data = {}) {
    try {
      this.services.log(this.constructor.name, `Gửi lệnh: ${command}`, 'info');

      const response = await this.services.sendMessage(command, data);

      if (response && response.success) {
        this.services.showNotification('Thành công', 'success');
      } else if (response && response.error) {
        throw new Error(response.error);
      }

      return response;
    } catch (error) {
      this.handleError(error, `Command: ${command}`);
      return { success: false, error: error.message };
    }
  }

  updateUI() {
    // To be implemented by child class
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `base-notification notification-${type}`;
    notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;

    // Add styles
    if (!document.getElementById('base-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'base-notification-styles';
      style.textContent = `
                .base-notification {
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
    }, 3000);

    return notification;
  }

  getNotificationIcon(type) {
    const icons = {
      'info': 'info-circle',
      'success': 'check-circle',
      'error': 'exclamation-circle',
      'warning': 'exclamation-triangle'
    };
    return icons[type] || 'info-circle';
  }

  handleError(error, context) {
    this.services.log(this.constructor.name, `${context}: ${error.message || 'Lỗi không xác định'}`, 'error');
    this.showNotification(`Lỗi: ${error.message || context}`, 'error');
    return { success: false, error: error.message };
  }

  // Helper methods
  debounce(func, wait) {
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

  throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  createElement(tag, attributes = {}, children = []) {
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
}
