/**
 * Popup Interface - Sử dụng BaseUI
 */

class StoryReaderPopup extends BaseUI {
  constructor() {
    super();

    // Initialize state
    this.state = {
      status: 'stopped',
      currentLine: 0,
      totalLines: 0,
      chapterTitle: 'Chưa phát hiện chương truyện',
      settings: {
        speed: 1.0,
        volume: 100,
        voice: 'vi-VN-HoaiMyNeural',
        autoScroll: true,
        highlight: true
      }
    };

    this.statusPolling = null;
  }

  initElements() {
    this.elements = {
      // Status
      statusBadge: document.getElementById('statusBadge'),
      statusDot: document.querySelector('.status-dot'),
      statusText: document.querySelector('.status-text'),

      // Chapter Info
      chapterTitle: document.querySelector('.chapter-title'),
      currentLineEl: document.getElementById('currentLine'),
      totalLinesEl: document.getElementById('totalLines'),
      progressFill: document.getElementById('progressFill'),

      // Player Controls
      btnPlayPause: document.getElementById('btnPlayPause'),
      btnPrev: document.getElementById('btnPrev'),
      btnNext: document.getElementById('btnNext'),
      btnStop: document.getElementById('btnStop'),
      btnReload: document.getElementById('btnReload'),
      playIcon: document.getElementById('playIcon'),

      // Quick Settings
      speedControl: document.getElementById('speedControl'),
      volumeControl: document.getElementById('volumeControl'),
      voiceSelect: document.getElementById('voiceSelect'),
      speedValue: document.getElementById('speedValue'),
      volumeValue: document.getElementById('volumeValue'),

      // Features
      autoScrollToggle: document.getElementById('autoScrollToggle'),
      highlightToggle: document.getElementById('highlightToggle'),
      darkModeToggle: document.getElementById('darkModeToggle'),

      // Menu
      btnOpenSidepanel: document.getElementById('btnOpenSidepanel'),
      btnSettings: document.getElementById('btnSettings'),
      btnHelp: document.getElementById('btnHelp')
    };
  }

  bindEvents() {
    // Player Controls
    this.elements.btnPlayPause.addEventListener('click', () => this.togglePlayPause());
    this.elements.btnPrev.addEventListener('click', () => this.sendCommand('prevLine'));
    this.elements.btnNext.addEventListener('click', () => this.sendCommand('nextLine'));
    this.elements.btnStop.addEventListener('click', () => this.sendCommand('stopReading'));
    this.elements.btnReload.addEventListener('click', () => this.sendCommand('reloadContent'));

    // Quick Settings with debounce
    this.elements.speedControl.addEventListener('input',
      this.debounce((e) => this.onSpeedChange(e), 300)
    );
    this.elements.volumeControl.addEventListener('input',
      this.debounce((e) => this.onVolumeChange(e), 300)
    );
    this.elements.voiceSelect.addEventListener('change',
      this.debounce((e) => this.onVoiceChange(e), 300)
    );

    // Features
    this.elements.autoScrollToggle.addEventListener('change',
      (e) => this.onToggleChange('autoScroll', e.target.checked)
    );
    this.elements.highlightToggle.addEventListener('change',
      (e) => this.onToggleChange('highlight', e.target.checked)
    );
    this.elements.darkModeToggle.addEventListener('change',
      (e) => this.onDarkModeToggle(e.target.checked)
    );

    // Menu
    this.elements.btnOpenSidepanel.addEventListener('click', () => this.openSidepanel());
    this.elements.btnSettings.addEventListener('click', () => this.openOptionsPage());
    this.elements.btnHelp.addEventListener('click', () => this.showHelp());

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleIncomingMessage(message);
      return true;
    });
  }

  async loadData() {
    try {
      // Load state and settings from storage
      const [stateResult, settingsResult] = await Promise.all([
        this.services.getStorage('readingState'),
        this.services.getStorage('userSettings')
      ]);

      if (stateResult) {
        this.state = { ...this.state, ...stateResult };
      }

      if (settingsResult) {
        this.state.settings = { ...this.state.settings, ...settingsResult };
      }

      // Load dark mode preference
      const darkMode = localStorage.getItem('darkMode') === 'true';
      if (this.elements.darkModeToggle) {
        this.elements.darkModeToggle.checked = darkMode;
        this.services.setTheme(darkMode ? 'dark' : 'light');
      }

      this.updateControls();
      this.updateUI();

      // Start polling for status updates
      this.startStatusPolling();

    } catch (error) {
      this.handleError(error, 'loadData');
    }
  }

  handleIncomingMessage(message) {
    switch (message.type) {
      case 'stateUpdate':
        this.onStateChange(message.data);
        break;
      case 'notification':
        this.services.showNotification(message.data.message, message.data.type);
        break;
      case 'contentExtracted':
        this.onContentExtracted(message.data);
        break;
    }
  }

  onStateChange(newState) {
    // Merge new state with current
    this.state = { ...this.state, ...newState };
    this.updateUI();

    // If status changed to playing, ensure polling is running
    if (newState.status === 'playing' && !this.statusPolling) {
      this.startStatusPolling();
    }
  }

  async togglePlayPause() {
    try {
      if (this.state.status === 'stopped' || this.state.status === 'finished') {
        // Start reading
        await this.startReading();
      } else if (this.state.status === 'playing') {
        // Pause reading
        await this.sendCommand('pauseReading');
      } else if (this.state.status === 'paused') {
        // Resume reading
        await this.sendCommand('resumeReading');
      }
    } catch (error) {
      this.handleError(error, 'togglePlayPause');
    }
  }

  async startReading() {
    try {
      // Get active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        this.services.showNotification('Không tìm thấy tab nào', 'error');
        return;
      }

      this.services.showNotification('Đang bắt đầu đọc...', 'info');

      // Send start reading command
      const response = await this.sendCommand('startReading', {
        startLine: this.state.currentLine,
        settings: this.state.settings
      });

      if (response?.success) {
        this.services.showNotification('Bắt đầu đọc thành công', 'success');
      }

    } catch (error) {
      this.handleError(error, 'startReading');
    }
  }

  async onSpeedChange(e) {
    const speed = parseFloat(e.target.value);
    this.state.settings.speed = speed;

    if (this.elements.speedValue) {
      this.elements.speedValue.textContent = speed.toFixed(1);
    }

    await this.saveSettings();
    await this.sendCommand('updateSettings', { speed });
  }

  async onVolumeChange(e) {
    const volume = parseInt(e.target.value);
    this.state.settings.volume = volume;

    if (this.elements.volumeValue) {
      this.elements.volumeValue.textContent = volume;
    }

    await this.saveSettings();
    await this.sendCommand('updateSettings', { volume });
  }

  async onVoiceChange(e) {
    this.state.settings.voice = e.target.value;
    await this.saveSettings();
    await this.sendCommand('updateSettings', { voice: e.target.value });
  }

  async onToggleChange(setting, value) {
    this.state.settings[setting] = value;
    await this.saveSettings();
    await this.sendCommand('updateSettings', { [setting]: value });
  }

  async onDarkModeToggle(isDark) {
    this.services.setTheme(isDark ? 'dark' : 'light');
    localStorage.setItem('darkMode', isDark);
  }

  async saveSettings() {
    await this.services.setStorage('userSettings', this.state.settings);
  }

  updateUI() {
    // Update chapter info
    if (this.elements.chapterTitle) {
      this.elements.chapterTitle.textContent = this.state.chapterTitle;
    }

    if (this.elements.currentLineEl) {
      this.elements.currentLineEl.textContent = this.state.currentLine;
    }

    if (this.elements.totalLinesEl) {
      this.elements.totalLinesEl.textContent = this.state.totalLines;
    }

    // Update progress
    if (this.elements.progressFill) {
      const progress = this.state.totalLines > 0
        ? (this.state.currentLine / this.state.totalLines) * 100
        : 0;
      this.elements.progressFill.style.width = `${progress}%`;
    }

    // Update status
    this.updateStatus();
  }

  updateStatus() {
    const statusMap = {
      'stopped': { text: 'Đang chờ', class: 'stopped' },
      'playing': { text: 'Đang đọc', class: 'playing' },
      'paused': { text: 'Tạm dừng', class: 'paused' },
      'finished': { text: 'Đã hoàn thành', class: 'stopped' },
      'error': { text: 'Lỗi', class: 'error' }
    };

    const status = statusMap[this.state.status] || statusMap.stopped;

    if (this.elements.statusDot) {
      this.elements.statusDot.className = 'status-dot ' + status.class;
    }

    if (this.elements.statusText) {
      this.elements.statusText.textContent = status.text;
    }

    // Update play button icon
    if (this.elements.playIcon) {
      this.elements.playIcon.className = this.state.status === 'playing'
        ? 'fas fa-pause'
        : 'fas fa-play';
    }
  }

  updateControls() {
    if (this.elements.speedControl) {
      this.elements.speedControl.value = this.state.settings.speed;
      if (this.elements.speedValue) {
        this.elements.speedValue.textContent = this.state.settings.speed.toFixed(1);
      }
    }

    if (this.elements.volumeControl) {
      this.elements.volumeControl.value = this.state.settings.volume;
      if (this.elements.volumeValue) {
        this.elements.volumeValue.textContent = this.state.settings.volume;
      }
    }

    if (this.elements.voiceSelect) {
      this.elements.voiceSelect.value = this.state.settings.voice;
    }

    if (this.elements.autoScrollToggle) {
      this.elements.autoScrollToggle.checked = this.state.settings.autoScroll;
    }

    if (this.elements.highlightToggle) {
      this.elements.highlightToggle.checked = this.state.settings.highlight;
    }
  }

  startStatusPolling() {
    // Clear existing polling
    if (this.statusPolling) {
      clearInterval(this.statusPolling);
    }

    // Poll every second for status updates
    this.statusPolling = setInterval(async () => {
      try {
        const state = await this.services.getStorage('readingState');
        if (state && JSON.stringify(this.state) !== JSON.stringify(state)) {
          this.onStateChange(state);
        }
      } catch (error) {
        console.warn('Status polling error:', error);
      }
    }, 1000);
  }

  stopStatusPolling() {
    if (this.statusPolling) {
      clearInterval(this.statusPolling);
      this.statusPolling = null;
    }
  }

  async openSidepanel() {
    try {
      if (chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
      } else {
        this.services.showNotification('Side panel không khả dụng', 'warning');
      }
    } catch (error) {
      this.handleError(error, 'openSidepanel');
    }
  }

  openOptionsPage() {
    chrome.runtime.openOptionsPage();
  }

  showHelp() {
    window.open('https://github.com/your-repo/novelspeech', '_blank');
  }

  onContentExtracted(data) {
    if (data.success) {
      this.state.chapterTitle = data.metadata?.chapterTitle || 'Chương truyện';
      this.state.totalLines = data.lines?.length || 0;
      this.updateUI();

      this.services.showNotification(`Đã trích xuất ${this.state.totalLines} dòng`, 'success');
    }
  }

  // Cleanup
  destroy() {
    this.stopStatusPolling();

    // Remove event listeners if needed
    // Note: In a popup, we don't need to worry too much about cleanup
    // as the popup closes when user clicks away
  }
}

// Auto-initialize when script loads
// The BaseUI constructor will handle initialization
const storyReaderPopup = new StoryReaderPopup();

// Export for testing/debugging
if (typeof window !== 'undefined') {
  window.storyReaderPopup = storyReaderPopup;
}

export default StoryReaderPopup;
