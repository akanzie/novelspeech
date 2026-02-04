/**
 * BackgroundService - core background orchestration (Manifest V3 service worker)
 * Extracted from background/service-worker.js to make it testable.
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
  constructor(options = {}) {
    this.stateManager = options.stateManager || null;
    this.eventHandler = options.eventHandler || null;
    this.ttsService = options.ttsService || null;
    this.logger = options.logger || null;

    if (options.autoInit !== false) {
      this.init();
    }
  }

  async init() {
    try {
      this.logger?.log('🚀 Đang khởi tạo Background Service...');

      this.logger = this.logger || new Logger();
      this.stateManager = this.stateManager || new StateManager();
      this.ttsService = this.ttsService || new TTSService();
      if (this.ttsService?.setLogger) {
        this.ttsService.setLogger(this.logger);
      }
      this.eventHandler = this.eventHandler || new EventHandler();

      this.eventHandler.setLogger(this.logger);
      this.eventHandler.setStateManager(this.stateManager);
      this.eventHandler.setTTSService(this.ttsService);

      this.setupStateListeners();
      this.setupTTSEventListeners();
      this.setupPeriodicTasks();
      this.setupLifecycleListeners();

      this.logger?.log('✅ Background Service đã khởi tạo thành công');
    } catch (error) {
      this.logger?.error('Khởi tạo Background Service thất bại', { error });
    }
  }

  setupStateListeners() {
    this.stateManager.addListener(async (oldState, newState) => {
      await this.broadcastStateUpdate(newState);

      if (newState.status === (STATUS.STOPPED || 'stopped') ||
          newState.status === (STATUS.FINISHED || 'finished')) {
        await this.stateManager.saveReadingHistory();
        this.logger?.log('Đã lưu lịch sử đọc', { status: newState.status });
      }
    });
  }

  setupTTSEventListeners() {
    // reserved for future
  }

  async broadcastStateUpdate(state) {
    try {
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
        maybePromise.catch(() => {});
      }

      this.logger?.debug('Đã broadcast state update', { state });
    } catch (error) {
      this.logger?.error('Lỗi khi broadcast state update', { error });
    }
  }

  setupPeriodicTasks() {
    this.registerAlarmListeners();
    this.createAlarms();

    this.runAutoSave();
    this.runCleanupCache();
  }

  registerAlarmListeners() {
    chrome.alarms.onAlarm.addListener((alarm) => {
      this.handleAlarm(alarm);
    });
  }

  createAlarms() {
    chrome.alarms.create('auto-save-state', { periodInMinutes: 1 });
    chrome.alarms.create('cleanup-ocr-cache', { periodInMinutes: 60 });
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
      this.logger?.error('Lỗi khi xử lý alarm', { error, alarm });
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

  setupLifecycleListeners() {
    chrome.runtime.onSuspend.addListener(() => {
      this.clearOcrCacheOnShutdown();
    });

    chrome.runtime.onStartup.addListener(async () => {
      await this.handleStartup();
    });

    chrome.action.onClicked.addListener(async (tab) => {
      if (!tab?.id || !this.isTargetChapterUrl(tab?.url)) return;
      await this.startFromBeginning(tab.id);
    });

    chrome.tabs.onCreated.addListener(() => {});

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status !== 'complete') return;
      if (!this.isTargetChapterUrl(tab?.url)) return;
      await this.handleTabUpdated(tabId);
    });

    chrome.tabs.onRemoved.addListener(async (tabId) => {
      await this.handleTabRemoved(tabId);
    });

    chrome.webNavigation.onCompleted.addListener(async (details) => {
      if (!this.isTargetChapterUrl(details?.url)) return;
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

  /**
   * Chỉ xử lý khi đúng format chương:
   * metruyencv.com/truyen/x/chuong-y
   */
  isTargetChapterUrl(url = '') {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('metruyencv.com')) return false;
      const path = parsed.pathname || '';
      return /^\/truyen\/[^/]+\/chuong-\d+\/?$/i.test(path);
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
      if (state?.tabId && tabId !== state.tabId) return;
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
      if (state?.tabId && tabId !== state.tabId) return;
      if (state?.chapterUrl) {
        await this.ttsService?.stop?.();
        await this.stateManager.updateState({
          status: STATUS.STOPPED || 'stopped',
          tabId: null,
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
      if (state?.tabId && tabId !== state.tabId) return;
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
        const filteredCache = entries.filter(entry => (now - entry.timestamp) < (24 * 60 * 60 * 1000));

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

  getCacheStorage() {
    if (globalThis.StorageService?.getArea) {
      return globalThis.StorageService.getArea('session') || chrome.storage.local;
    }
    if (chrome.storage && chrome.storage.session) {
      return chrome.storage.session;
    }
    return chrome.storage.local;
  }

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

  async migrateSettings() {
    this.logger?.log('Đang di chuyển settings cho version mới...');
  }
}

export default BackgroundService;
export { BackgroundService };
