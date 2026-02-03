/**
 * AutoExtract - tu dong trich xuat va ap dung giao dien
 */

(() => {
  const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
  const STORAGE = CONFIG.STORAGE_KEYS || {};
  const MESSAGES = CONFIG.MESSAGES || {};

  class AutoExtract {
    constructor(options = {}) {
      this.router = options.router || null;
      this.domController = options.domController || null;
      this.notify = typeof options.notify === 'function' ? options.notify : null;
      this.log = typeof options.log === 'function' ? options.log : null;
    }

    start() {
      this.autoExtractOnLoad();
      this.applyStoredAppearance();
    }

    async autoExtractOnLoad() {
      const autoKey = STORAGE.AUTO_EXTRACT || 'autoExtract';
      const handleAutoExtract = (autoExtractEnabled) => {
        if (autoExtractEnabled !== false) {
          this._log('Tu dong trich xuat noi dung...');

          setTimeout(async () => {
            try {
              if (!this.router) return;
              const content = await this.router.extractContent();

              if (content.success && this.notify) {
                this.notify(MESSAGES.CONTENT_EXTRACTED || 'contentExtracted', {
                  chapterUrl: window.location.href,
                  chapterTitle: content.metadata.chapterTitle,
                  lineCount: content.lines.length
                });
              }
            } catch (error) {
              this._log('Loi auto-extract', 'ERROR', { error });
            }
          }, 2000);
        }
      };

      if (globalThis.StorageService?.getAutoExtract) {
        const autoExtract = await globalThis.StorageService.getAutoExtract();
        handleAutoExtract(autoExtract);
        return;
      }

      chrome.storage.local.get([autoKey], (result) => {
        handleAutoExtract(result[autoKey]);
      });
    }

    async applyStoredAppearance() {
      try {
        const settingsKey = STORAGE.USER_SETTINGS || 'userSettings';
        let settings = null;
        if (globalThis.StorageService?.getUserSettings) {
          settings = await globalThis.StorageService.getUserSettings();
        } else {
          const result = await chrome.storage.local.get([settingsKey]);
          settings = result[settingsKey] || null;
        }
        if (settings?.appearance && this.domController?.updateAppearance) {
          this.domController.updateAppearance({
            highlightColor: settings.appearance.highlightColor,
            highlightOpacity: settings.appearance.highlightOpacity,
            fontSize: settings.appearance.fontSize
          });
        }
      } catch (error) {
        this._log('Khong the ap dung giao dien tu settings', 'WARN', { error });
      }
    }

    _log(message, level = 'INFO', data = {}) {
      if (this.log) {
        this.log(message, level, data);
        return;
      }

      if (globalThis.LogService?.log) {
        globalThis.LogService.log('AutoExtract', message, level, data);
        return;
      }

      const prefix = '[AutoExtract]';
      const timestamp = new Date().toISOString();
      console.log(`${prefix} ${timestamp} - ${message}`, data || '');
    }
  }

  if (typeof window !== 'undefined') {
    window.AutoExtract = AutoExtract;
  }
})();
