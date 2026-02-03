/**
 * State Manager - Quản lý trạng thái đọc toàn cục
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
        readTime: 0
      }
    };

    this.listeners = new Set();
    this.init();
  }

  async init() {
    // Load saved state from storage
    await this.loadFromStorage();

    // Auto-save on changes
    this.setupAutoSave();

    console.log('✅ State Manager initialized');
  }

  async loadFromStorage() {
    try {
      const result = await chrome.storage.local.get(['readingState']);
      if (result.readingState) {
        this.state = { ...this.state, ...result.readingState };
        console.log('Loaded state from storage:', this.state);
      }
    } catch (error) {
      console.error('Error loading state:', error);
    }
  }

  async saveToStorage() {
    try {
      await chrome.storage.local.set({ readingState: this.state });
      console.log('State saved to storage');
    } catch (error) {
      console.error('Error saving state:', error);
    }
  }

  setupAutoSave() {
    // Save state every 10 seconds if changed
    setInterval(() => {
      if (this.hasChanges) {
        this.saveToStorage();
        this.hasChanges = false;
      }
    }, 10000);
  }

  async getState() {
    return { ...this.state };
  }

  async updateState(updates) {
    const oldState = { ...this.state };

    // Deep merge updates
    this.state = this.deepMerge(this.state, updates);

    // Update metadata
    if (updates.status === 'playing' && oldState.status !== 'playing') {
      this.state.metadata.startTime = Date.now();
    }

    if ((updates.status === 'stopped' || updates.status === 'finished') &&
      oldState.status === 'playing') {
      this.state.metadata.endTime = Date.now();
      this.state.metadata.readTime +=
        (this.state.metadata.endTime - this.state.metadata.startTime);
    }

    // Mark as changed
    this.hasChanges = true;

    // Notify listeners
    this.notifyListeners(oldState, this.state);

    // Save to storage
    await this.saveToStorage();

    console.log('State updated:', updates);

    return this.state;
  }

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

  addListener(listener) {
    this.listeners.add(listener);
  }

  removeListener(listener) {
    this.listeners.delete(listener);
  }

  notifyListeners(oldState, newState) {
    this.listeners.forEach(listener => {
      try {
        listener(oldState, newState);
      } catch (error) {
        console.error('Error in state listener:', error);
      }
    });
  }

  async resetState() {
    this.state = {
      status: 'stopped',
      chapterUrl: '',
      chapterTitle: '',
      currentLine: 0,
      totalLines: 0,
      content: [],
      settings: { ...this.state.settings },
      metadata: {
        startTime: null,
        endTime: null,
        readTime: 0
      }
    };

    await this.saveToStorage();
    this.notifyListeners(null, this.state);

    console.log('State reset');
  }

  async saveReadingHistory() {
    try {
      if (this.state.chapterUrl && this.state.currentLine > 0) {
        const historyEntry = {
          chapterUrl: this.state.chapterUrl,
          chapterTitle: this.state.chapterTitle,
          currentLine: this.state.currentLine,
          totalLines: this.state.totalLines,
          progress: Math.round((this.state.currentLine / this.state.totalLines) * 100),
          timestamp: Date.now(),
          readTime: this.state.metadata.readTime
        };

        // Get existing history
        const result = await chrome.storage.local.get(['readingHistory']);
        const history = result.readingHistory || [];

        // Add new entry
        history.unshift(historyEntry);

        // Keep only last 100 entries
        const limitedHistory = history.slice(0, 100);

        await chrome.storage.local.set({ readingHistory: limitedHistory });

        console.log('Reading history saved');
      }
    } catch (error) {
      console.error('Error saving history:', error);
    }
  }

  async getReadingStats() {
    const state = await this.getState();

    return {
      currentProgress: state.totalLines > 0
        ? Math.round((state.currentLine / state.totalLines) * 100)
        : 0,
      timeSpent: state.metadata.readTime,
      linesRead: state.currentLine,
      totalLines: state.totalLines,
      status: state.status
    };
  }
}

export default StateManager;
