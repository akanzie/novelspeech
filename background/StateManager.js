/**
 * State Manager - Quản lý trạng thái đọc toàn cục của extension
 * Hỗ trợ lưu trữ persistent, tự động lưu, thông báo listener khi thay đổi,
 * tính toán thời gian đọc và lưu lịch sử đọc chương
 */
class StateManager {
  constructor() {
    this.state = {
      status: 'stopped', // stopped, playing, paused, error, finished
      chapterUrl: '',
      chapterTitle: '',
      currentLine: 0,
      totalLines: 0,
      content: [],
      settings: {
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        voice: 'vi-VN-HoaiMyNeural',
        autoScroll: true,
        highlight: true
      },
      metadata: {
        startTime: null,
        endTime: null,
        readTime: 0 // Tổng thời gian đọc (ms)
      }
    };

    this.listeners = new Set();     // Các listener theo dõi thay đổi state
    this.hasChanges = false;        // Đánh dấu có thay đổi để auto-save hiệu quả
    this.logger = null;             // Sẽ được inject từ bên ngoài

    this.init();
  }

  /**
   * Khởi tạo: load state từ storage và thiết lập auto-save
   */
  async init() {
    await this.loadFromStorage();
    this.setupAutoSave();

    this.logger?.log('✅ State Manager đã khởi tạo');
  }

  /**
   * Inject Logger từ BackgroundService (dependency injection)
   */
  setLogger(logger) {
    this.logger = logger;
  }

  /**
   * Load trạng thái đã lưu từ chrome.storage.local
   */
  async loadFromStorage() {
    try {
      const result = await chrome.storage.local.get(['readingState']);
      if (result.readingState) {
        this.state = this.deepMerge(this.state, result.readingState);
        this.logger?.log('Đã load state từ storage', { state: this.state });
      }
    } catch (error) {
      this.logger?.error('Lỗi load state từ storage', { error });
    }
  }

  /**
   * Lưu trạng thái hiện tại vào chrome.storage.local
   */
  async saveToStorage() {
    try {
      await chrome.storage.local.set({ readingState: this.state });
      this.logger?.debug('Đã lưu state vào storage');
    } catch (error) {
      this.logger?.error('Lỗi lưu state vào storage', { error });
    }
  }

  /**
   * Thiết lập auto-save định kỳ (mỗi 10 giây nếu có thay đổi)
   */
  setupAutoSave() {
    setInterval(async () => {
      if (this.hasChanges) {
        await this.saveToStorage();
        this.hasChanges = false;
      }
    }, 10000);
  }

  /**
   * Lấy bản copy trạng thái hiện tại (immutable)
   */
  async getState() {
    return { ...this.state };
  }

  /**
   * Cập nhật trạng thái - hàm chính để thay đổi state
   * @param {Object} updates - Các trường cần cập nhật
   */
  async updateState(updates) {
    const oldState = await this.getState();

    // Deep merge updates vào state hiện tại
    this.state = this.deepMerge(this.state, updates);

    // Cập nhật metadata thời gian đọc
    if (updates.status === 'playing' && oldState.status !== 'playing') {
      this.state.metadata.startTime = Date.now();
    }

    if ((updates.status === 'stopped' || updates.status === 'finished' || updates.status === 'error') &&
        oldState.status === 'playing') {
      const endTime = Date.now();
      const sessionTime = endTime - (this.state.metadata.startTime || endTime);
      this.state.metadata.readTime += sessionTime;
      this.state.metadata.endTime = endTime;
    }

    // Đánh dấu có thay đổi để auto-save
    this.hasChanges = true;

    // Thông báo cho tất cả listener
    this.notifyListeners(oldState, this.state);

    // Lưu ngay lập tức (đồng thời với auto-save định kỳ)
    await this.saveToStorage();

    this.logger?.log('State đã cập nhật', { updates });

    return this.state;
  }

  /**
   * Deep merge hai object (hỗ trợ nested object)
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Thêm listener theo dõi thay đổi state
   * @param {Function} listener - Hàm callback(oldState, newState)
   */
  addListener(listener) {
    this.listeners.add(listener);
  }

  /**
   * Xóa listener
   */
  removeListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * Thông báo thay đổi cho tất cả listener (an toàn với lỗi)
   */
  notifyListeners(oldState, newState) {
    this.listeners.forEach(listener => {
      try {
        listener(oldState, newState);
      } catch (error) {
        this.logger?.error('Lỗi trong state listener', { error });
      }
    });
  }

  /**
   * Reset trạng thái về mặc định (giữ lại settings người dùng)
   */
  async resetState() {
    const oldState = await this.getState();

    this.state = {
      status: 'stopped',
      chapterUrl: '',
      chapterTitle: '',
      currentLine: 0,
      totalLines: 0,
      content: [],
      settings: { ...this.state.settings }, // Giữ settings hiện tại
      metadata: {
        startTime: null,
        endTime: null,
        readTime: this.state.metadata.readTime // Giữ tổng thời gian đọc tích lũy (nếu muốn reset thì set 0)
      }
    };

    this.hasChanges = true;
    await this.saveToStorage();
    this.notifyListeners(oldState, this.state);

    this.logger?.log('State đã được reset');
  }

  /**
   * Lưu lịch sử đọc chương (khi dừng hoặc đọc xong)
   */
  async saveReadingHistory() {
    try {
      if (this.state.chapterUrl && this.state.currentLine > 0) {
        const historyEntry = {
          chapterUrl: this.state.chapterUrl,
          chapterTitle: this.state.chapterTitle || 'Không có tiêu đề',
          currentLine: this.state.currentLine,
          totalLines: this.state.totalLines,
          progress: this.state.totalLines > 0
            ? Math.round((this.state.currentLine / this.state.totalLines) * 100)
            : 0,
          timestamp: Date.now(),
          readTime: this.state.metadata.readTime
        };

        const result = await chrome.storage.local.get(['readingHistory']);
        let history = result.readingHistory || [];

        // Thêm entry mới lên đầu
        history.unshift(historyEntry);

        // Giữ tối đa 100 entry gần nhất
        history = history.slice(0, 100);

        await chrome.storage.local.set({ readingHistory: history });

        this.logger?.log('Đã lưu lịch sử đọc chương', { entry: historyEntry });
      }
    } catch (error) {
      this.logger?.error('Lỗi lưu lịch sử đọc', { error });
    }
  }

  /**
   * Lấy thống kê đọc hiện tại (progress, thời gian, số dòng...)
   */
  async getReadingStats() {
    const state = await this.getState();

    return {
      currentProgress: state.totalLines > 0
        ? Math.round((state.currentLine / state.totalLines) * 100)
        : 0,
      timeSpent: state.metadata.readTime,
      linesRead: state.currentLine,
      totalLines: state.totalLines,
      status: state.status,
      chapterTitle: state.chapterTitle
    };
  }
}

export default StateManager;
