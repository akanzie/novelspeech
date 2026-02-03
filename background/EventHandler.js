/**
 * Event Handler - Xử lý tin nhắn và sự kiện giữa các thành phần của extension
 * (background script, content script, popup, TTS service...)
 */
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
    this.logger?.log('📨 Đã nhận tin nhắn', { type: message.type, message });

    try {
      let response;
      switch (message.type) {
        case 'startReading':
          response = await this.handleStartReading(message.data, sender.tab?.id);
          break;
        case 'pauseReading':
          response = await this.handlePauseReading();
          break;
        case 'resumeReading':
          response = await this.handleResumeReading();
          break;
        case 'stopReading':
          response = await this.handleStopReading();
          break;
        case 'nextLine':
          response = await this.handleNextLine();
          break;
        case 'prevLine':
          response = await this.handlePrevLine();
          break;
        case 'updateSettings':
          response = await this.handleUpdateSettings(message.data);
          break;
        case 'getState':
          response = await this.handleGetState();
          break;
        case 'extractContent':
          response = await this.handleExtractContent(sender.tab?.id);
          break;
        case 'highlightLine':
          response = await this.handleHighlightLine(message.data, sender.tab?.id);
          break;
        case 'syncState':
          response = await this.handleSyncState(message.data);
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
      if (!tabId) {
        throw new Error('Không tìm thấy tab đang hoạt động');
      }

      // Đảm bảo dừng TTS cũ trước khi bắt đầu session mới (tránh chồng giọng nói)
      this.ttsService.stop();

      // Bước 1: Trích xuất nội dung từ trang
      this.logger?.log('Bước 1: Đang trích xuất nội dung từ trang...');
      const content = await this.extractContentFromTab(tabId);
      if (!content || !content.success) {
        throw new Error('Trích xuất nội dung thất bại: ' + (content?.error || 'Lỗi không xác định'));
      }

      // Bước 2: Cập nhật trạng thái với nội dung mới
      this.logger?.log('Bước 2: Đang cập nhật trạng thái đọc...');
      await this.stateManager.updateState({
        status: 'playing',
        chapterUrl: content.metadata.chapterUrl,
        chapterTitle: content.metadata.chapterTitle,
        content: content.lines,
        currentLine: data?.startLine || 0,
        totalLines: content.lines.length,
        settings: data?.settings || {}
      });

      // Bước 3: Bắt đầu đọc từ dòng hiện tại
      this.logger?.log('Bước 3: Bắt đầu đọc bằng giọng nói...');
      await this.startReadingFromCurrentLine();

      return { success: true, contentLength: content.lines.length };
    } catch (error) {
      this.logger?.error('Lỗi khi bắt đầu đọc', { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Gửi lệnh trích xuất nội dung tới content script trong tab
   * @param {number} tabId - ID tab
   */
  async extractContentFromTab(tabId) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'extractContent' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
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

    // Highlight trước khi phát giọng để người dùng thấy ngay dòng đang đọc
    await this.highlightCurrentLine();

    // Phát giọng nói - await để đảm bảo hoàn thành trước khi return (nếu cần)
    await this.ttsService.speak(currentLine, {
      rate: state.settings?.rate || 1.0,
      pitch: state.settings?.pitch || 1.0,
      volume: state.settings?.volume || 1.0,
      voice: state.settings?.voice,
      onStart: () => {
        this.logger?.log('🎤 Bắt đầu đọc dòng', { lineIndex: state.currentLine + 1 });
      },
      onEnd: () => {
        this.handleLineFinished();
      },
      onError: (error) => {
        this.logger?.error('Lỗi TTS', { error });
        this.stateManager.updateState({ status: 'error' });
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
        type: 'highlightLine',
        data: { lineIndex: state.currentLine }
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
        status: 'playing'
      });
      await this.startReadingFromCurrentLine();
    } else {
      // Đã đọc xong toàn bộ chương
      await this.stateManager.updateState({
        status: 'finished',
        currentLine: 0
      });
      this.logger?.log('✅ Đã đọc xong chương');
    }
  }

  /** Tạm dừng đọc */
  async handlePauseReading() {
    try {
      const paused = this.ttsService.pause();
      if (paused) {
        await this.stateManager.updateState({ status: 'paused' });
        return { success: true, status: 'paused' };
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
        await this.stateManager.updateState({ status: 'playing' });
        return { success: true, status: 'playing' };
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
          status: 'stopped',
          currentLine: 0
        });
        return { success: true, status: 'stopped' };
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
          status: 'playing'
        });
        await this.startReadingFromCurrentLine();
        return { success: true, currentLine: nextLine };
      }
      return { success: false, error: 'Đã ở dòng cuối cùng' };
    } catch (error) {
      this.logger?.error('Lỗi khi chuyển dòng tiếp theo', { error });
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
          status: 'playing'
        });
        await this.startReadingFromCurrentLine();
        return { success: true, currentLine: prevLine };
      }
      return { success: false, error: 'Đã ở dòng đầu tiên' };
    } catch (error) {
      this.logger?.error('Lỗi khi quay lại dòng trước', { error });
      return { success: false, error: error.message };
    }
  }

  /** Cập nhật cài đặt (tốc độ, giọng nói, âm lượng...) */
  async handleUpdateSettings(settings) {
    try {
      await this.stateManager.updateState({ settings });
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

  /** Highlight dòng chỉ định (thường dùng để đồng bộ) */
  async handleHighlightLine(data, tabId) {
    if (!tabId) return { success: false, error: 'Không có ID tab' };

    try {
      chrome.tabs.sendMessage(tabId, {
        type: 'highlightLine',
        data
      });
      return { success: true };
    } catch (error) {
      this.logger?.error('Lỗi khi highlight dòng', { error });
      return { success: false, error: error.message };
    }
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
