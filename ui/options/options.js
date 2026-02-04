const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
const STORAGE = CONFIG.STORAGE_KEYS || {};
const DEFAULT_SETTINGS = CONFIG.DEFAULT_SETTINGS || {};
const MESSAGES = CONFIG.MESSAGES || {};

class StoryReaderOptions extends BaseUI {
  constructor() {
    super();

    // Default settings structure
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    this.isDirty = false;
    this.originalSettings = null;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  initElements() {
    this.elements = {
      // Navigation
      navTabs: document.getElementById('navTabs'),
      tabContents: document.querySelectorAll('.tab-content'),

      // General Tab
      autoNextChapter: document.getElementById('autoNextChapter'),
      saveHistory: document.getElementById('saveHistory'),
      pageLoadTimeout: document.getElementById('pageLoadTimeout'),

      // TTS Tab
      ttsEngine: document.getElementById('ttsEngine'),
      defaultVoice: document.getElementById('defaultVoice'),
      defaultSpeed: document.getElementById('defaultSpeed'),
      defaultPitch: document.getElementById('defaultPitch'),
      defaultVolume: document.getElementById('defaultVolume'),
      speedValue: document.getElementById('speedValue'),
      pitchValue: document.getElementById('pitchValue'),
      volumeValue: document.getElementById('volumeValue'),

      // Appearance Tab
      themeOptions: document.querySelectorAll('.theme-option'),
      fontSize: document.getElementById('fontSize'),

      // Advanced Tab
      ocrProvider: document.getElementById('ocrProvider'),
      ocrApiUrl: document.getElementById('ocrApiUrl'),
      ocrLanguage: document.getElementById('ocrLanguage'),
      cacheOCRResults: document.getElementById('cacheOCRResults'),
      enableDebug: document.getElementById('enableDebug'),
      maxCacheSize: document.getElementById('maxCacheSize'),
      btnViewLogs: document.getElementById('btnViewLogs'),
      btnClearData: document.getElementById('btnClearData'),

      // Footer Buttons
      btnSave: document.getElementById('btnSave'),
      btnReset: document.getElementById('btnReset'),
      btnClose: document.getElementById('btnClose'),

      // Toast
      toast: document.getElementById('toast'),
      toastMessage: document.getElementById('toastMessage')
    };

    // Theme templates
    this.themes = [
      { id: 'light', name: 'Sáng', icon: 'sun' },
      { id: 'dark', name: 'Tối', icon: 'moon' },
      { id: 'auto', name: 'Tự động', icon: 'sync' }
    ];
  }

  bindEvents() {
    // Navigation
    this.elements.navTabs.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-btn')) {
        this.switchTab(e.target.dataset.tab);
      }
    });

    // General Tab - with debounce
    this.elements.autoNextChapter.addEventListener('change',
      this.debounce(() => this.onGeneralSettingChange('autoNextChapter', this.elements.autoNextChapter.checked), 300)
    );
    this.elements.saveHistory.addEventListener('change',
      this.debounce(() => this.onGeneralSettingChange('saveHistory', this.elements.saveHistory.checked), 300)
    );
    this.elements.pageLoadTimeout.addEventListener('change',
      this.debounce(() => this.onGeneralSettingChange('pageLoadTimeout', parseInt(this.elements.pageLoadTimeout.value)), 300)
    );

    // TTS Tab - with throttle for sliders
    this.elements.ttsEngine.addEventListener('change',
      this.throttle(() => this.onTtsSettingChange('engine', this.elements.ttsEngine.value), 500)
    );
    this.elements.defaultVoice.addEventListener('change',
      this.throttle(() => this.onTtsSettingChange('defaultVoice', this.elements.defaultVoice.value), 500)
    );
    this.elements.defaultSpeed.addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      this.elements.speedValue.textContent = speed.toFixed(1);
      this.onTtsSettingChange('defaultSpeed', speed);
    });
    this.elements.defaultPitch.addEventListener('input', (e) => {
      const pitch = parseFloat(e.target.value);
      this.elements.pitchValue.textContent = pitch.toFixed(1);
      this.onTtsSettingChange('defaultPitch', pitch);
    });
    this.elements.defaultVolume.addEventListener('input', (e) => {
      const volume = parseInt(e.target.value, 10);
      this.elements.volumeValue.textContent = volume;
      this.onTtsSettingChange('volume', volume);
    });

    // Appearance Tab
    this.elements.themeOptions.forEach(option => {
      option.addEventListener('click', () => {
        const theme = option.dataset.theme;
        this.onThemeSelect(theme);
      });
    });

    this.elements.fontSize.addEventListener('change',
      this.debounce(() => this.onAppearanceSettingChange('fontSize', parseInt(this.elements.fontSize.value)), 300)
    );

    // Advanced Tab
    this.elements.ocrProvider.addEventListener('change',
      this.debounce(() => this.onAdvancedSettingChange('ocrProvider', this.elements.ocrProvider.value), 300)
    );
    this.elements.ocrApiUrl.addEventListener('change',
      this.debounce(() => this.onAdvancedSettingChange('ocrApiUrl', this.elements.ocrApiUrl.value.trim()), 300)
    );
    this.elements.ocrLanguage.addEventListener('change',
      this.debounce(() => this.onAdvancedSettingChange('ocrLanguage', this.elements.ocrLanguage.value), 300)
    );
    this.elements.cacheOCRResults.addEventListener('change',
      this.debounce(() => this.onAdvancedSettingChange('cacheOCRResults', this.elements.cacheOCRResults.checked), 300)
    );
    this.elements.enableDebug.addEventListener('change',
      this.debounce(() => this.onAdvancedSettingChange('enableDebug', this.elements.enableDebug.checked), 300)
    );
    this.elements.maxCacheSize.addEventListener('change',
      this.debounce(() => this.onAdvancedSettingChange('maxCacheSize', parseInt(this.elements.maxCacheSize.value)), 300)
    );

    this.elements.btnViewLogs.addEventListener('click', () => this.viewLogs());
    this.elements.btnClearData.addEventListener('click', () => this.clearData());

    // Footer Buttons
    this.elements.btnSave.addEventListener('click',
      this.debounce(() => this.saveSettings(), 500)
    );
    this.elements.btnReset.addEventListener('click', () => this.resetSettings());
    this.elements.btnClose.addEventListener('click', () => this.closeOptions());

    // Warn before leaving if there are unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (this.isDirty) {
        e.preventDefault();
        e.returnValue = 'Bạn có chưa lưu các thay đổi. Bạn có chắc chắn muốn rời đi?';
      }
    });
  }

  async loadData() {
    this.services.showLoading();

    try {
      const settingsKey = STORAGE.USER_SETTINGS || 'userSettings';
      const savedSettings = await this.services.getStorage(settingsKey);

      if (savedSettings) {
        // Deep merge saved settings with defaults
        this.settings = this.deepMerge(this.settings, savedSettings);
        this.originalSettings = JSON.parse(JSON.stringify(this.settings));
      } else {
        this.originalSettings = JSON.parse(JSON.stringify(this.settings));
      }

      this.updateUI();
      this.log('Settings loaded successfully');
    } catch (error) {
      this.services.handleError(error, 'loadSettings');
    } finally {
      this.services.hideLoading();
    }
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

  updateUI() {
    // General Tab
    this.elements.autoNextChapter.checked = this.settings.general.autoNextChapter;
    this.elements.saveHistory.checked = this.settings.general.saveHistory;
    this.elements.pageLoadTimeout.value = this.settings.general.pageLoadTimeout;

    // TTS Tab
    this.elements.ttsEngine.value = this.settings.tts.engine;
    this.elements.defaultVoice.value = this.settings.tts.defaultVoice;
    this.elements.defaultSpeed.value = this.settings.tts.defaultSpeed;
    this.elements.defaultPitch.value = this.settings.tts.defaultPitch;
    this.elements.speedValue.textContent = this.settings.tts.defaultSpeed.toFixed(1);
    this.elements.pitchValue.textContent = this.settings.tts.defaultPitch.toFixed(1);
    this.elements.defaultVolume.value = this.settings.tts.volume ?? 100;
    this.elements.volumeValue.textContent = this.settings.tts.volume ?? 100;

    // Appearance Tab
    this.updateThemeSelection(this.settings.appearance.theme);
    this.elements.fontSize.value = this.settings.appearance.fontSize;

    // Advanced Tab
    this.elements.ocrProvider.value = this.settings.advanced.ocrProvider || 'tesseract';
    this.elements.ocrApiUrl.value = this.settings.advanced.ocrApiUrl || '';
    this.elements.ocrLanguage.value = this.settings.advanced.ocrLanguage;
    this.elements.cacheOCRResults.checked = this.settings.advanced.cacheOCRResults;
    this.elements.enableDebug.checked = this.settings.advanced.enableDebug;
    this.elements.maxCacheSize.value = this.settings.advanced.maxCacheSize;

    // Apply theme immediately
    this.applyTheme(this.settings.appearance.theme);
  }

  switchTab(tabId) {
    // Update active tab button
    this.elements.navTabs.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    this.elements.navTabs.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

    // Show corresponding content
    this.elements.tabContents.forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.add('active');
  }

  // Setting change handlers
  onGeneralSettingChange(key, value) {
    this.settings.general[key] = value;
    this.markAsDirty();
    this.log(`General setting changed: ${key} = ${value}`);
  }

  onTtsSettingChange(key, value) {
    this.settings.tts[key] = value;
    this.markAsDirty();
    this.log(`TTS setting changed: ${key} = ${value}`);
  }

  onAppearanceSettingChange(key, value) {
    this.settings.appearance[key] = value;
    this.markAsDirty();

    // Apply theme changes immediately
    if (key === 'theme') {
      this.applyTheme(value);
    }

    this.log(`Appearance setting changed: ${key} = ${value}`);
  }

  onAdvancedSettingChange(key, value) {
    this.settings.advanced[key] = value;
    this.markAsDirty();
    this.log(`Advanced setting changed: ${key} = ${value}`);
  }

  onThemeSelect(theme) {
    this.settings.appearance.theme = theme;
    this.updateThemeSelection(theme);
    this.applyTheme(theme);
    this.markAsDirty();
    this.log(`Theme selected: ${theme}`);
  }

  updateThemeSelection(selectedTheme) {
    this.elements.themeOptions.forEach(option => {
      option.classList.toggle('selected', option.dataset.theme === selectedTheme);
    });
  }

  applyTheme(theme) {
    const body = document.body;

    // Remove all theme classes
    body.classList.remove('light-mode', 'dark-mode');

    if (theme === 'dark') {
      body.classList.add('dark-mode');
    } else if (theme === 'light') {
      body.classList.add('light-mode');
    } else {
      // Auto theme based on system preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        body.classList.add('dark-mode');
      } else {
        body.classList.add('light-mode');
      }
    }
  }

  markAsDirty() {
    if (!this.isDirty) {
      this.isDirty = true;
      this.updateSaveButtonState();
    }
  }

  markAsClean() {
    this.isDirty = false;
    this.updateSaveButtonState();
  }

  updateSaveButtonState() {
    this.elements.btnSave.disabled = !this.isDirty;
    this.elements.btnSave.textContent = this.isDirty ? 'Lưu thay đổi*' : 'Lưu cài đặt';
  }

  async saveSettings() {
    try {
      if (!this.isDirty) return;

      this.services.showLoading();

      // Save to storage
      const settingsKey = STORAGE.USER_SETTINGS || 'userSettings';
      await this.services.setStorage(settingsKey, this.settings);

      // Notify other components
      await this.services.sendMessage(MESSAGES.SETTINGS_UPDATED || 'settingsUpdated', this.settings);

      // Update original settings
      this.originalSettings = JSON.parse(JSON.stringify(this.settings));
      this.markAsClean();

      this.showNotification('Đã lưu cài đặt thành công', 'success');
      this.log('Settings saved successfully');

    } catch (error) {
      this.services.handleError(error, 'saveSettings');
    } finally {
      this.services.hideLoading();
    }
  }

  async resetSettings() {
    try {
      const confirmed = await this.confirm(
        'Bạn có chắc chắn muốn đặt lại tất cả cài đặt về mặc định?\n\nTất cả các thay đổi chưa lưu sẽ bị mất.',
        'Đặt lại cài đặt'
      );

      if (!confirmed) return;

      this.services.showLoading();

      // Reset to defaults
      this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

      this.updateUI();
      this.markAsClean();

      this.showNotification('Đã đặt lại cài đặt về mặc định', 'success');
      this.log('Settings reset to defaults');

    } catch (error) {
      this.services.handleError(error, 'resetSettings');
    } finally {
      this.services.hideLoading();
    }
  }

  async viewLogs() {
    try {
      this.showNotification('Đang mở logs...');

      // Create log viewer modal
      const logKey = STORAGE.SYSTEM_LOGS || 'systemLogs';
      const logs = await this.services.getStorage(logKey) || [];

      if (logs.length === 0) {
        await this.alert('Không có logs để hiển thị', 'Logs');
        return;
      }

      const logContent = logs.map(log => `
                <div class="log-entry level-${log.level}">
                    <span class="log-time">${new Date(log.timestamp).toLocaleString()}</span>
                    <span class="log-level">[${log.level.toUpperCase()}]</span>
                    <span class="log-module">${log.module}:</span>
                    <span class="log-message">${log.message}</span>
                </div>
            `).join('');

      const modalContent = `
                <div class="log-viewer">
                    <div class="log-header">
                        <h4>System Logs (${logs.length} entries)</h4>
                        <button class="btn-icon" id="btnCopyLogs" title="Copy logs">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <div class="log-content">${logContent}</div>
                </div>
                <style>
                    .log-viewer {
                        max-height: 400px;
                        overflow-y: auto;
                    }
                    .log-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 10px;
                    }
                    .log-entry {
                        padding: 8px;
                        margin-bottom: 4px;
                        border-radius: 4px;
                        font-family: monospace;
                        font-size: 12px;
                    }
                    .log-entry.level-error { background: #ffebee; color: #c62828; }
                    .log-entry.level-warn { background: #fff3e0; color: #ef6c00; }
                    .log-entry.level-info { background: #e3f2fd; color: #1565c0; }
                    .log-time { color: #666; margin-right: 10px; }
                    .log-level { font-weight: bold; margin-right: 5px; }
                    .log-module { color: #388e3c; margin-right: 5px; }
                </style>
            `;

      const modal = this.showModal('System Logs', modalContent, [
        {
          text: 'Đóng',
          type: 'btn-secondary',
          onClick: () => { }
        },
        {
          text: 'Xuất logs',
          type: 'btn-primary',
          onClick: async () => {
            const logText = logs.map(log =>
              `${log.timestamp} [${log.level}] ${log.module}: ${log.message}`
            ).join('\n');

            const blob = new Blob([logText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `logs-${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showNotification('Đã xuất logs', 'success');
          }
        }
      ]);

      // Add copy functionality
      setTimeout(() => {
        const btnCopy = modal.querySelector('#btnCopyLogs');
        if (btnCopy) {
          btnCopy.addEventListener('click', () => {
            const logText = logs.map(log =>
              `${log.timestamp} [${log.level}] ${log.module}: ${log.message}`
            ).join('\n');

            navigator.clipboard.writeText(logText).then(() => {
              this.showNotification('Đã copy logs vào clipboard', 'success');
            });
          });
        }
      }, 100);

    } catch (error) {
      this.services.handleError(error, 'viewLogs');
    }
  }

  async clearData() {
    try {
      const confirmed = await this.confirm(
        'Bạn có chắc chắn muốn xóa TẤT CẢ dữ liệu?\n\nHành động này sẽ xóa:\n• Lịch sử đọc\n• Đánh dấu\n• Cache OCR\n• Cài đặt\n\nHành động này không thể hoàn tác!',
        '⚠️ XÓA TẤT CẢ DỮ LIỆU'
      );

      if (!confirmed) return;

      this.services.showLoading();

      // Clear all data
      if (globalThis.StorageService?.clearAll) {
        await globalThis.StorageService.clearAll({ includeSession: true });
      } else {
        await chrome.storage.local.clear();
      }

      // Reset settings
      await this.resetSettings();

      // Notify other components
      await this.services.sendMessage(MESSAGES.DATA_CLEARED || 'dataCleared');

      this.showNotification('Đã xóa tất cả dữ liệu thành công', 'success');
      this.log('All data cleared');

    } catch (error) {
      this.services.handleError(error, 'clearData');
    } finally {
      this.services.hideLoading();
    }
  }

  closeOptions() {
    if (this.isDirty) {
      this.confirm(
        'Bạn có chưa lưu các thay đổi. Bạn có chắc chắn muốn đóng trang cài đặt?',
        'Thay đổi chưa được lưu'
      ).then(confirmed => {
        if (confirmed) {
          window.close();
        }
      });
    } else {
      window.close();
    }
  }

  showNotification(message, type = 'info') {
    this.elements.toastMessage.textContent = message;
    this.elements.toast.className = `toast show`;

    // Set color based on type
    this.elements.toast.style.background = type === 'success' ? '#4CAF50' :
      type === 'error' ? '#f44336' :
        type === 'warning' ? '#ff9800' : '#2196F3';

    // Auto hide after 3 seconds
    setTimeout(() => {
      this.elements.toast.classList.remove('show');
    }, 3000);
  }
}

// Initialize options page
new StoryReaderOptions();
