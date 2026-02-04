/**
 * Popup Interface - Sử dụng BaseUI
 */

(() => {
  const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
  const STORAGE = CONFIG.STORAGE_KEYS || {};
  const STATUS = CONFIG.READING_STATUS || {};
  const DEFAULT_RUNTIME_SETTINGS = CONFIG.DEFAULT_RUNTIME_SETTINGS || {};
  const MESSAGES = CONFIG.MESSAGES || {};

  class StoryReaderPopup extends BaseUI {
    constructor() {
      super();

      // Initialize state
      this.state = {
        status: STATUS.STOPPED || 'stopped',
        currentLine: 0,
        totalLines: 0,
        chapterTitle: 'Chưa phát hiện chương truyện',
        storyTitle: '',
        settings: { ...DEFAULT_RUNTIME_SETTINGS }
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
        storyTitle: document.getElementById('storyTitle'),
        chapterTitle: document.getElementById('chapterTitle'),
        btnPrevChapter: document.getElementById('btnPrevChapter'),
        btnNextChapter: document.getElementById('btnNextChapter'),
        btnResume: document.getElementById('btnResume'),
        resumeBadge: document.getElementById('resumeBadge'),
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
        pitchControl: document.getElementById('pitchControl'),
        volumeControl: document.getElementById('volumeControl'),
        voiceSelect: document.getElementById('voiceSelect'),
        speedValue: document.getElementById('speedValue'),
        pitchValue: document.getElementById('pitchValue'),
        volumeValue: document.getElementById('volumeValue'),

        // Features
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
      this.elements.btnPrev.addEventListener('click', () => this.sendCommand(MESSAGES.PREV_LINE || 'prevLine'));
      this.elements.btnNext.addEventListener('click', () => this.sendCommand(MESSAGES.NEXT_LINE || 'nextLine'));
      this.elements.btnStop.addEventListener('click', () => this.sendCommand(MESSAGES.STOP_READING || 'stopReading'));
      this.elements.btnReload.addEventListener('click', () => this.sendCommand('reloadContent'));

      // Chapter Controls
      this.elements.btnPrevChapter?.addEventListener('click', () => this.sendCommand(MESSAGES.PREV_CHAPTER || 'prevChapter'));
      this.elements.btnNextChapter?.addEventListener('click', () => this.sendCommand(MESSAGES.NEXT_CHAPTER || 'nextChapter'));
      this.elements.btnResume?.addEventListener('click', () => this.resumeFromLastPosition());

      // Quick Settings with debounce
      this.elements.speedControl.addEventListener('input',
        this.debounce((e) => this.onSpeedChange(e), 300)
      );
      this.elements.pitchControl.addEventListener('input',
        this.debounce((e) => this.onPitchChange(e), 300)
      );
      this.elements.volumeControl.addEventListener('input',
        this.debounce((e) => this.onVolumeChange(e), 300)
      );
      this.elements.voiceSelect.addEventListener('change',
        this.debounce((e) => this.onVoiceChange(e), 300)
      );

      // Features
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

    log(message, level = 'info', data = {}) {
      this.services.log('Popup', message, level);
      if (Object.keys(data).length > 0) {
        this.services.log('Popup', JSON.stringify(data), level);
      }
    }

    async loadData() {
      try {
        // Load state and settings from storage
        const stateKey = STORAGE.READING_STATE || 'readingState';
        const settingsKey = STORAGE.USER_SETTINGS || 'userSettings';
        const [stateResult, settingsResult] = await Promise.all([
          this.services.getStorage(stateKey),
          this.services.getStorage(settingsKey)
        ]);

        if (stateResult) {
          this.state = { ...this.state, ...stateResult };
        }

        if (settingsResult) {
          const mapped = this.mapSettingsFromStorage(settingsResult);
          this.state.settings = { ...this.state.settings, ...mapped };
        }

        this.normalizeSettings();

        // Load dark mode preference
        const darkMode = localStorage.getItem('darkMode') === 'true';
        if (this.elements.darkModeToggle) {
          this.elements.darkModeToggle.checked = darkMode;
          this.services.setTheme(darkMode ? 'dark' : 'light');
        }

        this.updateControls();
        this.updateUI();
        this.updateResumeButtonState();

        await this.loadVoices();

        // Start polling for status updates
        this.startStatusPolling();

      } catch (error) {
        this.handleError(error, 'loadData');
      }
    }

    handleIncomingMessage(message) {
      switch (message.type) {
        case MESSAGES.STATE_UPDATE || 'stateUpdate':
          this.onStateChange(message.data);
          break;
        case MESSAGES.NOTIFICATION || 'notification':
          this.services.showNotification(message.data.message, message.data.type);
          break;
        case MESSAGES.CONTENT_EXTRACTED || 'contentExtracted':
          this.onContentExtracted(message.data);
          break;
      }
    }

    onStateChange(newState) {
      // Merge new state with current
      this.state = { ...this.state, ...newState };
      this.updateUI();
      this.updateResumeButtonState();

      // If status changed to playing, ensure polling is running
      if (newState.status === (STATUS.PLAYING || 'playing') && !this.statusPolling) {
        this.startStatusPolling();
      }
    }

    async togglePlayPause() {
      try {
        if (this.state.status === (STATUS.STOPPED || 'stopped') ||
          this.state.status === (STATUS.FINISHED || 'finished')) {
          // Start reading
          await this.startReading();
        } else if (this.state.status === (STATUS.PLAYING || 'playing')) {
          // Pause reading
          await this.sendCommand(MESSAGES.PAUSE_READING || 'pauseReading');
        } else if (this.state.status === (STATUS.PAUSED || 'paused')) {
          // Resume reading
          await this.sendCommand(MESSAGES.RESUME_READING || 'resumeReading');
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
        const response = await this.sendCommand(MESSAGES.START_READING || 'startReading', {
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
      const rate = parseFloat(e.target.value);
      this.state.settings.rate = rate;

      if (this.elements.speedValue) {
        this.elements.speedValue.textContent = rate.toFixed(1);
      }

      await this.saveSettings();
      await this.sendCommand(MESSAGES.UPDATE_SETTINGS || 'updateSettings', { rate });
    }

    async onPitchChange(e) {
      const pitch = parseFloat(e.target.value);
      this.state.settings.pitch = pitch;

      if (this.elements.pitchValue) {
        this.elements.pitchValue.textContent = pitch.toFixed(1);
      }

      await this.saveSettings();
      await this.sendCommand(MESSAGES.UPDATE_SETTINGS || 'updateSettings', { pitch });
    }

    async onVolumeChange(e) {
      const volumeUi = parseInt(e.target.value);
      const volume = Math.max(0, Math.min(1, volumeUi / 100));
      this.state.settings.volume = volume;

      if (this.elements.volumeValue) {
        this.elements.volumeValue.textContent = volumeUi;
      }

      await this.saveSettings();
      await this.sendCommand(MESSAGES.UPDATE_SETTINGS || 'updateSettings', { volume });
    }

    async onVoiceChange(e) {
      this.state.settings.voice = e.target.value;
      await this.saveSettings();
      await this.sendCommand(MESSAGES.UPDATE_SETTINGS || 'updateSettings', { voice: e.target.value });
    }

    async onDarkModeToggle(isDark) {
      this.services.setTheme(isDark ? 'dark' : 'light');
      localStorage.setItem('darkMode', isDark);
    }

    async saveSettings() {
      const settingsKey = STORAGE.USER_SETTINGS || 'userSettings';
      const existing = await this.services.getStorage(settingsKey);
      const merged = this.mergeSettingsForStorage(existing, this.state.settings);
      await this.services.setStorage(settingsKey, merged);
    }

    updateUI() {
      // Update chapter info
      if (this.elements.storyTitle) {
        this.elements.storyTitle.textContent = this.state.storyTitle || 'Chưa phát hiện tên truyện';
      }

      if (this.elements.chapterTitle) {
        this.elements.chapterTitle.textContent = this.state.chapterTitle || 'Chưa phát hiện chương truyện';
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
        [STATUS.STOPPED || 'stopped']: { text: 'Đang chờ', class: 'stopped' },
        [STATUS.PLAYING || 'playing']: { text: 'Đang đọc', class: 'playing' },
        [STATUS.PAUSED || 'paused']: { text: 'Tạm dừng', class: 'paused' },
        [STATUS.LOADING || 'loading']: { text: 'Đang OCR...', class: 'paused' },
        [STATUS.FINISHED || 'finished']: { text: 'Đã hoàn thành', class: 'stopped' },
        [STATUS.ERROR || 'error']: { text: 'Lỗi', class: 'error' }
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
        this.elements.playIcon.className = this.state.status === (STATUS.PLAYING || 'playing')
          ? 'fas fa-pause'
          : 'fas fa-play';
      }

      if (this.elements.btnPlayPause) {
        this.elements.btnPlayPause.disabled = this.state.status === (STATUS.LOADING || 'loading');
      }
    }

    updateControls() {
      if (this.elements.speedControl) {
        this.elements.speedControl.value = this.state.settings.rate;
        if (this.elements.speedValue) {
          this.elements.speedValue.textContent = this.state.settings.rate.toFixed(1);
        }
      }

      if (this.elements.pitchControl) {
        this.elements.pitchControl.value = this.state.settings.pitch;
        if (this.elements.pitchValue) {
          this.elements.pitchValue.textContent = this.state.settings.pitch.toFixed(1);
        }
      }

      if (this.elements.volumeControl) {
        const volumeUi = Math.round((this.state.settings.volume || 0) * 100);
        this.elements.volumeControl.value = volumeUi;
        if (this.elements.volumeValue) {
          this.elements.volumeValue.textContent = volumeUi;
        }
      }

      if (this.elements.voiceSelect) {
        this.elements.voiceSelect.value = this.state.settings.voice;
      }

    }

    updateResumeButtonState() {
      if (!this.elements.btnResume) return;

      const canResume = this.state.chapterTitle &&
        this.state.totalLines > 0 &&
        this.state.currentLine >= 0;

      this.elements.btnResume.disabled = !canResume;

      if (canResume) {
        const line = this.state.currentLine + 1;
        this.elements.btnResume.title = `Tiep tuc tu dong ${line}/${this.state.totalLines}`;
        if (this.elements.resumeBadge) {
          this.elements.resumeBadge.textContent = `Resume ${line}/${this.state.totalLines}`;
          this.elements.resumeBadge.classList.add('show');
          this.autoHideResumeBadge();
        }
      } else {
        this.elements.btnResume.title = 'Khong co vi tri doc';
        if (this.elements.resumeBadge) {
          this.elements.resumeBadge.classList.remove('show');
        }
      }
    }

    autoHideResumeBadge() {
      if (!this.elements.resumeBadge) return;
      if (this.resumeBadgeTimer) {
        clearTimeout(this.resumeBadgeTimer);
      }
      this.resumeBadgeTimer = setTimeout(() => {
        this.elements.resumeBadge?.classList.remove('show');
      }, 3000);
    }

    normalizeSettings() {
      // Backward compatibility: speed -> rate
      if (this.state.settings.rate === undefined && this.state.settings.speed !== undefined) {
        this.state.settings.rate = this.state.settings.speed;
      }

      // Normalize volume to 0..1 range
      if (this.state.settings.volume > 1) {
        this.state.settings.volume = Math.max(0, Math.min(1, this.state.settings.volume / 100));
      }

      if (this.state.settings.rate === undefined) this.state.settings.rate = 1.0;
      if (this.state.settings.pitch === undefined) this.state.settings.pitch = 1.0;
      if (this.state.settings.volume === undefined) this.state.settings.volume = 1.0;
    }

    mapSettingsFromStorage(settings) {
      if (settings?.tts || settings?.appearance || settings?.advanced || settings?.general) {
        return {
          engine: settings.tts?.engine ?? 'edge',
          rate: settings.tts?.defaultSpeed ?? 1.0,
          pitch: settings.tts?.defaultPitch ?? 1.0,
          volume: settings.tts?.volume ?? 1.0,
          voice: settings.tts?.defaultVoice,
          autoScroll: settings.general?.autoScroll ?? true,
          highlight: settings.general?.highlight ?? true
        };
      }

      return settings;
    }

    mergeSettingsForStorage(existing, current) {
      if (existing?.tts || existing?.appearance || existing?.advanced || existing?.general) {
        return {
          ...existing,
          tts: {
            ...(existing.tts || {}),
            engine: current.engine ?? existing.tts?.engine,
            defaultSpeed: current.rate ?? existing.tts?.defaultSpeed,
            defaultPitch: current.pitch ?? existing.tts?.defaultPitch,
            volume: Math.round((current.volume ?? 1.0) * 100),
            defaultVoice: current.voice ?? existing.tts?.defaultVoice
          }
        };
      }

      return { ...current };
    }

    async resumeFromLastPosition() {
      try {
        const stateKey = STORAGE.READING_STATE || 'readingState';
        const state = await this.services.getStorage(stateKey);
        if (!state || !state.chapterUrl) {
          this.services.showNotification('Chưa có vị trí đọc để tiếp tục', 'warning');
          return;
        }

        this.state.currentLine = state.currentLine || 0;
        this.state.chapterTitle = state.chapterTitle || this.state.chapterTitle;
        this.state.storyTitle = state.storyTitle || this.state.storyTitle;

        await this.startReading();
      } catch (error) {
        this.handleError(error, 'resumeFromLastPosition');
      }
    }

    async loadVoices() {
      try {
        if (!this.elements.voiceSelect) return;

        const response = await this.services.sendMessage(MESSAGES.GET_VOICES || 'getVoices');
        let chromeVoices = [];
        let webVoices = [];
        let edgeVoices = [];

        if (response?.success) {
          chromeVoices = response.voices?.chromeTTS || [];
          webVoices = response.voices?.webSpeech || [];
          edgeVoices = response.voices?.edgeTTS || [];
        } else {
          this.log('Khong the lay danh sach giong noi, du phong Web Speech', 'warn');
          if (typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices) {
            webVoices = speechSynthesis.getVoices() || [];
            if (webVoices.length === 0) {
              await new Promise(resolve => {
                const timer = setTimeout(resolve, 500);
                speechSynthesis.onvoiceschanged = () => {
                  clearTimeout(timer);
                  resolve();
                };
              });
              webVoices = speechSynthesis.getVoices() || [];
            }
          }
          const ua = (globalThis.navigator && globalThis.navigator.userAgent) ? globalThis.navigator.userAgent : '';
          if (ua.includes('Edg/')) {
            edgeVoices = [
              { name: 'vi-VN-HoaiMyNeural', displayName: 'Hoai My - Nu mien Nam' },
              { name: 'vi-VN-NamMinhNeural', displayName: 'Minh Nam - Nam mien Bac' },
              { name: 'vi-VN-ThanhNamNeural', displayName: 'Thanh Nam - Nam mien Nam' },
              { name: 'vi-VN-HongMyNeural', displayName: 'Hong My - Nu mien Bac' }
            ];
          }
        }

        const isVietnamese = (lang, name) => {
          const l = (lang || '').toLowerCase();
          const n = (name || '').toLowerCase();
          return l.startsWith('vi') || n.includes('vietnam');
        };

        const viChromeVoices = chromeVoices.filter(v => isVietnamese(v.lang, v.voiceName));
        const viWebVoices = webVoices.filter(v => isVietnamese(v.lang, v.name));

        const freeVoices = [
          ...viChromeVoices.map(v => ({
            value: v.voiceName,
            label: `${v.voiceName} (${v.lang || 'unknown'})`,
            source: 'chrome'
          })),
          ...viWebVoices.map(v => ({
            value: v.name,
            label: `${v.name} (${v.lang || 'unknown'})`,
            source: 'web'
          })),
          ...edgeVoices.map(v => ({
            value: v.name,
            label: `${v.displayName || v.name} (edge)`,
            source: 'edge'
          }))
        ];

        if (freeVoices.length === 0) {
          this.log('Khong co giong noi mien phi kha dung', 'warn');
          return;
        }

        // Clear existing options
        this.elements.voiceSelect.innerHTML = '';

        const current = this.state.settings.voice;
        const exists = freeVoices.some(v => v.value === current);
        if (!exists && current) {
          const option = document.createElement('option');
          option.value = current;
          option.textContent = `Edge TTS (dang dung): ${current}`;
          this.elements.voiceSelect.appendChild(option);
        }

        freeVoices.forEach(v => {
          const option = document.createElement('option');
          option.value = v.value;
          option.textContent = v.label;
          this.elements.voiceSelect.appendChild(option);
        });

        this.updateControls();
        this.log(`Da tai ${freeVoices.length} giong noi mien phi`, 'info');
      } catch (error) {
        this.handleError(error, 'loadVoices');
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
          const stateKey = STORAGE.READING_STATE || 'readingState';
          const state = await this.services.getStorage(stateKey);
          if (state && JSON.stringify(this.state) !== JSON.stringify(state)) {
            this.onStateChange(state);
          }
        } catch (error) {
          this.log('Lỗi khi đồng bộ trạng thái', 'warn');
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
      if (!data || data.success === false) return;

      this.state.chapterTitle = data.metadata?.chapterTitle || 'Chương truyện';
      this.state.storyTitle = data.metadata?.storyTitle || '';
      const totalLines = data.lines?.length ?? data.lineCount ?? data.totalLines ?? 0;
      this.state.totalLines = totalLines;
      this.updateUI();

      if (data.success) {
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
})();

