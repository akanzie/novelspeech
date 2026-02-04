/**
 * Event Handler - Xử lý tin nhắn và sự kiện giữa các thành phần của extension
 * (background script, content script, popup, TTS service...)
 */

import '../utils/constants.js';
import '../utils/StorageService.js';

const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
const STATUS = CONFIG.READING_STATUS || {};
const STORAGE = CONFIG.STORAGE_KEYS || {};
const TTS = CONFIG.TTS_ENGINES || {};
const MESSAGES = CONFIG.MESSAGES || {};
class EventHandler {
  constructor() {
    this.messageHandlers = new Map(); // Không sử dụng hiện tại, giữ lại để mở rộng sau
    this.stateManager = null;        // Quản lý trạng thái đọc (dòng hiện tại, nội dung, settings...)
    this.ttsService = null;          // Dịch vụ Text-to-Speech
    this.logger = null;              // Logger service (quản lý log thống nhất)

    this.init();
  }

  /**
   * Khởi tạo các listener cho tin nhắn và kết nối
   */
  async init() {
    // Lắng nghe tin nhắn từ content script hoặc popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      return this.handleMessage(message, sender, sendResponse);
    });

    // Lắng nghe kết nối dài (port) từ content script hoặc popup
    chrome.runtime.onConnect.addListener((port) => {
      this.handleConnection(port);
    });

    this.logger?.log('✅ Bộ xử lý sự kiện đã khởi tạo');
  }

  /**
   * Gán StateManager instance
   */
  setStateManager(stateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Gán TTSService instance
   */
  setTTSService(ttsService) {
    this.ttsService = ttsService;
  }

  /**
   * Gán Logger instance (dependency injection)
   */
  setLogger(logger) {
    this.logger = logger;
  }

  /**
   * Xử lý tin nhắn nhận được từ các thành phần khác
   * @param {Object} message - Tin nhắn
   * @param {Object} sender - Thông tin người gửi
   * @param {Function} sendResponse - Hàm trả về response
   * @returns {boolean} true để báo hiệu response bất đồng bộ
   */
  async handleMessage(message, sender, sendResponse) {
    this.logger?.log(`📨 Đã nhận tin nhắn: ${message.type}`, { type: message.type, message });

    try {
      let response;
      switch (message.type) {
        case MESSAGES.START_READING || 'startReading':
          response = await this.handleStartReading(message.data, sender.tab?.id);
          break;
        case MESSAGES.PAUSE_READING || 'pauseReading':
          response = await this.handlePauseReading();
          break;
        case MESSAGES.RESUME_READING || 'resumeReading':
          response = await this.handleResumeReading();
          break;
        case MESSAGES.STOP_READING || 'stopReading':
          response = await this.handleStopReading();
          break;
        case MESSAGES.NEXT_LINE || 'nextLine':
          response = await this.handleNextLine();
          break;
        case MESSAGES.PREV_LINE || 'prevLine':
          response = await this.handlePrevLine();
          break;
        case MESSAGES.UPDATE_SETTINGS || 'updateSettings':
          response = await this.handleUpdateSettings(message.data);
          break;
        case MESSAGES.GET_STATE || 'getState':
          response = await this.handleGetState();
          break;
        case MESSAGES.EXTRACT_CONTENT || 'extractContent':
          response = await this.handleExtractContent(sender.tab?.id);
          break;
        case MESSAGES.CONTENT_EXTRACTED || 'contentExtracted':
          response = await this.handleContentExtracted(message.data, sender.tab?.id);
          break;
        case MESSAGES.HIGHLIGHT_LINE || 'highlightLine':
          response = await this.handleHighlightLine(message.data, sender.tab?.id);
          break;
        case MESSAGES.SYNC_STATE || 'syncState':
          response = await this.handleSyncState(message.data);
          break;
        case MESSAGES.SETTINGS_UPDATED || 'settingsUpdated':
          response = await this.handleSettingsUpdated(message.data);
          break;
        case MESSAGES.PREV_CHAPTER || 'prevChapter':
          response = await this.handleNavigateChapter('prev', sender.tab?.id);
          break;
        case MESSAGES.NEXT_CHAPTER || 'nextChapter':
          response = await this.handleNavigateChapter('next', sender.tab?.id);
          break;
        case MESSAGES.SWITCH_CHAPTER || 'switchChapter':
          response = await this.handleSwitchChapter(message.data?.url, sender.tab?.id);
          break;
        case MESSAGES.GET_VOICES || 'getVoices':
          response = await this.handleGetVoices();
          break;
        case MESSAGES.LOG || 'log':
          response = await this.handleLog(message.data);
          break;
        default:
          response = { success: false, error: 'Loại tin nhắn không xác định' };
      }
      sendResponse(response);
    } catch (error) {
      this.logger?.error('Lỗi xử lý tin nhắn', { error });
      sendResponse({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }

    // Trả về true để cho phép response bất đồng bộ
    return true;
  }

  /**
   * Xử lý kết nối port (kết nối dài) từ content script hoặc popup
   * @param {Port} port - Port kết nối
   */
  handleConnection(port) {
    this.logger?.log('🔗 Đã thiết lập kết nối', { portName: port.name });

    port.onMessage.addListener((message) => {
      this.handleMessage(message, { tab: { id: port.sender?.tab?.id } }, (response) => {
        port.postMessage({ ...response, _id: message._id });
      });
    });

    port.onDisconnect.addListener(() => {
      this.logger?.log('🔌 Kết nối đã đóng', { portName: port.name });
    });
  }

  /**
   * Xử lý lệnh bắt đầu đọc
   * @param {Object} data - Dữ liệu kèm theo (startLine, settings...)
   * @param {number} tabId - ID của tab hiện tại
   */
  async handleStartReading(data, tabId) {
    try {
      const targetTabId = tabId || await this.getActiveTabId();
      if (!targetTabId) {
        throw new Error('Không tìm thấy tab đang hoạt động');
      }

      await this.stateManager.updateState({
        status: STATUS.LOADING || 'loading'
      });

      const settings = await this.buildReadingSettings(data?.settings);

      // Đảm bảo dừng TTS cũ trước khi bắt đầu session mới (tránh chồng giọng nói)
      this.ttsService.stop();

      // Bước 1: Trích xuất nội dung từ trang
      this.logger?.log('Bước 1: Đang trích xuất nội dung từ trang...');
      const content = await this.extractContentFromTab(targetTabId);
      if (!content || !content.success) {
        throw new Error('Trích xuất nội dung thất bại: ' + (content?.error || 'Lỗi không xác định'));
      }

      const linesCount = Array.isArray(content.lines) ? content.lines.length : 0;
      const preview = Array.isArray(content.lines) && content.lines[0]
        ? String(content.lines[0]).slice(0, 120)
        : '';
      this.logger?.log('Bước 1: Đã trích xuất nội dung', {
        lines: linesCount,
        length: content.length || 0,
        preview
      });

      if (linesCount === 0) {
        throw new Error('Không có nội dung để đọc (lines = 0)');
      }

      // Bước 2: Cập nhật trạng thái với nội dung mới
      this.logger?.log('Bước 2: Đang cập nhật trạng thái đọc...');
      await this.stateManager.updateState({
        status: STATUS.PLAYING || 'playing',
        chapterUrl: content.metadata.chapterUrl,
        chapterTitle: content.metadata.chapterTitle,
        storyTitle: content.metadata.storyTitle,
        content: content.lines,
        currentLine: data?.startLine || 0,
        totalLines: content.lines.length,
        settings
      });

      // Bước 3: Bắt đầu đọc từ dòng hiện tại
      this.logger?.log('Bước 3: Bắt đầu đọc bằng giọng nói...');
      await this.startReadingFromCurrentLine();

      return { success: true, contentLength: content.lines.length };
    } catch (error) {
      this.logger?.error('Lỗi khi bắt đầu đọc', { error: error?.message || String(error) });
      return { success: false, error: error.message };
    }
  }

  /**
   * Gửi lệnh trích xuất nội dung tới content script trong tab
   * @param {number} tabId - ID tab
   */
  async extractContentFromTab(tabId) {
    if (!tabId) {
      throw new Error('Không tìm thấy tab đang hoạt động');
    }
    const options = await this.getExtractOptions();
    return this.safeSendMessage(tabId, { type: MESSAGES.EXTRACT_CONTENT || 'extractContent', data: options });
  }

  /**
   * Bắt đầu đọc dòng hiện tại bằng TTS và highlight dòng tương ứng
   */
  async startReadingFromCurrentLine() {
    const state = await this.stateManager.getState();

    if (!state.content || state.currentLine >= state.content.length) {
      this.logger?.warn('Không có nội dung để đọc hoặc đã đến cuối chương');
      return;
    }

    const currentLine = state.content[state.currentLine];
    const currentPreview = currentLine ? String(currentLine).slice(0, 120) : '';
    this.logger?.log('Chuẩn bị đọc dòng', {
      index: state.currentLine,
      total: state.content.length,
      preview: currentPreview
    });

    // Phát giọng nói - await để đảm bảo hoàn thành trước khi return (nếu cần)
    await this.ttsService.speak(currentLine, {
      rate: state.settings?.rate || 1.0,
      pitch: state.settings?.pitch || 1.0,
      volume: state.settings?.volume || 1.0,
      voice: state.settings?.voice,
      useEdgeTTS: state.settings?.engine === (TTS.EDGE_TTS || 'edge'),
      onStart: () => {
        this.logger?.log('🎤 Bắt đầu đọc dòng', { lineIndex: state.currentLine + 1 });
      },
      onEnd: () => {
        this.handleLineFinished();
      },
      onError: (error) => {
        this.logger?.error('Lỗi TTS', { error });
        this.stateManager.updateState({ status: STATUS.ERROR || 'error' });
      }
    });
  }

  /**
   * Gửi lệnh highlight dòng hiện tại tới content script
   * (fire-and-forget - không cần await response vì không ảnh hưởng logic chính)
   */
  async highlightCurrentLine() {
    const state = await this.stateManager.getState();
    const tabId = await this.getActiveTabId();

    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: MESSAGES.HIGHLIGHT_LINE || 'highlightLine',
        data: {
          lineIndex: state.currentLine,
          autoScroll: state.settings?.autoScroll !== false,
          highlight: state.settings?.highlight !== false
        }
      });
    }
  }

  /**
   * Xử lý khi hoàn thành một dòng - chuyển sang dòng tiếp theo
   * (gọi từ callback onEnd → chain bất đồng bộ sequential)
   */
  async handleLineFinished() {
    const state = await this.stateManager.getState();
    const nextLine = state.currentLine + 1;

    if (nextLine < state.totalLines) {
      await this.stateManager.updateState({
        currentLine: nextLine,
        status: STATUS.PLAYING || 'playing'
      });
      await this.startReadingFromCurrentLine();
    } else {
      // Đã đọc xong toàn bộ chương
      await this.stateManager.updateState({
        status: STATUS.FINISHED || 'finished',
        currentLine: 0,
        autoContinue: true
      });
      this.logger?.log('✅ Đã đọc xong chương');
      try {
        const tabId = await this.getActiveTabId();
        if (tabId) {
          await this.handleNavigateChapter('next', tabId);
        }
      } catch (error) {
        this.logger?.error('Lỗi khi tự chuyển chương', { error });
      }
    }
  }

  /** Tạm dừng đọc */
  async handlePauseReading() {
    try {
      const paused = this.ttsService.pause();
      if (paused) {
        await this.stateManager.updateState({ status: STATUS.PAUSED || 'paused' });
        return { success: true, status: STATUS.PAUSED || 'paused' };
      }
      return { success: false, error: 'Không thể tạm dừng' };
    } catch (error) {
      this.logger?.error('Lỗi khi tạm dừng đọc', { error });
      return { success: false, error: error.message };
    }
  }

  /** Tiếp tục đọc */
  async handleResumeReading() {
    try {
      const resumed = this.ttsService.resume();
      if (resumed) {
        await this.stateManager.updateState({ status: STATUS.PLAYING || 'playing' });
        return { success: true, status: STATUS.PLAYING || 'playing' };
      }
      return { success: false, error: 'Không thể tiếp tục' };
    } catch (error) {
      this.logger?.error('Lỗi khi tiếp tục đọc', { error });
      return { success: false, error: error.message };
    }
  }

  /** Dừng đọc hoàn toàn */
  async handleStopReading() {
    try {
      const stopped = this.ttsService.stop();
      if (stopped) {
        await this.stateManager.updateState({
          status: STATUS.STOPPED || 'stopped',
          currentLine: 0
        });
        return { success: true, status: STATUS.STOPPED || 'stopped' };
      }
      return { success: false, error: 'Không thể dừng' };
    } catch (error) {
      this.logger?.error('Lỗi khi dừng đọc', { error });
      return { success: false, error: error.message };
    }
  }

  /** Chuyển tới dòng tiếp theo */
  async handleNextLine() {
    try {
      const state = await this.stateManager.getState();
      const nextLine = Math.min(state.currentLine + 1, state.totalLines - 1);

      if (nextLine !== state.currentLine) {
        this.ttsService.stop();
        await this.stateManager.updateState({
          currentLine: nextLine,
          status: STATUS.PLAYING || 'playing'
        });
        await this.startReadingFromCurrentLine();
        return { success: true, currentLine: nextLine };
      }
      return { success: false, error: 'Đã ở dòng cuối cùng' };
    } catch (error) {
      this.logger?.error('Lỗi khi chuyển dòng tiếp theo', { error: error?.message || String(error) });
      return { success: false, error: error.message };
    }
  }

  /** Quay lại dòng trước */
  async handlePrevLine() {
    try {
      const state = await this.stateManager.getState();
      const prevLine = Math.max(state.currentLine - 1, 0);

      if (prevLine !== state.currentLine) {
        this.ttsService.stop();
        await this.stateManager.updateState({
          currentLine: prevLine,
          status: STATUS.PLAYING || 'playing'
        });
        await this.startReadingFromCurrentLine();
        return { success: true, currentLine: prevLine };
      }
      return { success: false, error: 'Đã ở dòng đầu tiên' };
    } catch (error) {
      this.logger?.error('Lỗi khi quay lại dòng trước', { error: error?.message || String(error) });
      return { success: false, error: error.message };
    }
  }

  /** Cập nhật cài đặt (tốc độ, giọng nói, âm lượng...) */
  async handleUpdateSettings(settings) {
    try {
      const state = await this.stateManager.getState();
      const mergedSettings = { ...(state.settings || {}), ...(settings || {}) };
      await this.stateManager.updateState({ settings: mergedSettings });
      if (settings?.voice) {
        this.ttsService?.setVoice?.(settings.voice);
      }
      return { success: true };
    } catch (error) {
      this.logger?.error('Lỗi khi cập nhật settings', { error });
      return { success: false, error: error.message };
    }
  }

  /** Lấy trạng thái hiện tại */
  async handleGetState() {
    try {
      const state = await this.stateManager.getState();
      return { success: true, state };
    } catch (error) {
      this.logger?.error('Lỗi khi lấy trạng thái', { error });
      return { success: false, error: error.message };
    }
  }

  /** Xử lý yêu cầu trích xuất nội dung (thường từ popup) */
  async handleExtractContent(tabId) {
    try {
      const content = await this.extractContentFromTab(tabId);
      return content;
    } catch (error) {
      this.logger?.error('Lỗi khi trích xuất nội dung', { error });
      return { success: false, error: error.message };
    }
  }

  /** Nhận thông báo đã trích xuất nội dung từ content script */
  async handleContentExtracted(data = {}, tabId) {
    try {
      const updates = {};
      if (data?.chapterUrl) updates.chapterUrl = data.chapterUrl;
      if (data?.chapterTitle) updates.chapterTitle = data.chapterTitle;
      if (data?.storyTitle) updates.storyTitle = data.storyTitle;
      if (typeof data?.lineCount === 'number') {
        updates.totalLines = data.lineCount;
      } else if (typeof data?.totalLines === 'number') {
        updates.totalLines = data.totalLines;
      }

      if (Object.keys(updates).length > 0) {
        await this.stateManager.updateState(updates);
      }

      chrome.runtime.sendMessage({
        type: MESSAGES.CONTENT_EXTRACTED || 'contentExtracted',
        data: {
          success: true,
          metadata: {
            chapterTitle: data?.chapterTitle || '',
            storyTitle: data?.storyTitle || '',
            chapterUrl: data?.chapterUrl || ''
          },
          lineCount: typeof data?.lineCount === 'number' ? data.lineCount : (data?.totalLines || 0),
          totalLines: typeof data?.totalLines === 'number' ? data.totalLines : (data?.lineCount || 0)
        }
      });

      return { success: true };
    } catch (error) {
      this.logger?.error('Lỗi khi nhận contentExtracted', { error });
      return { success: false, error: error.message };
    }
  }

  /** Highlight dòng chỉ định (thường dùng để đồng bộ) */
  async handleHighlightLine(data, tabId) {
    return { success: false, error: 'Highlight/scroll đã bị tắt' };
  }

  /** Đồng bộ trạng thái từ bên ngoài (ví dụ: popup mở lại) */
  async handleSyncState(data) {
    try {
      await this.stateManager.updateState(data);
      return { success: true };
    } catch (error) {
      this.logger?.error('Lỗi khi đồng bộ trạng thái', { error });
      return { success: false, error: error.message };
    }
  }

  /** Nhận settings từ Options UI và đồng bộ vào state + content */
  async handleSettingsUpdated(data) {
    try {
      const normalized = this.normalizeSettings(data);

      await this.stateManager.updateState({
        settings: {
          ...normalized
        }
      });

      // Áp dụng style cho content (highlight)
      const tabId = await this.getActiveTabId();
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: MESSAGES.APPLY_APPEARANCE || 'applyAppearance',
          data: {
            highlightColor: normalized.highlightColor,
            highlightOpacity: normalized.highlightOpacity,
            fontSize: normalized.fontSize
          }
        });
      }

      return { success: true };
    } catch (error) {
      this.logger?.error('Lỗi khi cập nhật settings', { error });
      return { success: false, error: error.message };
    }
  }

  async handleNavigateChapter(direction, tabId) {
    try {
      const targetTabId = tabId || await this.getActiveTabId();
      if (!targetTabId) {
        throw new Error('Không tìm thấy tab đang hoạt động');
      }

      let url = null;
      try {
        const links = await this.getChapterLinksFromTab(targetTabId);
        url = direction === 'prev' ? links.prevUrl : links.nextUrl;
      } catch (error) {
        // ignore and fallback to URL pattern
      }

      if (!url) {
        const tab = await chrome.tabs.get(targetTabId);
        url = this.getAdjacentChapterUrl(tab?.url, direction);
      }

      if (!url) {
        return { success: false, error: `Không tìm thấy liên kết chương ${direction === 'prev' ? 'trước' : 'sau'}` };
      }

      return await this.navigateToChapter(targetTabId, url);
    } catch (error) {
      this.logger?.error(`Lỗi khi chuyển chương: ${error?.message || String(error)}`, { error: error?.message || String(error) });
      return { success: false, error: error.message };
    }
  }

  async handleSwitchChapter(url, tabId) {
    try {
      if (!url) {
        return { success: false, error: 'Thiếu URL chương' };
      }
      const targetTabId = tabId || await this.getActiveTabId();
      if (!targetTabId) {
        throw new Error('Không tìm thấy tab đang hoạt động');
      }

      return await this.navigateToChapter(targetTabId, url);
    } catch (error) {
      this.logger?.error(`Lỗi khi switch chapter: ${error?.message || String(error)}`, { error: error?.message || String(error) });
      return { success: false, error: error.message };
    }
  }

  /** Lấy danh sách giọng nói khả dụng */
  async handleGetVoices() {
    try {
      const voices = await this.ttsService?.getVoices?.() || {};
      return { success: true, voices };
    } catch (error) {
      this.logger?.error('Lỗi khi lấy danh sách giọng nói', { error });
      return { success: false, error: error.message };
    }
  }

  /** Ghi log từ content/UI */
  async handleLog(data) {
    try {
      const level = (data?.level || 'INFO').toUpperCase();
      const message = data?.message || '';
      const meta = { module: data?.module || 'unknown', ...(data?.data || {}) };

      switch (level) {
        case 'ERROR':
          this.logger?.error(message, meta);
          break;
        case 'WARN':
          this.logger?.warn(message, meta);
          break;
        case 'DEBUG':
          this.logger?.debug(message, meta);
          break;
        default:
          this.logger?.log(message, meta);
      }

      return { success: true };
    } catch (error) {
      this.logger?.error('Lỗi khi ghi log', { error });
      return { success: false, error: error.message };
    }
  }

  async getUserSettings() {
      try {
        if (globalThis.StorageService?.getUserSettings) {
          return await globalThis.StorageService.getUserSettings();
        }
        const key = STORAGE.USER_SETTINGS || 'userSettings';
        const result = await chrome.storage.local.get([key]);
        return result[key] || null;
      } catch (error) {
        this.logger?.warn('Không thể load userSettings', { error });
        return null;
      }
  }

  normalizeSettings(rawSettings) {
    const settings = rawSettings || {};

    // Nếu là options schema
    if (settings.tts || settings.appearance || settings.advanced) {
      return {
        engine: settings.tts?.engine || (TTS.EDGE_TTS || 'edge'),
        rate: settings.tts?.defaultSpeed ?? 1.0,
        pitch: settings.tts?.defaultPitch ?? 1.0,
        volume: this.normalizeVolume(settings.tts?.volume ?? 100),
        voice: settings.tts?.defaultVoice,
        autoScroll: settings.general?.autoScroll ?? true,
        highlight: settings.general?.highlight ?? true,
        highlightColor: settings.appearance?.highlightColor,
        highlightOpacity: settings.appearance?.highlightOpacity,
        fontSize: settings.appearance?.fontSize,
        ocrLanguage: settings.advanced?.ocrLanguage,
        cacheOCRResults: settings.advanced?.cacheOCRResults,
        maxCacheSize: settings.advanced?.maxCacheSize,
        enableDebug: settings.advanced?.enableDebug
      };
    }

    // Nếu là popup schema (flat)
    return {
      engine: settings.engine || (TTS.EDGE_TTS || 'edge'),
      rate: settings.rate ?? 1.0,
      pitch: settings.pitch ?? 1.0,
      volume: this.normalizeVolume(settings.volume ?? 1.0),
      voice: settings.voice,
      autoScroll: settings.autoScroll ?? true,
      highlight: settings.highlight ?? true
    };
  }

  normalizeVolume(volume) {
    if (volume > 1) {
      return Math.max(0, Math.min(1, volume / 100));
    }
    return Math.max(0, Math.min(1, volume));
  }

  async buildReadingSettings(runtimeSettings = {}) {
    const stored = await this.getUserSettings();
    const normalizedStored = this.normalizeSettings(stored || {});
    const normalizedRuntime = this.normalizeSettings(runtimeSettings || {});

    return {
      ...normalizedStored,
      ...normalizedRuntime
    };
  }

  async getExtractOptions() {
    const stored = await this.getUserSettings();
    const normalized = this.normalizeSettings(stored || {});
    return {
      ocrLanguage: normalized.ocrLanguage,
      cacheOCR: normalized.cacheOCRResults,
      maxCacheSize: normalized.maxCacheSize,
      debug: normalized.enableDebug
    };
  }

  async getChapterLinksFromTab(tabId) {
    return this.safeSendMessage(tabId, { type: MESSAGES.GET_CHAPTER_LINKS || 'getChapterLinks' });
  }

  async safeSendMessage(tabId, message, retries = 1) {
    try {
      // Ping first to ensure content script is ready
      const ping = await this.sendMessageOnce(tabId, { type: MESSAGES.PING || 'ping' }, { allowNoResponse: true });
      if (!ping?.ready && retries > 0) {
        await new Promise(r => setTimeout(r, 300));
        return this.safeSendMessage(tabId, message, retries - 1);
      }
      return await this.sendMessageOnce(tabId, message);
    } catch (error) {
      this.logger?.error(`Lỗi gửi message tới content: ${error?.message || String(error)}`, { error: error?.message || String(error) });
      throw error;
    }
  }

  getAdjacentChapterUrl(currentUrl, direction) {
    if (!currentUrl) return null;
    const match = currentUrl.match(/chuong-(\d+)/i);
    if (!match) return null;
    const current = parseInt(match[1], 10);
    if (!Number.isFinite(current)) return null;
    const next = direction === 'prev' ? current - 1 : current + 1;
    if (next <= 0) return null;
    return currentUrl.replace(/chuong-(\d+)/i, `chuong-${next}`);
  }

  sendMessageOnce(tabId, message, options = {}) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || 'Unknown runtime error';
          const isNoReceiver = errMsg.includes('Receiving end does not exist') ||
            errMsg.includes('message port closed before a response was received');
          if (options.allowNoResponse || isNoReceiver) {
            this.logger?.warn(`Không nhận được phản hồi từ content (bỏ qua): ${errMsg}`);
            resolve({ success: false, error: errMsg, ready: false });
            return;
          }
          reject(new Error(errMsg));
          return;
        }
        resolve(response);
      });
    });
  }

  async navigateToChapter(tabId, url) {
    try {
      this.ttsService.stop();
      await this.stateManager.updateState({
        status: STATUS.STOPPED || 'stopped',
        currentLine: 0,
        totalLines: 0,
        content: [],
        chapterUrl: url,
        chapterTitle: '',
        storyTitle: ''
      });

      await chrome.tabs.update(tabId, { url });
      return { success: true, url };
    } catch (error) {
      this.logger?.error('Lỗi khi điều hướng chương', { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Lấy ID của tab đang active trong cửa sổ hiện tại
   */
  async getActiveTabId() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]?.id || null);
      });
    });
  }
}

export default EventHandler;
