/**
 * Main Service Worker - Điểm khởi đầu của background process (Manifest V3)
 * Quản lý khởi tạo các service chính, lắng nghe sự kiện lifecycle,
 * broadcast state, và các tác vụ định kỳ
 */

import StateManager from './StateManager.js';
import EventHandler from './EventHandler.js';
import TTSService from '../core/services/TTSService.js';
import Logger from '../core/services/Logger.js';

class BackgroundService {
  constructor() {
    this.stateManager = null;
    this.eventHandler = null;
    this.ttsService = null;
    this.logger = null;

    this.init();
  }

  /**
   * Khởi tạo toàn bộ background service
   */
  async init() {
    try {
      this.logger?.log('🚀 Đang khởi tạo Background Service...');

      // Khởi tạo các service theo thứ tự hợp lý
      this.logger = new Logger();
      this.stateManager = new StateManager();
      this.ttsService = new TTSService();
      this.eventHandler = new EventHandler();

      // Dependency injection - liên kết các service
      this.eventHandler.setLogger(this.logger);
      this.eventHandler.setStateManager(this.stateManager);
      this.eventHandler.setTTSService(this.ttsService);

      // Thiết lập listener cho state changes
      this.setupStateListeners();

      // Thiết lập listener cho TTS events (nếu cần mở rộng sau)
      this.setupTTSEventListeners();

      // Thiết lập các tác vụ định kỳ (auto-save, cleanup cache)
      this.setupPeriodicTasks();

      this.logger?.log('✅ Background Service đã khởi tạo thành công');

    } catch (error) {
      this.logger?.error('Khởi tạo Background Service thất bại', { error });
    }
  }

  /**
   * Lắng nghe thay đổi trạng thái từ StateManager
   * → Broadcast cho popup/sidepanel và lưu history khi cần
   */
  setupStateListeners() {
    this.stateManager.addListener(async (oldState, newState) => {
      // Broadcast state update tới tất cả UI components
      await this.broadcastStateUpdate(newState);

      // Lưu lịch sử đọc khi dừng hoặc đọc xong chương
      if (newState.status === 'stopped' || newState.status === 'finished') {
        await this.stateManager.saveReadingHistory();
        this.logger?.log('Đã lưu lịch sử đọc', { status: newState.status });
      }
    });
  }

  /**
   * Lắng nghe sự kiện từ TTSService (hiện tại để trống - mở rộng sau nếu cần)
   */
  setupTTSEventListeners() {
    // Ví dụ: this.ttsService.onError((err) => this.logger?.error('Lỗi TTS', { err }));
  }

  /**
   * Broadcast state update tới popup và sidepanel
   * (fire-and-forget - không lỗi nếu UI chưa mở)
   */
  async broadcastStateUpdate(state) {
    try {
      // Gửi tới popup/sidepanel (cùng type message)
      chrome.runtime.sendMessage({
        type: 'stateUpdate',
        data: state
      }).catch(() => {
        // Popup/sidepanel có thể chưa mở → bỏ qua lỗi
      });

      this.logger?.debug('Đã broadcast state update', { state });
    } catch (error) {
      this.logger?.error('Lỗi khi broadcast state update', { error });
    }
  }

  /**
   * Thiết lập các tác vụ định kỳ
   * (auto-save state và cleanup cache)
   */
  setupPeriodicTasks() {
    // Auto-save state mỗi phút
    setInterval(async () => {
      try {
        await this.stateManager.saveToStorage();
        this.logger?.debug('Đã tự động lưu state vào storage');
      } catch (error) {
        this.logger?.error('Lỗi auto-save state', { error });
      }
    }, 60000);

    // Cleanup cache OCR mỗi giờ
    setInterval(async () => {
      await this.cleanupOldCache();
    }, 3600000); // 1 giờ
  }

  /**
   * Dọn dẹp cache OCR cũ (giữ lại 24 giờ gần nhất)
   */
  async cleanupOldCache() {
    try {
      const result = await chrome.storage.local.get(['ocrCache']);
      if (result.ocrCache && Array.isArray(result.ocrCache)) {
        const now = Date.now();
        const filteredCache = result.ocrCache.filter(entry => {
          return (now - entry.timestamp) < (24 * 60 * 60 * 1000); // 24 giờ
        });

        if (filteredCache.length !== result.ocrCache.length) {
          await chrome.storage.local.set({ ocrCache: filteredCache });
          this.logger?.log('Đã dọn dẹp cache OCR cũ', { remaining: filteredCache.length });
        }
      }
    } catch (error) {
      this.logger?.error('Lỗi dọn dẹp cache', { error });
    }
  }

  /**
   * Xử lý sự kiện install/update của extension
   */
  handleInstall() {
    chrome.runtime.onInstalled.addListener(async (details) => {
      this.logger?.log('Extension được cài đặt/cập nhật', { reason: details.reason });

      if (details.reason === 'install') {
        await this.setupDefaultSettings();
      } else if (details.reason === 'update') {
        await this.migrateSettings();
      }
    });
  }

  /**
   * Thiết lập settings mặc định khi cài đặt lần đầu
   */
  async setupDefaultSettings() {
    const defaultSettings = {
      userSettings: {
        general: {
          autoStart: false,
          autoNextChapter: false,
          saveHistory: true,
          pageLoadTimeout: 10
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
          highlightOpacity: 0.3
        },
        advanced: {
          ocrLanguage: 'vie',
          cacheOCRResults: true,
          enableDebug: false
        }
      }
    };

    try {
      await chrome.storage.local.set(defaultSettings);
      this.logger?.log('Đã lưu settings mặc định');
    } catch (error) {
      this.logger?.error('Lỗi lưu settings mặc định', { error });
    }
  }

  /**
   * Di chuyển settings khi update version (mở rộng sau nếu cần)
   */
  async migrateSettings() {
    this.logger?.log('Đang di chuyển settings cho version mới...');
    // Thêm logic migration ở đây khi cần
  }
}

// Khởi tạo background service ngay khi service worker load
const backgroundService = new BackgroundService();

// Đăng ký xử lý install/update
backgroundService.handleInstall();

// Export để test/debug (nếu chạy trong environment có window)
if (typeof window !== 'undefined') {
  window.backgroundService = backgroundService;
}

export default backgroundService;
