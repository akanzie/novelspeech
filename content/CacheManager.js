/**
 * CacheManager - gom tac vu cache (OCR cache)
 */

(() => {
  class CacheManager {
    constructor(options = {}) {
      this.ocr = options.ocr || null;
      this.log = typeof options.log === 'function' ? options.log : null;
    }

    setOcr(ocr) {
      this.ocr = ocr;
    }

    clearOcrCache() {
      if (this.ocr?.clearCache) {
        this.ocr.clearCache();
        this._log('Da xoa cache OCR');
      }

      if (globalThis.StorageService?.clearOcrCache) {
        globalThis.StorageService.clearOcrCache();
      }
    }

    async terminateOcr() {
      if (this.ocr?.terminate) {
        await this.ocr.terminate();
        this._log('OCR worker da duoc terminate');
      }
    }

    _log(message, level = 'INFO', data = {}) {
      if (this.log) {
        this.log(message, data, level);
        return;
      }

      if (globalThis.LogService?.log) {
        globalThis.LogService.log('CacheManager', message, level, data || {});
        return;
      }

      const prefix = '[CacheManager]';
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
      console.log(`${prefix} ${timestamp} - ${message}`, data || '');
    }
  }

  if (typeof window !== 'undefined') {
    window.CacheManager = CacheManager;
  }
})();
