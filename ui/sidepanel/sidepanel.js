const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
const STORAGE = CONFIG.STORAGE_KEYS || {};
const MESSAGES = CONFIG.MESSAGES || {};

class StoryReaderSidepanel extends BaseUI {
  constructor() {
    super();
    this.currentTab = 'chapters';
    this.data = {
      chapters: [],
      history: [],
      bookmarks: [],
      currentChapter: null
    };
  }

  initElements() {
    this.elements = {
      // Header
      btnClose: document.getElementById('btnClose'),

      // Lists containers
      chaptersList: document.getElementById('chaptersList'),
      historyList: document.getElementById('historyList'),
      bookmarksList: document.getElementById('bookmarksList'),

      // Quick Actions
      btnAddBookmark: document.getElementById('btnAddBookmark'),
      btnClearHistory: document.getElementById('btnClearHistory'),
      btnExportLogs: document.getElementById('btnExportLogs')
    };

    // Templates
    this.templates = {
      loading: () => `
                <div class="loading">
                    <div class="spinner"></div>
                </div>
            `,
      empty: (icon, message) => `
                <div class="empty-state">
                    <i class="fas fa-${icon}"></i>
                    <p>${message}</p>
                </div>
            `,
      chapter: (chapter, index, isActive) => {
        const status = isActive ? 'current' : chapter.read ? 'read' : 'unread';
        const statusText = status === 'current' ? 'Đang đọc' :
          status === 'read' ? 'Đã đọc' : 'Chưa đọc';

        return `
                    <div class="chapter-item ${isActive ? 'active' : ''}" data-url="${chapter.url}">
                        <div class="chapter-title">${chapter.title || `Chương ${index + 1}`}</div>
                        <div class="chapter-meta">
                            <span>${chapter.totalLines || 0} dòng</span>
                            <span class="chapter-status ${status}">${statusText}</span>
                        </div>
                    </div>
                `;
      },
      history: (record) => {
        const date = new Date(record.timestamp);
        const progress = Math.round((record.currentLine / record.totalLines) * 100);

        return `
                    <div class="history-item" data-url="${record.chapterUrl}">
                        <div class="history-title">
                            <span>${record.chapterTitle || 'Chương không tên'}</span>
                            <span class="history-date">${date.toLocaleDateString('vi-VN')}</span>
                        </div>
                        <div class="history-progress">${progress}%</div>
                    </div>
                `;
      },
      bookmark: (bookmark, index) => `
                <div class="bookmark-item" data-index="${index}">
                    <div class="bookmark-content">
                        <i class="fas fa-bookmark"></i>
                        <span>${bookmark.content.substring(0, 100)}${bookmark.content.length > 100 ? '...' : ''}</span>
                    </div>
                    <div class="bookmark-actions">
                        <button class="btn-icon goto-bookmark" title="Đi đến đánh dấu">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                        <button class="btn-icon delete delete-bookmark" title="Xóa đánh dấu">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `
    };
  }

  bindEvents() {
    // Header
    this.elements.btnClose.addEventListener('click', () => this.closeSidepanel());

    // Quick Actions
    this.elements.btnAddBookmark.addEventListener('click', () => this.addBookmark());
    this.elements.btnClearHistory.addEventListener('click', () => this.clearHistory());
    this.elements.btnExportLogs.addEventListener('click', () => this.exportLogs());

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local') {
        this.handleStorageChanges(changes);
      }
    });

    // Listen for messages from other parts
    this.services.onMessage((message, sender, sendResponse) => {
      this.handleMessages(message, sender, sendResponse);
    });
  }

  async loadData() {
    this.services.showLoading();

    try {
      await Promise.all([
        this.loadChapters(),
        this.loadHistory(),
        this.loadBookmarks()
      ]);

      this.log('Sidepanel data loaded successfully');
    } catch (error) {
      this.services.handleError(error, 'loadData');
    } finally {
      this.services.hideLoading();
    }
  }

  handleStorageChanges(changes) {
    const stateKey = STORAGE.READING_STATE || 'readingState';
    if (changes[stateKey] || changes.chapters) {
      this.loadChapters();
    }
    const historyKey = STORAGE.READING_HISTORY || 'readingHistory';
    if (changes[historyKey]) {
      this.loadHistory();
    }
    if (changes.bookmarks) {
      this.loadBookmarks();
    }
  }

  handleMessages(message, sender, sendResponse) {
      switch (message.type) {
        case MESSAGES.CHAPTER_UPDATED || 'chapterUpdated':
          this.loadChapters();
          break;
        case MESSAGES.BOOKMARK_ADDED || 'bookmarkAdded':
          this.loadBookmarks();
          break;
        case MESSAGES.HISTORY_UPDATED || 'historyUpdated':
          this.loadHistory();
          break;
    }
  }

  async loadChapters() {
    try {
      this.elements.chaptersList.innerHTML = this.templates.loading();

      const [chapters, readingState] = await Promise.all([
        this.services.getStorage('chapters'),
        this.services.getStorage(STORAGE.READING_STATE || 'readingState')
      ]);

      this.data.chapters = chapters || [];
      this.data.currentChapter = readingState;

      if (!this.data.chapters.length) {
        this.elements.chaptersList.innerHTML = this.templates.empty('book', 'Chưa có chương nào được phát hiện');
        return;
      }

      const currentChapterUrl = this.data.currentChapter?.chapterUrl;
      const chaptersHtml = this.data.chapters
        .map((chapter, index) =>
          this.templates.chapter(chapter, index, chapter.url === currentChapterUrl)
        )
        .join('');

      this.elements.chaptersList.innerHTML = chaptersHtml;
      this.bindChapterEvents();

    } catch (error) {
      this.log(`Error loading chapters: ${error.message}`, 'error');
      this.elements.chaptersList.innerHTML = this.templates.empty('exclamation-triangle', 'Lỗi khi tải danh sách chương');
    }
  }

  async loadHistory() {
    try {
      this.elements.historyList.innerHTML = this.templates.loading();

      const history = await this.services.getStorage(STORAGE.READING_HISTORY || 'readingHistory');
      this.data.history = history || [];

      if (!this.data.history.length) {
        this.elements.historyList.innerHTML = this.templates.empty('history', 'Chưa có lịch sử đọc');
        return;
      }

      const historyHtml = this.data.history
        .slice(0, 10)
        .map(record => this.templates.history(record))
        .join('');

      this.elements.historyList.innerHTML = historyHtml;
      this.bindHistoryEvents();

    } catch (error) {
      this.log(`Error loading history: ${error.message}`, 'error');
      this.elements.historyList.innerHTML = this.templates.empty('exclamation-triangle', 'Lỗi khi tải lịch sử');
    }
  }

  async loadBookmarks() {
    try {
      this.elements.bookmarksList.innerHTML = this.templates.loading();

      const bookmarks = await this.services.getStorage('bookmarks');
      this.data.bookmarks = bookmarks || [];

      if (!this.data.bookmarks.length) {
        this.elements.bookmarksList.innerHTML = this.templates.empty('bookmark', 'Chưa có đánh dấu nào');
        return;
      }

      const bookmarksHtml = this.data.bookmarks
        .map((bookmark, index) => this.templates.bookmark(bookmark, index))
        .join('');

      this.elements.bookmarksList.innerHTML = bookmarksHtml;
      this.bindBookmarkEvents();

    } catch (error) {
      this.log(`Error loading bookmarks: ${error.message}`, 'error');
      this.elements.bookmarksList.innerHTML = this.templates.empty('exclamation-triangle', 'Lỗi khi tải đánh dấu');
    }
  }

  bindChapterEvents() {
    this.elements.chaptersList.querySelectorAll('.chapter-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.chapter-item')) {
          const url = item.dataset.url;
          await this.switchChapter(url);
        }
      });
    });
  }

  bindHistoryEvents() {
    this.elements.historyList.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.history-item')) {
          const url = item.dataset.url;
          await this.loadChapterFromHistory(url);
        }
      });
    });
  }

  bindBookmarkEvents() {
    // Go to bookmark
    this.elements.bookmarksList.querySelectorAll('.goto-bookmark').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.closest('.bookmark-item').dataset.index);
        await this.goToBookmark(index);
      });
    });

    // Delete bookmark
    this.elements.bookmarksList.querySelectorAll('.delete-bookmark').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.closest('.bookmark-item').dataset.index);
        await this.deleteBookmark(index);
      });
    });
  }

  async switchChapter(url) {
    try {
      this.showNotification('Đang chuyển chương...');

      const response = await this.sendCommand(MESSAGES.SWITCH_CHAPTER || 'switchChapter', { url });

      if (response?.success) {
        this.showNotification('Đã chuyển chương thành công', 'success');
        // Reload chapters to update active state
        setTimeout(() => this.loadChapters(), 500);
      }
    } catch (error) {
      this.services.handleError(error, 'switchChapter');
    }
  }

  async addBookmark() {
    try {
      this.showNotification('Đang thêm đánh dấu...');

      const response = await this.sendCommand('addBookmark');

      if (response?.success) {
        this.showNotification('Đã thêm đánh dấu thành công', 'success');
        await this.loadBookmarks();
      }
    } catch (error) {
      this.services.handleError(error, 'addBookmark');
    }
  }

  async goToBookmark(index) {
    try {
      if (index < 0 || index >= this.data.bookmarks.length) {
        this.showNotification('Đánh dấu không tồn tại', 'error');
        return;
      }

      this.showNotification('Đang chuyển đến đánh dấu...');

      const response = await this.sendCommand('goToBookmark', { index });

      if (response?.success) {
        this.showNotification('Đã chuyển đến đánh dấu', 'success');
      }
    } catch (error) {
      this.services.handleError(error, 'goToBookmark');
    }
  }

  async deleteBookmark(index) {
    try {
      const confirmed = await this.confirm(
        'Bạn có chắc chắn muốn xóa đánh dấu này?',
        'Xóa đánh dấu'
      );

      if (!confirmed) return;

      this.showNotification('Đang xóa đánh dấu...');

      const response = await this.sendCommand('deleteBookmark', { index });

      if (response?.success) {
        this.showNotification('Đã xóa đánh dấu', 'success');
        await this.loadBookmarks();
      }
    } catch (error) {
      this.services.handleError(error, 'deleteBookmark');
    }
  }

  async clearHistory() {
    try {
      const confirmed = await this.confirm(
        'Bạn có chắc chắn muốn xóa toàn bộ lịch sử đọc?\n\nHành động này không thể hoàn tác.',
        'Xóa lịch sử'
      );

      if (!confirmed) return;

      this.showNotification('Đang xóa lịch sử...');

      const response = await this.sendCommand('clearHistory');

      if (response?.success) {
        this.showNotification('Đã xóa lịch sử thành công', 'success');
        await this.loadHistory();
      }
    } catch (error) {
      this.services.handleError(error, 'clearHistory');
    }
  }

  async exportLogs() {
    try {
      this.showNotification('Đang xuất logs...');

      const response = await this.sendCommand('exportLogs');

      if (response?.success) {
        this.showNotification('Đã xuất logs thành công', 'success');
      }
    } catch (error) {
      this.services.handleError(error, 'exportLogs');
    }
  }

  async loadChapterFromHistory(url) {
    await this.switchChapter(url);
  }

  closeSidepanel() {
    window.close();
  }

  // Override sendCommand to handle sidepanel-specific commands
  async sendCommand(command, data = {}) {
    try {
      this.log(`Sending sidepanel command: ${command}`, 'info');

      // Handle sidepanel-specific commands locally first
        switch (command) {
        case MESSAGES.SWITCH_CHAPTER || 'switchChapter':
          return await this.handleSwitchChapter(data.url);
        case MESSAGES.ADD_BOOKMARK || 'addBookmark':
          return await this.handleAddBookmark();
        case MESSAGES.GO_TO_BOOKMARK || 'goToBookmark':
          return await this.handleGoToBookmark(data.index);
        case MESSAGES.DELETE_BOOKMARK || 'deleteBookmark':
          return await this.handleDeleteBookmark(data.index);
        case MESSAGES.CLEAR_HISTORY || 'clearHistory':
          return await this.handleClearHistory();
        case MESSAGES.EXPORT_LOGS || 'exportLogs':
          return await this.handleExportLogs();
        default:
          // For other commands, use parent class method
          return await super.sendCommand(command, data);
      }
    } catch (error) {
      return this.services.handleError(error, `Sidepanel Command: ${command}`);
    }
  }

  async handleSwitchChapter(url) {
    const response = await this.services.sendMessage(MESSAGES.SWITCH_CHAPTER || 'switchChapter', { url });

    if (response?.success) {
      // Update current chapter in local data
      const chapter = this.data.chapters.find(ch => ch.url === url);
      if (chapter) {
        this.data.currentChapter = { chapterUrl: url, chapterTitle: chapter.title };
      }
    }

    return response;
  }

  async handleAddBookmark() {
    // Get current reading state
    const state = await this.services.getStorage(STORAGE.READING_STATE || 'readingState');

    if (!state || !state.currentLineContent) {
      return {
        success: false,
        error: 'Không có nội dung để đánh dấu'
      };
    }

    const bookmark = {
      chapterUrl: state.chapterUrl,
      chapterTitle: state.chapterTitle,
      lineIndex: state.currentLine,
      content: state.currentLineContent,
      timestamp: Date.now()
    };

    // Add to bookmarks
    const bookmarks = this.data.bookmarks;
    bookmarks.unshift(bookmark);

    // Keep only latest 50 bookmarks
    const updatedBookmarks = bookmarks.slice(0, 50);

    await this.services.setStorage('bookmarks', updatedBookmarks);
    this.data.bookmarks = updatedBookmarks;

    // Notify other components
    await this.services.sendMessage(MESSAGES.BOOKMARK_ADDED || 'bookmarkAdded', bookmark);

    return { success: true };
  }

  async handleGoToBookmark(index) {
    const bookmark = this.data.bookmarks[index];

    if (!bookmark) {
      return {
        success: false,
        error: 'Đánh dấu không tồn tại'
      };
    }

    // Switch to chapter and line
    return await this.services.sendMessage(MESSAGES.GO_TO_BOOKMARK || 'goToBookmark', bookmark);
  }

  async handleDeleteBookmark(index) {
    if (index < 0 || index >= this.data.bookmarks.length) {
      return {
        success: false,
        error: 'Đánh dấu không tồn tại'
      };
    }

    // Remove bookmark
    const bookmarks = [...this.data.bookmarks];
    bookmarks.splice(index, 1);

    await this.services.setStorage('bookmarks', bookmarks);
    this.data.bookmarks = bookmarks;

    return { success: true };
  }

  async handleClearHistory() {
    await this.services.setStorage(STORAGE.READING_HISTORY || 'readingHistory', []);
    this.data.history = [];
    return { success: true };
  }

  async handleExportLogs() {
    const logs = await this.services.getStorage(STORAGE.SYSTEM_LOGS || 'systemLogs') || [];

    if (logs.length === 0) {
      return {
        success: false,
        error: 'Không có logs để xuất'
      };
    }

    const logText = logs.map(log => {
      return `${log.timestamp} [${log.level}] ${log.module}: ${log.message}`;
    }).join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `story-reader-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true };
  }
}

// Initialize sidepanel
new StoryReaderSidepanel();
