/**
 * OCR Service - Module xử lý OCR độc lập
 * Quản lý Tesseract.js và cache OCR
 */

class OCRService {
  constructor() {
    this.tesseract = null;
    this.worker = null;
    this.isInitialized = false;
    this.isInitializing = false;

    // Cache configuration
    this.cache = new Map();
    this.maxCacheSize = 100;

    // Default configuration
    this.config = {
      language: 'vie+eng',      // Tiếng Việt + Tiếng Anh
      oem: 1,                   // OCR Engine Mode
      psm: 3,                   // Page Segmentation Mode
      dpi: 300,                 // DPI for recognition
      cacheResults: true,
      debug: false
    };

    this.log('🖼️ OCR Service initialized');
  }

  // ============ INITIALIZATION ============
  async initialize() {
    if (this.isInitialized) return true;
    if (this.isInitializing) {
      return new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (this.isInitialized) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);
      });
    }

    this.isInitializing = true;

    try {
      this.log('Initializing Tesseract.js...');

      // Load Tesseract if not available
      if (typeof Tesseract === 'undefined') {
        await this.loadTesseractScript();
      }

      // Create worker
      this.worker = await Tesseract.createWorker({
        logger: (info) => this.handleTesseractLog(info),
        errorHandler: (error) => this.handleTesseractError(error)
      });

      // Load language data
      await this.worker.loadLanguage(this.config.language);
      await this.worker.initialize(this.config.language);

      // Set parameters
      await this.worker.setParameters({
        tessedit_ocr_engine_mode: this.config.oem,
        tessedit_pageseg_mode: this.config.psm,
        tessedit_char_whitelist: this.getCharacterWhitelist(),
        preserve_interword_spaces: '1'
      });

      this.isInitialized = true;
      this.isInitializing = false;

      this.log('✅ Tesseract.js initialized successfully', 'success');
      return true;

    } catch (error) {
      this.isInitializing = false;
      this.log(`❌ Failed to initialize Tesseract: ${error.message}`, 'error');
      throw error;
    }
  }

  async loadTesseractScript() {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (typeof Tesseract !== 'undefined') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@v4.0.2/dist/tesseract.min.js';
      script.onload = () => {
        this.log('Tesseract.js loaded from CDN');
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
      document.head.appendChild(script);
    });
  }

  // ============ OCR METHODS ============
  async recognizeCanvas(canvas, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(canvas, options);

      // Check cache
      if (this.config.cacheResults && this.cache.has(cacheKey)) {
        this.log('Using cached OCR result');
        return this.cache.get(cacheKey);
      }

      // Prepare canvas data
      const imageData = this.prepareCanvasForOCR(canvas);
      if (!imageData) {
        throw new Error('Canvas has no image data');
      }

      this.log(`Recognizing text from canvas (${canvas.width}x${canvas.height})...`);

      // Perform OCR
      const result = await this.worker.recognize(imageData, {
        ...this.config,
        ...options
      });

      const text = this.postProcessText(result.data.text);

      // Cache result
      if (this.config.cacheResults && text.trim().length > 0) {
        this.cacheResult(cacheKey, text);
      }

      return {
        success: true,
        text,
        confidence: result.data.confidence,
        blocks: result.data.blocks,
        cacheHit: false
      };

    } catch (error) {
      this.log(`OCR failed: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message,
        text: '',
        confidence: 0
      };
    }
  }

  async recognizeImage(imageElement, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Create temporary canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = imageElement.naturalWidth || imageElement.width;
      canvas.height = imageElement.naturalHeight || imageElement.height;

      ctx.drawImage(imageElement, 0, 0);

      return await this.recognizeCanvas(canvas, options);

    } catch (error) {
      this.log(`Image OCR failed: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message,
        text: ''
      };
    }
  }

  async recognizeImageUrl(imageUrl, options = {}) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';

      img.onload = async () => {
        try {
          const result = await this.recognizeImage(img, options);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageUrl;
    });
  }

  // ============ BATCH PROCESSING ============
  async recognizeMultipleCanvases(canvases, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const results = [];
    const failed = [];

    this.log(`Processing ${canvases.length} canvases...`);

    for (let i = 0; i < canvases.length; i++) {
      try {
        const result = await this.recognizeCanvas(canvases[i], options);

        if (result.success) {
          results.push({
            index: i,
            text: result.text,
            confidence: result.confidence
          });

          // Log progress
          if ((i + 1) % 5 === 0 || i === canvases.length - 1) {
            this.log(`Progress: ${i + 1}/${canvases.length} canvases`);
          }
        } else {
          failed.push(i);
        }
      } catch (error) {
        failed.push(i);
        this.log(`Canvas ${i} failed: ${error.message}`, 'warn');
      }
    }

    return {
      success: true,
      processed: results.length,
      failed: failed.length,
      results: results.sort((a, b) => a.index - b.index),
      allText: results.map(r => r.text).join('\n\n')
    };
  }

  // ============ PRE/POST PROCESSING ============
  prepareCanvasForOCR(canvas) {
    try {
      // Check if canvas has content
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Count non-transparent pixels
      let visiblePixels = 0;
      const data = imageData.data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 10) visiblePixels++;
      }

      // If less than 1% of pixels are visible, consider it empty
      const totalPixels = canvas.width * canvas.height;
      if (visiblePixels < totalPixels * 0.01) {
        this.log('Canvas appears to be empty', 'warn');
        return null;
      }

      // Enhance contrast if needed
      const enhancedCanvas = this.enhanceCanvas(canvas);

      return enhancedCanvas;
    } catch (error) {
      this.log(`Canvas preparation failed: ${error.message}`, 'error');
      return canvas;
    }
  }

  enhanceCanvas(canvas) {
    // Create a copy
    const enhanced = document.createElement('canvas');
    enhanced.width = canvas.width;
    enhanced.height = canvas.height;

    const ctx = enhanced.getContext('2d');
    ctx.drawImage(canvas, 0, 0);

    // Basic enhancement: convert to grayscale and increase contrast
    const imageData = ctx.getImageData(0, 0, enhanced.width, enhanced.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Convert to grayscale
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;

      // Increase contrast
      const contrast = 1.5;
      const newValue = ((avg - 128) * contrast) + 128;

      data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, newValue));
    }

    ctx.putImageData(imageData, 0, 0);
    return enhanced;
  }

  postProcessText(text) {
    if (!text) return '';

    // Remove extra whitespace
    let processed = text.replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    // Fix common OCR errors for Vietnamese
    const corrections = [
      // Common OCR mistakes
      [/ịa/g, 'ia'],
      [/ỷ/g, 'y'],
      [/ỹ/g, 'y'],
      [/ỗ/g, 'ô'],
      [/ộ/g, 'ô'],

      // Fix spacing around punctuation
      [/\s+([.,!?;:])/g, '$1'],
      [/([.,!?;:])([A-Za-zÀ-ỹ])/g, '$1 $2'],

      // Fix line breaks
      [/([a-zà-ỹ])\n([a-zà-ỹ])/g, '$1 $2'],
      [/([.!?])\s*([A-ZÀ-Ỹ])/g, '$1\n$2']
    ];

    corrections.forEach(([pattern, replacement]) => {
      processed = processed.replace(pattern, replacement);
    });

    return processed;
  }

  getCharacterWhitelist() {
    // Vietnamese alphabet + numbers + basic punctuation
    const vietnamese = 'aàáảãạăằắẳẵặâầấẩẫậbcdđeèéẻẽẹêềếểễệghiìíỉĩịklmnoòóỏõọôồốổỗộơờớởỡợpqrstuùúủũụưừứửữựvxyỳýỷỹỵ';
    const uppercase = vietnamese.toUpperCase();
    const numbers = '0123456789';
    const punctuation = ' .,!?;:\'"()-';

    return vietnamese + uppercase + numbers + punctuation;
  }

  // ============ CACHE MANAGEMENT ============
  generateCacheKey(canvas, options) {
    try {
      // Use canvas data URL for cache key
      const dataUrl = canvas.toDataURL();
      const optionsHash = JSON.stringify(options);

      // Simple hash combining both
      return `${dataUrl.substring(0, 100)}_${optionsHash}`;
    } catch (e) {
      // Fallback to canvas dimensions
      return `${canvas.width}x${canvas.height}_${JSON.stringify(options)}`;
    }
  }

  cacheResult(key, text) {
    // Remove oldest entry if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, text);
  }

  clearCache() {
    this.cache.clear();
    this.log('OCR cache cleared');
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      keys: Array.from(this.cache.keys())
    };
  }

  // ============ LOGGING ============
  log(message, level = 'info') {
    const prefix = '[OCRService]';
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];

    const styles = {
      success: 'color: green; font-weight: bold',
      error: 'color: red; font-weight: bold',
      warn: 'color: orange; font-weight: bold',
      info: 'color: blue'
    };

    const style = styles[level] || styles.info;
    console.log(`%c${prefix} ${timestamp} - ${message}`, style);
  }

  handleTesseractLog(info) {
    if (!this.config.debug) return;

    if (info.status === 'recognizing text') {
      this.log(`OCR progress: ${Math.round(info.progress * 100)}%`, 'info');
    }
  }

  handleTesseractError(error) {
    this.log(`Tesseract error: ${error.message}`, 'error');
  }

  // ============ CONFIGURATION ============
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    // Update worker parameters if initialized
    if (this.isInitialized && this.worker) {
      this.updateWorkerParameters();
    }

    this.log('Configuration updated');
  }

  async updateWorkerParameters() {
    try {
      await this.worker.setParameters({
        tessedit_ocr_engine_mode: this.config.oem,
        tessedit_pageseg_mode: this.config.psm
      });
    } catch (error) {
      this.log(`Failed to update parameters: ${error.message}`, 'error');
    }
  }

  // ============ CLEANUP ============
  async terminate() {
    if (this.worker) {
      try {
        await this.worker.terminate();
        this.worker = null;
      } catch (error) {
        this.log(`Failed to terminate worker: ${error.message}`, 'error');
      }
    }

    this.isInitialized = false;
    this.cache.clear();

    this.log('OCR Service terminated');
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isInitializing: this.isInitializing,
      cacheSize: this.cache.size,
      config: { ...this.config }
    };
  }
}

// Export singleton instance
const ocrService = new OCRService();

// Global access for debugging
if (window) {
  window.ocrService = ocrService;
}

export default ocrService;
