/**
 * ContentExtractor - Module trích xuất nội dung truyện từ trang web
 * Hỗ trợ trích xuất từ DOM thông thường và OCR cho các trang dùng canvas/image
 * Được thiết kế chạy trong content script của Chrome Extension
 */

class ContentExtractor {
  constructor() {
    // Các selector phổ biến cho container nội dung truyện
    this.defaultSelectors = [
      '#chapter-content',
      '.chapter-content',
      '.break-words',
      '.chapter-c',             // Truyencv
      '.content1',              // Tangthuvien
      '.box-chap',              // Truyenyy
      '.panel-body',            // Truyenfull
      '.reading-content',
      '.entry-content',
      '.article-content',
      '.story-detail',
      '.nd',
      'article',
      'main',
      '.post-content',
      '.chap-content',
      '.read-content'
    ];

    // Cấu hình mặc định
    this.config = {
      minTextLength: 200,       // Độ dài tối thiểu để coi là nội dung hợp lệ
      ocrLanguage: 'vie',       // Ngôn ngữ OCR
      useOCR: true,             // Bật OCR khi cần
      cacheOCR: true,           // Cache kết quả OCR trong session
      debug: false              // In log chi tiết OCR
    };

    // Trạng thái OCR
    this.ocrWorker = null;      // Tesseract worker (hiệu suất tốt hơn recognize trực tiếp)
    this.isOCRReady = false;

    // Cache OCR trong session (Map: dataURL hash → text)
    this.ocrCache = new Map();

    this.log('📖 ContentExtractor đã khởi tạo');
  }

  // ============ LOGGING ============
  log(message, data = null) {
    const prefix = '[ContentExtractor]';
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];

    console.log(`${prefix} ${timestamp} - ${message}`, data || '');

    // Có thể mở rộng lưu vào chrome.storage.local nếu cần (giống Logger service)
  }

  // ============ OCR INITIALIZATION ============
  /**
   * Khởi tạo Tesseract worker (hiệu suất cao hơn recognize trực tiếp)
   */
  async initOCR() {
    if (this.isOCRReady) return true;

    try {
      this.log('Đang khởi tạo OCR worker (Tesseract.js)...');

      if (typeof Tesseract === 'undefined') {
        this.log('Tesseract.js chưa được load, đang tải từ CDN...', 'warn');
        await this.loadTesseractScript();
      }

      // Tạo worker để xử lý song song và không block UI
      this.ocrWorker = await Tesseract.createWorker({
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.0/dist/worker.min.js',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.0',
        logger: this.config.debug ? (m) => this.log('OCR progress', m) : () => {}
      });

      await this.ocrWorker.load();
      await this.ocrWorker.loadLanguage(this.config.ocrLanguage);
      await this.ocrWorker.initialize(this.config.ocrLanguage, Tesseract.OEM.LSTM_ONLY);

      // Cấu hình tối ưu cho văn bản tiếng Việt trên hình
      await this.ocrWorker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴÝỶỸ0123456789.,!?\'"()[]{}:;-–— ',
      });

      this.isOCRReady = true;
      this.log('✅ OCR worker đã sẵn sàng');
      return true;
    } catch (error) {
      this.log(`❌ Khởi tạo OCR thất bại: ${error.message}`, 'error');
      this.isOCRReady = false;
      return false;
    }
  }

  async loadTesseractScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.0/dist/tesseract.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Không tải được Tesseract.js'));
      document.head.appendChild(script);
    });
  }

  // ============ MAIN EXTRACTION ============
  /**
   * Hàm chính: Trích xuất nội dung từ trang
   * @param {Object} options - Cấu hình override
   */
  async extract(options = {}) {
    const startTime = performance.now();
    const settings = { ...this.config, ...options };

    this.log('Bắt đầu trích xuất nội dung...');

    try {
      // Bước 1: Thử trích xuất từ DOM
      let result = this.extractFromDOM();

      // Bước 2: Nếu DOM không đủ → dùng OCR (nếu bật)
      if (result.text.length < settings.minTextLength && settings.useOCR) {
        this.log(`DOM chỉ có ${result.text.length} ký tự → chuyển sang OCR`, 'warn');
        const ocrResult = await this.extractWithOCR(settings);

        if (ocrResult && ocrResult.text.length >= settings.minTextLength) {
          result = ocrResult;
        }
      }

      // Bước 3: Kiểm tra kết quả cuối cùng
      if (result.text.length < 50) {
        throw new Error('Không tìm thấy nội dung hợp lệ');
      }

      // Bước 4: Xử lý văn bản (làm sạch, chia đoạn)
      const processedText = this.processText(result.text);

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      this.log(`✅ Trích xuất thành công trong ${elapsed}s (nguồn: ${result.source})`, 'success');

      return {
        success: true,
        text: processedText,
        lines: processedText.split('\n\n').filter(p => p.trim()),
        source: result.source,
        length: processedText.length,
        ocrUsed: result.source === 'ocr'
      };

    } catch (error) {
      this.log(`❌ Trích xuất thất bại: ${error.message}`, 'error');
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
  extractFromDOM() {
    const container = this.findContentContainer();
    if (!container) {
      return { text: '', source: 'dom' };
    }

    this.log(`Tìm thấy container: ${container.tagName}${container.className ? '.' + container.className : ''}`);

    // Clone để xử lý an toàn
    const clone = container.cloneNode(true);
    this.cleanContainer(clone);

    const text = this.extractTextFromElement(clone);

    const hasCanvas = container.querySelectorAll('canvas').length > 0;

    return {
      text,
      source: 'dom',
      hasCanvas
    };
  }

  findContentContainer() {
    // Ưu tiên selector cụ thể
    for (const selector of this.defaultSelectors) {
      const el = document.querySelector(selector);
      if (el && this.isValidContent(el)) {
        return el;
      }
    }

    // Fallback: tìm theo mật độ text
    return this.findByTextDensity() || document.body;
  }

  findByTextDensity() {
    const candidates = Array.from(document.querySelectorAll('div, article, section, main, .content'))
      .filter(el => {
        const text = el.textContent.trim();
        return text.length > 300 && this.getTextDensity(el) > 0.15 && !this.isJunkElement(el);
      })
      .sort((a, b) => b.textContent.length - a.textContent.length);

    return candidates[0] || null;
  }

  getTextDensity(el) {
    const text = el.textContent || '';
    const html = el.innerHTML || '';
    return text.length / (html.length || 1);
  }

  isValidContent(el) {
    if (!el || el.offsetWidth < 200 || el.offsetHeight < 200) return false;
    const text = el.textContent.trim();
    return text.length > 300 && this.getTextDensity(el) > 0.1;
  }

  isJunkElement(el) {
    const junkKeywords = ['header', 'footer', 'nav', 'sidebar', 'menu', 'ad', 'banner', 'popup', 'comment', 'social', 'share', 'login'];
    const classId = (el.className || '') + (el.id || '');
    return junkKeywords.some(kw => classId.toLowerCase().includes(kw));
  }

  cleanContainer(container) {
    const removeSelectors = [
      'script', 'style', 'iframe', 'noscript',
      'nav', 'header', 'footer', 'aside',
      '[class*="ad"]', '[id*="ad"]', '[class*="banner"]',
      '.comments', '.share-buttons', '.social'
    ];

    removeSelectors.forEach(sel => {
      container.querySelectorAll(sel).forEach(el => el.remove());
    });
  }

  extractTextFromElement(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);

    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text) textNodes.push(text);
    }

    return textNodes.join(' ').replace(/\s+/g, ' ').trim();
  }

  // ============ OCR EXTRACTION ============
  async extractWithOCR(settings) {
    if (!(await this.initOCR())) {
      throw new Error('OCR không khả dụng');
    }

    const container = this.findContentContainer() || document.body;
    const canvases = Array.from(container.querySelectorAll('canvas'));

    if (canvases.length === 0) {
      throw new Error('Không tìm thấy canvas nào');
    }

    this.log(`Tìm thấy ${canvases.length} canvas → bắt đầu OCR`);

    const results = [];

    for (let i = 0; i < canvases.length; i++) {
      const canvas = canvases[i];
      const cacheKey = this.getCanvasHash(canvas);

      if (settings.cacheOCR && this.ocrCache.has(cacheKey)) {
        results.push(this.ocrCache.get(cacheKey));
        this.log(`Dùng cache OCR cho canvas ${i + 1}/${canvases.length}`);
        continue;
      }

      try {
        const { data: { text } } = await this.ocrWorker.recognize(canvas);
        const cleanText = text.trim();

        if (cleanText.length > 10) {
          results.push(cleanText);
          if (settings.cacheOCR) this.ocrCache.set(cacheKey, cleanText);
        }

        this.log(`OCR canvas ${i + 1}/${canvases.length}: ${cleanText.length} ký tự`);
      } catch (err) {
        this.log(`OCR lỗi canvas ${i + 1}: ${err.message}`, 'warn');
      }
    }

    if (results.length === 0) {
      throw new Error('OCR không nhận diện được văn bản nào');
    }

    return {
      text: results.join('\n\n'),
      source: 'ocr'
    };
  }

  getCanvasHash(canvas) {
    try {
      // Dùng dataURL hash ngắn làm key
      const dataUrl = canvas.toDataURL('image/png');
      return this.simpleHash(dataUrl.substring(0, 200));
    } catch {
      return `${canvas.width}x${canvas.height}`;
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

  // ============ TEXT PROCESSING ============
  processText(rawText) {
    if (!rawText.trim()) return '';

    let lines = rawText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    // Lọc dòng rác
    lines = this.filterJunkLines(lines);

    // Loại trùng
    lines = this.removeDuplicates(lines);

    // Tạo đoạn văn hợp lý
    return this.groupIntoParagraphs(lines);
  }

  filterJunkLines(lines) {
    const junkRegex = [
      /trang chủ|mục lục|đăng nhập|chương trước|chương sau|báo lỗi|quảng cáo|ads|copyright|bản quyền|facebook|twitter|share|like/i,
      /^chương\s*\d+\s*$/i,
      /^\d+$/,
      /^[.!?]{3,}$/,
      /^[-_=*]{5,}$/
    ];

    return lines.filter(line => {
      if (line.length < 5) return false;
      if (junkRegex.some(r => r.test(line))) return false;
      return true;
    });
  }

  removeDuplicates(lines) {
    const seen = new Set();
    return lines.filter(line => {
      const norm = line.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });
  }

  groupIntoParagraphs(lines) {
    const paragraphs = [];
    let current = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      current.push(line);

      const isEndOfParagraph =
        /[.!?…]"?$/.test(line) ||
        line.length > 150 ||
        (lines[i + 1] && lines[i + 1].length < 30) ||
        !lines[i + 1];

      if (isEndOfParagraph) {
        paragraphs.push(current.join(' ').trim());
        current = [];
      }
    }

    if (current.length) {
      paragraphs.push(current.join(' ').trim());
    }

    return paragraphs.filter(p => p.length > 10).join('\n\n');
  }

  // ============ UTILITIES ============
  clearCache() {
    this.ocrCache.clear();
    this.log('Đã xóa cache OCR');
  }

  async terminateOCR() {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
      this.isOCRReady = false;
      this.log('OCR worker đã được terminate');
    }
  }

  setConfig(config) {
    this.config = { ...this.config, ...config };
    this.log('Cấu hình đã cập nhật', this.config);
  }
}

// Khởi tạo instance duy nhất
const contentExtractor = new ContentExtractor();

// Global để debug từ console
if (typeof window !== 'undefined') {
  window.contentExtractor = contentExtractor;
}

export default contentExtractor;
