/**
 * Main Service Worker - Điểm khởi đầu của background process (Manifest V3)
 * Quản lý khởi tạo các service chính, lắng nghe sự kiện lifecycle,
 * broadcast state, và các tác vụ định kỳ
 */

import '../utils/constants.js';
import '../utils/StorageService.js';
import StateManager from './StateManager.js';
import EventHandler from './EventHandler.js';
import TTSService from '../core/TTSService.js';
import Logger from '../core/Logger.js';

const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
const STATUS = CONFIG.READING_STATUS || {};
const MESSAGES = CONFIG.MESSAGES || {};

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
      if (this.ttsService?.setLogger) {
        this.ttsService.setLogger(this.logger);
      }
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
      this.setupLifecycleListeners();

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
      if (newState.status === (STATUS.STOPPED || 'stopped') ||
          newState.status === (STATUS.FINISHED || 'finished')) {
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
      const maybePromise = chrome.runtime.sendMessage(
        {
          type: MESSAGES.STATE_UPDATE || 'stateUpdate',
          data: state
        },
        () => {
          if (chrome.runtime.lastError) {
            // ignore
          }
        }
      );
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {
          // ignore
        });
      }

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
    this.registerAlarmListeners();
    this.createAlarms();

    // Chay ngay lan dau de dam bao state va cache hop le
    this.runAutoSave();
    this.runCleanupCache();
  }

  registerAlarmListeners() {
    chrome.alarms.onAlarm.addListener((alarm) => {
      this.handleAlarm(alarm);
    });
  }

  createAlarms() {
    chrome.alarms.create('auto-save-state', {
      periodInMinutes: 1
    });

    chrome.alarms.create('cleanup-ocr-cache', {
      periodInMinutes: 60
    });
  }

  async handleAlarm(alarm) {
    try {
      switch (alarm.name) {
        case 'auto-save-state':
          await this.runAutoSave();
          break;
        case 'cleanup-ocr-cache':
          await this.runCleanupCache();
          break;
        default:
          break;
      }
    } catch (error) {
      this.logger?.error('Loi xu ly alarm', { error, name: alarm.name });
    }
  }

  async runAutoSave() {
    try {
      await this.stateManager.saveToStorage();
      this.logger?.debug('Đã tự động lưu state vào storage');
    } catch (error) {
      this.logger?.error('Lỗi auto-save state', { error });
    }
  }

  async runCleanupCache() {
    await this.cleanupOldCache();
  }

  /**
   * Lắng nghe lifecycle để dọn dẹp cache khi trình duyệt tắt
   */
  setupLifecycleListeners() {
    chrome.runtime.onSuspend.addListener(() => {
      this.clearOcrCacheOnShutdown();
    });

    chrome.runtime.onStartup.addListener(async () => {
      await this.handleStartup();
    });

    chrome.action.onClicked.addListener(async (tab) => {
      if (!tab?.id || !this.isTargetSite(tab?.url)) return;
      await this.startFromBeginning(tab.id);
    });

    chrome.tabs.onCreated.addListener(() => {
      // no-op
    });

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status !== 'complete') return;
      if (!this.isTargetSite(tab?.url)) return;
      await this.handleTabUpdated(tabId);
    });

    chrome.tabs.onRemoved.addListener(async (tabId) => {
      await this.handleTabRemoved(tabId);
    });

    chrome.webNavigation.onCompleted.addListener(async (details) => {
      if (!this.isTargetSite(details?.url)) return;
      await this.handleWebNavigationCompleted(details.tabId);
    });
  }

  async handleStartup() {
    this.logger?.log('Extension startup', { reason: 'startup' });
    await this.ensureDefaultSettings();
  }

  async ensureDefaultSettings() {
    const storageKey = CONFIG?.STORAGE_KEYS?.USER_SETTINGS || 'userSettings';
    try {
      let existing = null;
      if (globalThis.StorageService?.getUserSettings) {
        existing = await globalThis.StorageService.getUserSettings();
      } else {
        const result = await chrome.storage.local.get([storageKey]);
        existing = result[storageKey] || null;
      }
      if (!existing) {
        await this.setupDefaultSettings();
      } else {
        await this.migrateSettings();
      }
    } catch (error) {
      this.logger?.error('Lỗi kiểm tra settings khi startup', { error });
    }
  }

  isTargetSite(url = '') {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('metruyencv.com');
    } catch {
      return false;
    }
  }

  async startFromBeginning(tabId) {
    try {
      await this.stateManager.updateState({
        status: STATUS.LOADING || 'loading',
        currentLine: 0,
        totalLines: 0,
        content: [],
        autoContinue: false
      });
      await this.eventHandler.handleStartReading({ startLine: 0 }, tabId);
    } catch (error) {
      this.logger?.error('Lỗi khởi tạo đọc từ đầu', { error });
    }
  }

  async handleTabUpdated(tabId) {
    try {
      const state = await this.stateManager.getState();
      const status = state?.status;
      const inProgress = status &&
        status !== (STATUS.STOPPED || 'stopped') &&
        status !== (STATUS.FINISHED || 'finished') &&
        status !== (STATUS.ERROR || 'error');

      if (!inProgress) return;

      const content = await this.eventHandler.extractContentFromTab(tabId);
      if (content?.success) {
        await this.stateManager.updateState({
          chapterUrl: content.metadata?.chapterUrl || state.chapterUrl,
          chapterTitle: content.metadata?.chapterTitle || state.chapterTitle,
          storyTitle: content.metadata?.storyTitle || state.storyTitle,
          content: content.lines || [],
          totalLines: Array.isArray(content.lines) ? content.lines.length : state.totalLines
        });
      }

      if (status === (STATUS.PLAYING || 'playing')) {
        await this.eventHandler.handleStartReading({ startLine: state.currentLine || 0 }, tabId);
      }
    } catch (error) {
      this.logger?.error('Lỗi khi xử lý tab updated', { error });
    }
  }

  async handleTabRemoved(tabId) {
    try {
      const state = await this.stateManager.getState();
      if (state?.chapterUrl) {
        await this.ttsService?.stop?.();
        await this.stateManager.updateState({
          status: STATUS.STOPPED || 'stopped',
          chapterUrl: '',
          chapterTitle: '',
          storyTitle: '',
          content: [],
          currentLine: 0,
          totalLines: 0,
          autoContinue: false
        });
      }
    } catch (error) {
      this.logger?.error('Lỗi khi xử lý tab removed', { error, tabId });
    }
  }

  async handleWebNavigationCompleted(tabId) {
    try {
      const state = await this.stateManager.getState();
      const shouldContinue = state?.autoContinue === true;
      const isPlaying = state?.status === (STATUS.PLAYING || 'playing');
      if (!shouldContinue && !isPlaying) return;

      await this.stateManager.updateState({ autoContinue: false });
      const startLine = shouldContinue ? 0 : (state.currentLine || 0);
      await this.eventHandler.handleStartReading({ startLine }, tabId);
    } catch (error) {
      this.logger?.error('Lỗi khi xử lý webNavigation completed', { error });
    }
  }

  /**
   * Xóa cache OCR khi trình duyệt tắt (hoặc SW bị terminate)
   */
  async clearOcrCacheOnShutdown() {
    try {
      if (globalThis.StorageService?.clearOcrCache) {
        await globalThis.StorageService.clearOcrCache();
      } else {
        const storage = this.getCacheStorage();
        const cacheKey = CONFIG?.STORAGE_KEYS?.OCR_CACHE || 'ocrCache';
        await storage.remove([cacheKey]);
      }
      this.logger?.log('Đã xóa cache OCR khi tắt trình duyệt');
    } catch (error) {
      this.logger?.error('Lỗi khi xóa cache OCR khi tắt trình duyệt', { error });
    }
  }

  /**
   * Dọn dẹp cache OCR cũ (giữ lại 24 giờ gần nhất)
   */
  async cleanupOldCache() {
    try {
      let entries = [];
      if (globalThis.StorageService?.getOcrCache) {
        entries = await globalThis.StorageService.getOcrCache();
      } else {
        const storage = this.getCacheStorage();
        const cacheKey = CONFIG?.STORAGE_KEYS?.OCR_CACHE || 'ocrCache';
        const result = await storage.get([cacheKey]);
        entries = result[cacheKey] || [];
      }
      if (entries && Array.isArray(entries)) {
        const now = Date.now();
        const filteredCache = entries.filter(entry => {
          return (now - entry.timestamp) < (24 * 60 * 60 * 1000); // 24 giờ
        });

        if (filteredCache.length !== entries.length) {
          if (globalThis.StorageService?.setOcrCache) {
            await globalThis.StorageService.setOcrCache(filteredCache);
          } else {
            const storage = this.getCacheStorage();
            const cacheKey = CONFIG?.STORAGE_KEYS?.OCR_CACHE || 'ocrCache';
            await storage.set({ [cacheKey]: filteredCache });
          }
          this.logger?.log('Đã dọn dẹp cache OCR cũ', { remaining: filteredCache.length });
        }
      }
    } catch (error) {
      this.logger?.error('Lỗi dọn dẹp cache', { error });
    }
  }

  /**
   * Ưu tiên dùng storage.session để cache tự xóa khi tắt browser
   */
  getCacheStorage() {
    if (globalThis.StorageService?.getArea) {
      return globalThis.StorageService.getArea('session') || chrome.storage.local;
    }
    if (chrome.storage && chrome.storage.session) {
      return chrome.storage.session;
    }
    return chrome.storage.local;
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
    const storageKey = CONFIG?.STORAGE_KEYS?.USER_SETTINGS || 'userSettings';
    const defaultSettings = CONFIG?.DEFAULT_SETTINGS || {};

    try {
      if (globalThis.StorageService?.setUserSettings) {
        await globalThis.StorageService.setUserSettings(defaultSettings);
      } else {
        await chrome.storage.local.set({ [storageKey]: defaultSettings });
      }
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

