  /**
 * ContentExtractor - extract story content from DOM and OCR
 */

(() => {
  const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
  const MESSAGES = CONFIG.MESSAGES || {};

  class ContentExtractor {
    constructor() {
      this.config = {
        minTextLength: 200,
        ocrLanguage: 'vie',
        useOCR: true,
        useOCRImages: true,
        cacheOCR: true,
        maxCacheSize: 100,
        minCanvasArea: 1500,
        debug: false
      };

      const OcrClass = (typeof window !== 'undefined' && window.OCRProcessor) ? window.OCRProcessor : null;
      this.ocr = OcrClass ? new OcrClass({ ...this.config }) : null;
      if (!this.ocr) {
        this.log('OCRProcessor chua duoc load', {}, 'WARN');
      }

      const DomFinderClass = (typeof window !== 'undefined' && window.DomFinder) ? window.DomFinder : null;
      const TextNormalizerClass = (typeof window !== 'undefined' && window.TextNormalizer) ? window.TextNormalizer : null;
      const OcrPipelineClass = (typeof window !== 'undefined' && window.OcrPipeline) ? window.OcrPipeline : null;
      const CacheManagerClass = (typeof window !== 'undefined' && window.CacheManager) ? window.CacheManager : null;

      this.domFinder = DomFinderClass ? new DomFinderClass({ minTextLength: this.config.minTextLength }) : null;
      this.textNormalizer = TextNormalizerClass ? new TextNormalizerClass() : null;
      this.ocrPipeline = OcrPipelineClass ? new OcrPipelineClass({ ocr: this.ocr, log: this.log.bind(this) }) : null;
      this.cacheManager = CacheManagerClass ? new CacheManagerClass({ ocr: this.ocr, log: this.log.bind(this) }) : null;

      this.log('ContentExtractor da khoi tao');
    }

    // ============ LOGGING ============
    log(message, data = null, level = 'INFO') {
      if (globalThis.LogService?.log) {
        globalThis.LogService.log('ContentExtractor', message, level, data || {});
        return;
      }

      const payload = {
        level,
        message,
        module: 'ContentExtractor',
        data: data || {}
      };

      try {
        if (chrome?.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: MESSAGES.LOG || 'log', data: payload });
        }
      } catch {
        const prefix = '[ContentExtractor]';
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`${prefix} ${timestamp} - ${message}`, data || '');
      }
    }

    // ============ OCR INITIALIZATION ============
    async initOCR(settings = this.config) {
      if (!this.ocrPipeline) return false;
      return this.ocrPipeline.ensureReady(settings);
    }

    // ============ MAIN EXTRACTION ============
    async extract(options = {}) {
      const startTime = performance.now();
      const settings = { ...this.config, ...options };

      this.log('Bat dau trich xuat noi dung...');

      try {
        const result = await this.extractFromDOMWithOCR(settings);
        this.log('Noi dung da duoc trich xuat', { text: result.text, length: result.text.length });
        if (result.text.length < 50) {
          throw new Error('Khong tim thay noi dung hop le');
        }

        const processedText = this.processText(result.text);
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        this.log(`Trich xuat thanh cong trong ${elapsed}s (nguon: ${result.source})`);

        return {
          success: true,
          text: processedText,
          lines: processedText.split('\n\n').filter(p => p.trim()),
          blocks: result.blocks,
          source: result.source,
          length: processedText.length,
          ocrUsed: result.ocrUsed
        };
      } catch (error) {
        this.log(`Trich xuat that bai: ${error.message}`, { error }, 'ERROR');
        return {
          success: false,
          error: error.message,
          text: '',
          source: 'none',
          length: 0
        };
      }
    }

    // ============ DOM EXTRACTION ============
    async extractFromDOMWithOCR(settings) {
      const container = this.findContentContainer();
      if (!container) {
        return { text: '', source: 'dom', blocks: [], ocrUsed: false };
      }

      this.log(`Tim thay container: ${container.tagName}${container.className ? '.' + container.className : ''}`);

      const clone = container.cloneNode(true);
      this.attachSourceCanvases(container, clone);
      this.cleanContainer(clone);

      const hasCanvas = clone.querySelectorAll('canvas').length > 0;
      const hasImages = clone.querySelectorAll('img').length > 0;
      const shouldOCR = settings.useOCR && (hasCanvas || hasImages);

      const blocks = shouldOCR
        ? await this.buildBlocksWithOCR(clone, settings)
        : this.buildTextBlocks(clone);

      const text = blocks.map(b => b.content).join('\n\n');

      return {
        text,
        blocks,
        source: shouldOCR ? 'dom+ocr' : 'dom',
        ocrUsed: shouldOCR
      };
    }

    findContentContainer() {
      if (!this.domFinder) return document.body;
      return this.domFinder.findContentContainer();
    }

    cleanContainer(container) {
      if (!this.domFinder) return;
      this.domFinder.cleanContainer(container);
    }

    async buildBlocksWithOCR(container, settings) {
      if (!this.ocrPipeline) {
        throw new Error('OCR pipeline khong kha dung');
      }
      return this.ocrPipeline.buildBlocksWithOCR(container, settings);
    }

    buildTextBlocks(container) {
      if (!this.ocrPipeline) return [];
      return this.ocrPipeline.buildTextBlocks(container);
    }

    attachSourceCanvases(original, clone) {
      try {
        const originals = Array.from(original.querySelectorAll('canvas'));
        const clones = Array.from(clone.querySelectorAll('canvas'));
        clones.forEach((canvas, index) => {
          canvas.__novelSpeechSourceCanvas = originals[index] || null;
        });
      } catch (error) {
        this.log('Gan source canvas that bai', 'warn', { error });
      }
    }

    // ============ TEXT PROCESSING ============
    processText(rawText) {
      if (!this.textNormalizer) return rawText || '';
      return this.textNormalizer.processText(rawText);
    }

    // ============ UTILITIES ============
    clearCache() {
      if (this.cacheManager) {
        this.cacheManager.clearOcrCache();
        return;
      }
      this.log('Khong co CacheManager', {}, 'WARN');
    }

    async terminateOCR() {
      if (this.cacheManager) {
        await this.cacheManager.terminateOcr();
        return;
      }
      this.log('Khong co CacheManager', {}, 'WARN');
    }

    setConfig(config) {
      this.config = { ...this.config, ...config };
      if (this.ocr?.setConfig) {
        this.ocr.setConfig(this.config);
      }
      if (this.domFinder?.setConfig) {
        this.domFinder.setConfig(this.config);
      }
      if (this.ocrPipeline?.setOcr) {
        this.ocrPipeline.setOcr(this.ocr);
      }
      if (this.cacheManager?.setOcr) {
        this.cacheManager.setOcr(this.ocr);
      }
      this.log('Cau hinh da cap nhat', this.config);
    }
  }

  const contentExtractor = new ContentExtractor();

  if (typeof window !== 'undefined') {
    window.ContentExtractor = ContentExtractor;
    window.contentExtractor = contentExtractor;
  }
})();
