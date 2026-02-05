/**
 * OCRProcessor - xử lý OCR trong content script (Tesseract.js + cache)
 * Tách khỏi ContentExtractor để dễ maintain và tái sử dụng.
 */

const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
const STORAGE = CONFIG.STORAGE_KEYS || {};

class OCRProcessor {
  constructor(config = {}) {
    this.config = {
      ocrLanguage: 'vie',
      cacheOCR: true,
      maxCacheSize: 100,
      debug: false,
      ...config
    };

    this.ocrWorker = null;
    this.isReady = false;
    this.ocrCache = new Map();
    this.ocrCacheLoaded = false;
  }

  log(message, data = null, level = 'INFO') {
    if (globalThis.LogService?.log) {
      globalThis.LogService.log('OCRProcessor', message, level, data || {});
      return;
    }

    const prefix = '[OCRProcessor]';
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    if (String(level).toUpperCase() === 'ERROR') {
      console.error(`${prefix} ${timestamp} - ${message}`, data || '');
    } else if (String(level).toUpperCase() === 'WARN') {
      console.warn(`${prefix} ${timestamp} - ${message}`, data || '');
    } else {
      console.log(`${prefix} ${timestamp} - ${message}`, data || '');
    }
  }

  setConfig(config = {}) {
    this.config = { ...this.config, ...config };
  }

  normalizeOcrLanguage(value) {
    if (Array.isArray(value)) {
      const langs = value
        .map(item => String(item || '').trim())
        .filter(Boolean);
      return langs.length > 0 ? langs.join('+') : 'vie';
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : 'vie';
    }

    return 'vie';
  }

  async ensureReady(settings = {}) {
    this.setConfig(settings);
    if (this.isApiProvider(this.config.ocrProvider)) {
      return true;
    }
    const ocrLang = this.normalizeOcrLanguage(this.config.ocrLanguage);
    const ready = await this.initWorker(ocrLang);
    if (!ready) return false;
    await this.loadCacheFromStorage();
    return this.isReady;
  }

  async initWorker(ocrLang) {
    if (this.isReady) return true;

    try {
      if (window.__novelSpeechOcrWorkerPromise) {
        const shared = await window.__novelSpeechOcrWorkerPromise;
        if (shared?.worker) {
      this.ocrWorker = shared?.worker || null;
      this.isReady = shared?.ready === true;

          if (shared.language && shared.language !== ocrLang) {
            try {
              if (typeof this.ocrWorker.reinitialize === 'function') {
                await this.ocrWorker.reinitialize(ocrLang, Tesseract.OEM.LSTM_ONLY);
              } else {
                await this.ocrWorker.loadLanguage(ocrLang);
                await this.ocrWorker.initialize(ocrLang, Tesseract.OEM.LSTM_ONLY);
              }
              shared.language = ocrLang;
              this.isReady = true;
            } catch (error) {
              this.log(`Không thể đổi ngôn ngữ OCR: ${error.message}`, { error }, 'WARN');
            }
          }

          return this.isReady;
        }
      }

      window.__novelSpeechOcrWorkerPromise = (async () => {
        this.log('Đang khởi tạo OCR worker (Tesseract.js)...');

        if (typeof Tesseract === 'undefined') {
          const loadedLocal = await this.loadTesseractScript(true);
          if (!loadedLocal) {
            await this.loadTesseractScript(false);
          }
        }

        this.ocrWorker = await Tesseract.createWorker(
          ocrLang,
          Tesseract.OEM.LSTM_ONLY,
          {
            workerPath: this.getWorkerPath(),
            langPath: this.getLangPath(),
            corePath: this.getCorePath()
          }
        );

        if (this.config.debug && typeof Tesseract.setLogging === 'function') {
          Tesseract.setLogging(true);
        }

        await this.ocrWorker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
          preserve_interword_spaces: '1',
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơưĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴÝỶỸ0123456789.,!?\'"()[]{}:;-–— ',
        });

        this.isReady = true;
        this.log('OCR worker ready');
        return {
          worker: this.ocrWorker,
          language: ocrLang,
          ready: true
        };
      })();

      const shared = await window.__novelSpeechOcrWorkerPromise;
      this.ocrWorker = shared?.worker || null;
      this.isReady = shared?.ready === true;
      return this.isReady;
    } catch (error) {
      this.log(`Khởi tạo OCR thất bại: ${error.message}`, { error }, 'ERROR');
      this.isReady = false;
      window.__novelSpeechOcrWorkerPromise = null;
      return false;
    }
  }

  async loadTesseractScript(useLocal) {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = useLocal ? this.getLocalTesseractPath() : this.getCdnTesseractPath();
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  getLocalTesseractPath() {
    if (chrome?.runtime?.getURL) {
      return chrome.runtime.getURL('libs/tesseract/tesseract.min.js');
    }
    return '';
  }

  getCdnTesseractPath() {
    return 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.0/dist/tesseract.min.js';
  }

  getWorkerPath() {
    if (chrome?.runtime?.getURL) {
      return chrome.runtime.getURL('libs/tesseract/worker.min.js');
    }
    return 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.0/dist/worker.min.js';
  }

  getCorePath() {
    if (chrome?.runtime?.getURL) {
      return chrome.runtime.getURL('libs/tesseract/tesseract-core.wasm.js');
    }
    return 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.0';
  }

  getLangPath() {
    if (chrome?.runtime?.getURL) {
      return chrome.runtime.getURL('libs/tesseract/lang');
    }
    return 'https://tessdata.projectnaptha.com/4.0.0';
  }

  async recognizeCanvas(canvas, settings = {}) {
    try {
      const provider = String(settings.ocrProvider || this.config.ocrProvider || '').toLowerCase();
      if (provider === 'paddle') {
        return await this.recognizeCanvasByPaddle(canvas, settings);
      }
      if (provider === 'vietocr') {
        return await this.recognizeCanvasByVietOcr(canvas, settings);
      }
      if (!(await this.ensureReady(settings))) return '';
      const cacheKey = this.getCanvasHash(canvas);
      if (this.config.cacheOCR) {
        const cached = this.getCachedOcr(cacheKey);
        if (cached) return cached;
      }

      const { data: { text } } = await this.ocrWorker.recognize(canvas);
      const cleanText = (text || '').trim();
      if (cleanText.length > 0 && this.config.cacheOCR) {
        this.setCachedOcr(cacheKey, cleanText, this.config.maxCacheSize);
      }
      return cleanText;
    } catch (err) {
      this.log(`OCR canvas lỗi: ${err.message}`, { error: err }, 'WARN');
      return '';
    }
  }

  async recognizeImage(img, settings = {}) {
    try {
      const provider = String(settings.ocrProvider || this.config.ocrProvider || '').toLowerCase();
      if (provider === 'paddle') {
        return await this.recognizeImageByPaddle(img, settings);
      }
      if (provider === 'vietocr') {
        return await this.recognizeImageByVietOcr(img, settings);
      }
      if (!(await this.ensureReady(settings))) return '';
      const cacheKey = this.getImageHash(img);
      if (this.config.cacheOCR) {
        const cached = this.getCachedOcr(cacheKey);
        if (cached) return cached;
      }

      const { data: { text } } = await this.ocrWorker.recognize(img);
      const cleanText = (text || '').trim();
      if (cleanText.length > 0 && this.config.cacheOCR) {
        this.setCachedOcr(cacheKey, cleanText, this.config.maxCacheSize);
      }
      return cleanText;
    } catch (err) {
      this.log(`OCR ảnh lỗi: ${err.message}`, { error: err }, 'WARN');
      return '';
    }
  }

  getCanvasHash(canvas) {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      return this.simpleHash(dataUrl.substring(0, 200));
    } catch {
      return `${canvas.width}x${canvas.height}`;
    }
  }

  getImageHash(img) {
    try {
      const src = img.getAttribute('src') || '';
      return this.simpleHash(src);
    } catch {
      return `img_${img.width}x${img.height}`;
    }
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  async recognizeCanvasByPaddle(canvas, settings = {}) {
    const apiUrl = this.getApiUrl(settings);
    if (!apiUrl) {
      this.log('PaddleOCR API URL chua duoc cau hinh', {}, 'WARN');
      return '';
    }
    this.log('PaddleOCR: goi API', { apiUrl, source: 'canvas' });
    const cacheKey = this.getCanvasHash(canvas);
    const shouldCache = settings.cacheOCR ?? this.config.cacheOCR;
    if (shouldCache) {
      const cached = this.getCachedOcr(cacheKey);
      if (cached) return cached;
    }
    const snapshot = this.getCanvasSnapshot(canvas);
    const imageBase64 = snapshot || this.canvasToDataUrl(canvas);
    this.log('PaddleOCR: payload', {
      hasImageBase64: Boolean(imageBase64),
      base64Prefix: String(imageBase64 || '').slice(0, 30),
      base64Length: String(imageBase64 || '').length,
      usedSnapshot: Boolean(snapshot)
    });
    const text = await this.callPaddleOcr(apiUrl, {
      imageBase64,
      imageUrl: null,
      language: settings.ocrLanguage || this.config.ocrLanguage || 'vie'
    });
    if (text && shouldCache) {
      this.setCachedOcr(cacheKey, text, this.config.maxCacheSize);
    }
    return text;
  }

  async recognizeImageByPaddle(img, settings = {}) {
    const apiUrl = this.getApiUrl(settings);
    if (!apiUrl) {
      this.log('PaddleOCR API URL chua duoc cau hinh', {}, 'WARN');
      return '';
    }
    this.log('PaddleOCR: goi API', { apiUrl, source: 'image' });
    const cacheKey = this.getImageHash(img);
    const shouldCache = settings.cacheOCR ?? this.config.cacheOCR;
    if (shouldCache) {
      const cached = this.getCachedOcr(cacheKey);
      if (cached) return cached;
    }
    const imageUrl = img?.src || img?.getAttribute?.('src') || '';
    const imageBase64 = await this.imageToDataUrl(img).catch(() => '');
    this.log('PaddleOCR: payload', {
      hasImageBase64: Boolean(imageBase64),
      base64Prefix: String(imageBase64 || '').slice(0, 30),
      base64Length: String(imageBase64 || '').length,
      imageUrl: imageUrl || null
    });
    const text = await this.callPaddleOcr(apiUrl, {
      imageBase64: imageBase64 || null,
      imageUrl: imageUrl || null,
      language: settings.ocrLanguage || this.config.ocrLanguage || 'vie'
    });
    if (text && shouldCache) {
      this.setCachedOcr(cacheKey, text, this.config.maxCacheSize);
    }
    return text;
  }

  async recognizeCanvasByVietOcr(canvas, settings = {}) {
    const apiUrl = this.getApiUrl(settings);
    if (!apiUrl) {
      this.log('VietOCR API URL chua duoc cau hinh', {}, 'WARN');
      return '';
    }
    this.log('VietOCR: goi API', { apiUrl, source: 'canvas' });
    const cacheKey = this.getCanvasHash(canvas);
    const shouldCache = settings.cacheOCR ?? this.config.cacheOCR;
    if (shouldCache) {
      const cached = this.getCachedOcr(cacheKey);
      if (cached) return cached;
    }
    const snapshot = this.getCanvasSnapshot(canvas);
    const imageBase64 = snapshot || this.canvasToDataUrl(canvas);
    this.log('VietOCR: payload', {
      hasImageBase64: Boolean(imageBase64),
      base64Prefix: String(imageBase64 || '').slice(0, 30),
      base64Length: String(imageBase64 || '').length,
      smart: true,
      usedSnapshot: Boolean(snapshot)
    });
    const text = await this.callVietOcr(apiUrl, {
      image_base64: imageBase64,
      smart: true
    });
    if (text && shouldCache) {
      this.setCachedOcr(cacheKey, text, this.config.maxCacheSize);
    }
    return text;
  }

  async recognizeImageByVietOcr(img, settings = {}) {
    const apiUrl = this.getApiUrl(settings);
    if (!apiUrl) {
      this.log('VietOCR API URL chua duoc cau hinh', {}, 'WARN');
      return '';
    }
    this.log('VietOCR: goi API', { apiUrl, source: 'image' });
    const cacheKey = this.getImageHash(img);
    const shouldCache = settings.cacheOCR ?? this.config.cacheOCR;
    if (shouldCache) {
      const cached = this.getCachedOcr(cacheKey);
      if (cached) return cached;
    }
    const imageBase64 = await this.imageToDataUrl(img).catch(() => '');
    this.log('VietOCR: payload', {
      hasImageBase64: Boolean(imageBase64),
      base64Prefix: String(imageBase64 || '').slice(0, 30),
      base64Length: String(imageBase64 || '').length,
      smart: true
    });
    const text = await this.callVietOcr(apiUrl, {
      image_base64: imageBase64 || null,
      smart: true
    });
    if (text && shouldCache) {
      this.setCachedOcr(cacheKey, text, this.config.maxCacheSize);
    }
    return text;
  }

  async recognizeImageUrl(url, settings = {}) {
    const provider = String(settings.ocrProvider || this.config.ocrProvider || '').toLowerCase();
    if (!url) return '';
    if (provider === 'paddle') {
      const apiUrl = this.getApiUrl(settings);
      if (!apiUrl) {
        this.log('PaddleOCR API URL chua duoc cau hinh', {}, 'WARN');
        return '';
      }
      const imageBase64 = await this.urlToDataUrl(url).catch(() => '');
      this.log('PaddleOCR: payload (bg)', {
        hasImageBase64: Boolean(imageBase64),
        base64Prefix: String(imageBase64 || '').slice(0, 30),
        base64Length: String(imageBase64 || '').length,
        imageUrl: url || null
      });
      return await this.callPaddleOcr(apiUrl, {
        imageBase64: imageBase64 || null,
        imageUrl: url || null,
        language: settings.ocrLanguage || this.config.ocrLanguage || 'vie'
      });
    }
    if (provider === 'vietocr') {
      const apiUrl = this.getApiUrl(settings);
      if (!apiUrl) {
        this.log('VietOCR API URL chua duoc cau hinh', {}, 'WARN');
        return '';
      }
      const imageBase64 = await this.urlToDataUrl(url).catch(() => '');
      this.log('VietOCR: payload (bg)', {
        hasImageBase64: Boolean(imageBase64),
        base64Prefix: String(imageBase64 || '').slice(0, 30),
        base64Length: String(imageBase64 || '').length,
        imageUrl: url || null
      });
      return await this.callVietOcr(apiUrl, {
        image_base64: imageBase64 || null,
        smart: true
      });
    }
    this.log('OCR imageUrl chua ho tro cho provider nay', { provider }, 'WARN');
    return '';
  }

  getApiUrl(settings = {}) {
    const url = settings.ocrApiUrl || this.config.ocrApiUrl || '';
    return String(url || '').trim();
  }

  canvasToDataUrl(canvas) {
    try {
      return canvas.toDataURL('image/png');
    } catch (error) {
      this.log(`Khong the doc canvas: ${error.message}`, { error }, 'WARN');
      return '';
    }
  }

  getCanvasSnapshot(canvas) {
    const snapshot = canvas?.__novelSpeechSnapshot;
    return typeof snapshot === 'string' ? snapshot : '';
  }

  async imageToDataUrl(img) {
    const src = img?.src || img?.getAttribute?.('src') || '';
    if (!src) return '';
    if (src.startsWith('data:')) return src;
    const response = await fetch(src);
    const blob = await response.blob();
    return await this.blobToDataUrl(blob);
  }

  async urlToDataUrl(url) {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    const response = await fetch(url);
    const blob = await response.blob();
    return await this.blobToDataUrl(blob);
  }

  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Cannot read blob'));
      reader.readAsDataURL(blob);
    });
  }

  async callPaddleOcr(apiUrl, payload = {}) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        this.log('PaddleOCR: HTTP error', { apiUrl, status: response.status, statusText: response.statusText }, 'WARN');
      }
      const data = await response.json().catch(() => ({}));
      const text = this.extractTextFromOcrResponse(data);
      return (text || '').trim();
    } catch (error) {
      this.log(`PaddleOCR that bai: ${error.message}`, { error, apiUrl }, 'WARN');
      return '';
    }
  }

  async callVietOcr(apiUrl, payload = {}) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        this.log('VietOCR: HTTP error', { apiUrl, status: response.status, statusText: response.statusText }, 'WARN');
      }
      const data = await response.json().catch(() => ({}));
      const text = this.extractTextFromVietOcrResponse(data);
      return (text || '').trim();
    } catch (error) {
      this.log(`VietOCR that bai: ${error.message}`, { error, apiUrl }, 'WARN');
      return '';
    }
  }

  extractTextFromOcrResponse(data) {
    if (!data) return '';
    if (typeof data.text === 'string') return data.text;
    if (typeof data?.data?.text === 'string') return data.data.text;
    if (Array.isArray(data?.result)) {
      return data.result.map(item => item?.text || item?.[1]?.[0] || '').filter(Boolean).join('\n');
    }
    if (Array.isArray(data?.results)) {
      return data.results.map(item => item?.text || '').filter(Boolean).join('\n');
    }
    return '';
  }

  extractTextFromVietOcrResponse(data) {
    if (!data) return '';
    if (typeof data.text === 'string') return data.text;
    if (typeof data?.data?.text === 'string') return data.data.text;
    if (data?.success === false && data?.error) {
      this.log(`VietOCR error: ${data.error}`, { error: data.error }, 'WARN');
    }
    return '';
  }

  isApiProvider(provider) {
    const value = String(provider || '').toLowerCase();
    return value === 'paddle' || value === 'vietocr';
  }

  async loadCacheFromStorage() {
    if (this.ocrCacheLoaded) return;
    this.ocrCacheLoaded = true;

    try {
      let entries = [];
      if (globalThis.StorageService?.getOcrCache) {
        entries = await globalThis.StorageService.getOcrCache();
      } else {
        const cacheKey = STORAGE.OCR_CACHE || 'ocrCache';
        const result = await chrome.storage.local.get([cacheKey]);
        entries = Array.isArray(result[cacheKey]) ? result[cacheKey] : [];
      }

      entries.forEach(entry => {
        if (entry?.key && entry?.text) {
          this.ocrCache.set(entry.key, entry.text);
        }
      });
    } catch (error) {
      this.log('Không thể load cache OCR từ storage', { error }, 'WARN');
    }
  }

  getCachedOcr(key) {
    return this.ocrCache.get(key);
  }

  async setCachedOcr(key, text, maxSize = 100) {
    this.ocrCache.set(key, text);
    if (this.ocrCache.size > maxSize) {
      const firstKey = this.ocrCache.keys().next().value;
      this.ocrCache.delete(firstKey);
    }
    await this.saveCacheToStorage();
  }

  async saveCacheToStorage() {
    try {
      const entries = Array.from(this.ocrCache.entries()).map(([key, text]) => ({
        key,
        text,
        timestamp: Date.now()
      }));
      if (globalThis.StorageService?.setOcrCache) {
        await globalThis.StorageService.setOcrCache(entries);
      } else {
        const cacheKey = STORAGE.OCR_CACHE || 'ocrCache';
        await chrome.storage.local.set({ [cacheKey]: entries });
      }
    } catch (error) {
      this.log('Không thể lưu cache OCR', { error }, 'WARN');
    }
  }

  clearCache() {
    this.ocrCache.clear();
    this.log('Đã xóa cache OCR');
  }

  async terminate() {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
      this.isReady = false;
      if (typeof window !== 'undefined') {
        window.__novelSpeechOcrWorkerPromise = null;
      }
      this.log('OCR worker đã được terminate');
    }
  }
}

if (typeof window !== 'undefined') {
  window.OCRProcessor = OCRProcessor;
}
