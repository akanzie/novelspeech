/**
 * Content Extraction Module with OCR Support
 * Module trích xuất văn bản từ trang truyện kết hợp OCR cho canvas
 */

class ContentExtractor {
  constructor() {
    // DOM selectors cho các trang truyện phổ biến
    this.defaultSelectors = [
      '#chapter-content',
      '.chapter-content',
      '.break-words',           // Selector phổ biến cho truyện convert
      '.chapter-c',             // Truyencv
      '.content1',              // Tangthuvien
      '.box-chap',              // Truyenyy
      '.panel-body',            // Truyenfull
      '.reading-content',       // Nhiều trang
      '.entry-content',         // WordPress based
      '.article-content',
      '.story-detail',
      '.nd',
      'article',
      'main',
      '.post-content'
    ];

    // OCR service
    this.ocrService = null;
    this.isOCRReady = false;

    // Cache cho kết quả OCR
    this.ocrCache = new Map();

    // Cấu hình
    this.config = {
      minTextLength: 100,       // Độ dài tối thiểu để xác định có nội dung
      ocrLanguage: 'vie',       // Ngôn ngữ OCR mặc định
      useOCR: true,             // Bật/tắt OCR
      cacheOCR: true,           // Cache kết quả OCR
      debug: false              // Chế độ debug
    };

    this.log('📖 Content Extractor initialized with OCR support');
  }

  // ============ LOGGING UTILITIES ============
  log(message, level = 'info') {
    const prefix = '[ContentExtractor]';
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];

    const logEntry = {
      timestamp,
      module: 'ContentExtractor',
      level,
      message,
      url: window.location.href
    };

    // Console logging
    switch (level) {
      case 'error':
        console.error(`${prefix} ${timestamp} - ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${timestamp} - ${message}`);
        break;
      case 'success':
        console.log(`%c${prefix} ${timestamp} - ${message}`, 'color: green; font-weight: bold');
        break;
      default:
        console.log(`${prefix} ${timestamp} - ${message}`);
    }

    // Save to storage (optional)
    this.saveLog(logEntry);
  }

  saveLog(logEntry) {
    try {
      chrome.storage.local.get(['systemLogs'], (result) => {
        const logs = result.systemLogs || [];
        logs.unshift(logEntry);
        if (logs.length > 100) logs.pop();
        chrome.storage.local.set({ systemLogs: logs });
      });
    } catch (e) {
      // Silent fail for logging
    }
  }

  // ============ OCR INITIALIZATION ============
  async initOCR() {
    if (this.isOCRReady) return true;

    try {
      this.log('Initializing OCR service...');

      // Kiểm tra Tesseract.js đã được load chưa
      if (typeof Tesseract === 'undefined') {
        this.log('Tesseract.js not loaded, loading from CDN...', 'warn');
        await this.loadTesseract();
      }

      this.ocrService = Tesseract;
      this.isOCRReady = true;
      this.log('✅ OCR service ready');
      return true;
    } catch (error) {
      this.log(`Failed to initialize OCR: ${error.message}`, 'error');
      return false;
    }
  }

  async loadTesseract() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@v4.0.2/dist/tesseract.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
      document.head.appendChild(script);
    });
  }

  // ============ MAIN EXTRACTION METHODS ============
  async extract(options = {}) {
    const startTime = performance.now();

    try {
      this.log('Starting content extraction...');

      // Merge options với config
      const settings = { ...this.config, ...options };

      // Bước 1: Thử trích xuất từ DOM trước
      let result = await this.extractFromDOM(settings);

      // Bước 2: Nếu DOM không đủ, thử OCR (nếu được bật)
      if ((!result || result.text.length < settings.minTextLength) && settings.useOCR) {
        this.log('DOM extraction insufficient, trying OCR...', 'warn');
        const ocrResult = await this.extractWithOCR(settings);

        if (ocrResult && ocrResult.text.length >= settings.minTextLength) {
          result = ocrResult;
        }
      }

      // Bước 3: Fallback nếu cả hai đều thất bại
      if (!result || result.text.length < 50) {
        throw new Error('Không tìm thấy nội dung đủ dài (> 50 ký tự)');
      }

      // Bước 4: Xử lý và làm sạch văn bản
      const processedText = this.processText(result.text, settings);

      const elapsedTime = ((performance.now() - startTime) / 1000).toFixed(2);
      this.log(`✅ Extraction completed in ${elapsedTime}s`, 'success');

      return {
        success: true,
        text: processedText,
        source: result.source,
        length: processedText.length,
        lines: processedText.split('\n').filter(l => l.trim()).length,
        hasImages: result.hasImages || false,
        ocrUsed: result.source === 'ocr'
      };

    } catch (error) {
      this.log(`❌ Extraction failed: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message,
        text: '',
        source: 'none',
        length: 0,
        lines: 0
      };
    }
  }

  // ============ DOM EXTRACTION ============
  async extractFromDOM(settings) {
    try {
      // Tìm container chính
      const container = this.findContentContainer();
      if (!container) {
        throw new Error('Không tìm thấy container nội dung');
      }

      this.log(`Found container: ${container.tagName}.${container.className}`);

      // Kiểm tra có canvas không
      const hasCanvas = container.querySelectorAll('canvas').length > 0;

      // Clone container để không ảnh hưởng DOM gốc
      const clone = container.cloneNode(true);

      // Loại bỏ các thành phần không cần thiết
      this.cleanContainer(clone);

      // Trích xuất text
      let text = '';

      // Thử các phương pháp khác nhau theo độ ưu tiên
      if (clone.querySelector('canvas')) {
        // Có canvas, đánh dấu để OCR sau
        text = this.extractTextFromElement(clone);
        this.log(`DOM has canvas, text length: ${text.length}`);
      } else {
        // Không có canvas, lấy text trực tiếp
        text = this.extractTextFromElement(clone);
        this.log(`Text extracted from DOM: ${text.length} chars`);
      }

      return {
        text,
        source: 'dom',
        hasCanvas,
        container: container
      };

    } catch (error) {
      this.log(`DOM extraction failed: ${error.message}`, 'error');
      throw error;
    }
  }

  findContentContainer() {
    // Thử từng selector theo độ ưu tiên
    for (const selector of this.defaultSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && this.isValidContent(element)) {
          this.log(`Found content with selector: ${selector}`);
          return element;
        }
      } catch (e) {
        // Skip invalid selector
      }
    }

    // Fallback: Tìm phần tử có nhiều text nhất
    return this.findContentByTextDensity();
  }

  findContentByTextDensity() {
    const candidates = Array.from(document.querySelectorAll('div, article, section, main'))
      .filter(el => {
        const text = el.textContent || '';
        return text.length > 100 &&
          !this.isJunkElement(el) &&
          this.getTextDensity(el) > 0.1;
      })
      .sort((a, b) => {
        // Ưu tiên phần tử có nhiều text hơn
        const aText = a.textContent.length;
        const bText = b.textContent.length;
        return bText - aText;
      });

    return candidates[0] || null;
  }

  getTextDensity(element) {
    const text = element.textContent || '';
    const html = element.innerHTML || '';
    return text.length / (html.length || 1);
  }

  isValidContent(element) {
    if (!element || element.offsetWidth < 100 || element.offsetHeight < 100) {
      return false;
    }

    const text = element.textContent || '';
    const html = element.innerHTML || '';

    // Loại bỏ các phần tử có quá nhiều script/style
    const scriptRatio = (html.match(/<script|<style/g) || []).length / (html.length / 1000);
    if (scriptRatio > 5) return false;

    // Kiểm tra độ dài text và mật độ text
    const textLength = text.trim().length;
    const textDensity = textLength / (html.length || 1);

    return textLength > 200 && textDensity > 0.05;
  }

  isJunkElement(element) {
    const classes = element.className || '';
    const id = element.id || '';

    const junkPatterns = [
      'header', 'footer', 'sidebar', 'menu', 'nav',
      'ad', 'banner', 'promo', 'sponsor', 'popup',
      'comment', 'related', 'suggest', 'share',
      'social', 'login', 'register', 'ads'
    ];

    const patterns = junkPatterns.join('|');
    const regex = new RegExp(patterns, 'i');

    return regex.test(classes) || regex.test(id) ||
      element.offsetHeight < 50 ||
      element.offsetWidth < 50;
  }

  cleanContainer(container) {
    const selectorsToRemove = [
      'script', 'style', 'iframe', 'noscript', 'link', 'meta',
      'nav', 'header', 'footer', 'aside', 'sidebar',
      '[class*="ad"]', '[id*="ad"]', '[class*="banner"]',
      '[class*="popup"]', '[class*="modal"]',
      '.comments', '.related', '.share', '.social',
      'ins', 'embed', 'object', 'applet'
    ];

    selectorsToRemove.forEach(selector => {
      const elements = container.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });

    // Xóa các phần tử ẩn
    const hiddenElements = container.querySelectorAll('[style*="display:none"], [style*="display: none"], [style*="visibility:hidden"]');
    hiddenElements.forEach(el => el.remove());
  }

  extractTextFromElement(element) {
    if (!element) return '';

    // Sử dụng TreeWalker để duyệt các text node
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          // Bỏ qua text node trống hoặc chỉ có khoảng trắng
          if (!node.textContent || node.textContent.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }
          // Bỏ qua text node trong script/style
          if (node.parentElement.tagName === 'SCRIPT' ||
            node.parentElement.tagName === 'STYLE') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    const textNodes = [];
    let node = walker.nextNode();
    while (node) {
      textNodes.push(node.textContent.trim());
      node = walker.nextNode();
    }

    // Xử lý các thẻ block để thêm dấu xuống dòng
    const blockElements = element.querySelectorAll('p, div, br, h1, h2, h3, h4, h5, h6, li');
    blockElements.forEach(el => {
      if (el.tagName === 'BR') {
        textNodes.push('\n');
      }
    });

    let text = textNodes.join(' ');

    // Chuẩn hóa khoảng trắng và dấu xuống dòng
    text = text.replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    return text;
  }

  // ============ OCR EXTRACTION ============
  async extractWithOCR(settings) {
    try {
      // Khởi tạo OCR nếu chưa sẵn sàng
      const ocrReady = await this.initOCR();
      if (!ocrReady) {
        throw new Error('OCR service not available');
      }

      this.log('Starting OCR extraction...');

      // Tìm tất cả canvas trong container nội dung
      const container = this.findContentContainer() || document.body;
      const canvases = Array.from(container.querySelectorAll('canvas'));

      if (canvases.length === 0) {
        throw new Error('No canvas elements found');
      }

      this.log(`Found ${canvases.length} canvas elements`);

      let allText = [];
      let processedCount = 0;

      // Xử lý từng canvas
      for (const canvas of canvases) {
        try {
          // Kiểm tra cache (nếu bật)
          const cacheKey = this.getCanvasCacheKey(canvas);
          if (settings.cacheOCR && this.ocrCache.has(cacheKey)) {
            const cachedText = this.ocrCache.get(cacheKey);
            allText.push(cachedText);
            this.log(`Using cached OCR result for canvas ${processedCount + 1}`);
          } else {
            // Thực hiện OCR
            const text = await this.recognizeCanvas(canvas, settings.ocrLanguage);

            if (text && text.trim().length > 0) {
              allText.push(text);

              // Lưu cache
              if (settings.cacheOCR) {
                this.ocrCache.set(cacheKey, text);
              }
            }
          }

          processedCount++;

          // Log progress
          if (processedCount % 3 === 0 || processedCount === canvases.length) {
            this.log(`OCR progress: ${processedCount}/${canvases.length} canvases`);
          }

        } catch (error) {
          this.log(`OCR failed for canvas ${processedCount}: ${error.message}`, 'warn');
        }
      }

      if (allText.length === 0) {
        throw new Error('No text recognized from canvas');
      }

      const combinedText = allText.join('\n\n');
      this.log(`✅ OCR completed: ${combinedText.length} characters recognized`);

      return {
        text: combinedText,
        source: 'ocr',
        canvasCount: canvases.length,
        processedCount: processedCount
      };

    } catch (error) {
      this.log(`OCR extraction failed: ${error.message}`, 'error');
      throw error;
    }
  }

  getCanvasCacheKey(canvas) {
    try {
      // Tạo cache key từ data URL của canvas
      return canvas.toDataURL().substring(0, 100);
    } catch (e) {
      // Fallback: dùng kích thước và vị trí
      const rect = canvas.getBoundingClientRect();
      return `${canvas.width}x${canvas.height}_${rect.top}_${rect.left}`;
    }
  }

  async recognizeCanvas(canvas, language = 'vie') {
    return new Promise((resolve, reject) => {
      try {
        // Kiểm tra canvas có dữ liệu không
        const context = canvas.getContext('2d');
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        // Đếm số pixel không trong suốt
        let nonTransparentPixels = 0;
        const data = imageData.data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 10) nonTransparentPixels++;
        }

        // Nếu canvas trống hoặc gần trống
        if (nonTransparentPixels < 100) {
          resolve('');
          return;
        }

        // Thực hiện OCR với Tesseract
        Tesseract.recognize(
          canvas,
          language,
          {
            logger: info => {
              if (settings.debug) {
                console.log('OCR progress:', info);
              }
            },
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK
          }
        ).then(result => {
          const text = result.data.text || '';
          resolve(text.trim());
        }).catch(reject);

      } catch (error) {
        reject(error);
      }
    });
  }

  // ============ TEXT PROCESSING ============
  processText(text, settings) {
    if (!text || text.trim().length === 0) return '';

    // 1. Chia thành dòng
    let lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // 2. Loại bỏ dòng menu/header/footer
    lines = this.filterJunkLines(lines);

    // 3. Loại bỏ dòng trùng lặp
    lines = this.removeDuplicateLines(lines);

    // 4. Chia đoạn hợp lý
    const paragraphs = this.createParagraphs(lines);

    // 5. Join lại thành văn bản hoàn chỉnh
    return paragraphs.join('\n\n');
  }

  filterJunkLines(lines) {
    const junkPatterns = [
      // Menu patterns
      /trang chủ/i, /mục lục/i, /đăng nhập/i, /đăng ký/i,
      /chương trước/i, /chương sau/i, /chương tiếp/i,
      /bình luận/i, /thảo luận/i,

      // Advertisement patterns
      /quảng cáo/i, /sponsored/i, /ads/i,

      // Social media
      /facebook/i, /twitter/i, /share/i, /like/i,

      // Copyright
      /copyright/i, /bản quyền/i, /all rights reserved/i,

      // Page navigation
      /trang \d+\s*\/\s*\d+/i, /page \d+\s*\/\s*\d+/i,

      // Short lines (có thể là số chương)
      /^chương\s+\d+$/i, /^chapter\s+\d+$/i,
      /^\d+$/, /^[\d\.]+$/ // Chỉ có số
    ];

    return lines.filter(line => {
      // Loại bỏ dòng quá ngắn (trừ số chương)
      if (line.length < 3 && !/^\d+$/.test(line)) {
        return false;
      }

      // Loại bỏ dòng khớp với junk patterns
      for (const pattern of junkPatterns) {
        if (pattern.test(line)) {
          return false;
        }
      }

      // Loại bỏ dòng toàn ký tự đặc biệt
      const specialCharRatio = (line.replace(/[a-zA-ZÀ-ỹ0-9\s]/g, '').length / line.length);
      if (specialCharRatio > 0.5) {
        return false;
      }

      return true;
    });
  }

  removeDuplicateLines(lines) {
    const seen = new Set();
    const uniqueLines = [];

    for (const line of lines) {
      const normalized = line.toLowerCase().replace(/\s+/g, ' ');

      // Nếu dòng tương tự đã xuất hiện, bỏ qua
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueLines.push(line);
      }
    }

    return uniqueLines;
  }

  createParagraphs(lines) {
    const paragraphs = [];
    let currentParagraph = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];

      currentParagraph.push(line);

      // Kết thúc đoạn khi:
      // 1. Dòng hiện tại kết thúc bằng dấu câu kết thúc câu
      // 2. Dòng tiếp theo trống hoặc là dòng ngắn (có thể là số chương)
      // 3. Dòng hiện tại rất dài (có thể là đoạn văn)

      const endsWithSentenceEnd = /[.!?…"]$/.test(line.trim());
      const isLongLine = line.length > 100;
      const nextIsShort = nextLine && nextLine.length < 20;
      const nextIsChapter = nextLine && /^(chương|chapter)\s+\d+/i.test(nextLine);

      if (endsWithSentenceEnd || isLongLine || nextIsShort || nextIsChapter || !nextLine) {
        const paragraphText = currentParagraph.join(' ');
        if (paragraphText.trim().length > 0) {
          paragraphs.push(paragraphText);
        }
        currentParagraph = [];
      }
    }

    // Thêm đoạn cuối nếu còn
    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph.join(' '));
    }

    return paragraphs;
  }

  // ============ UTILITY METHODS ============
  clearCache() {
    this.ocrCache.clear();
    this.log('OCR cache cleared');
  }

  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.log('Configuration updated');
  }

  getStats() {
    return {
      ocrCacheSize: this.ocrCache.size,
      isOCRReady: this.isOCRReady,
      config: { ...this.config }
    };
  }
}

// Khởi tạo và export module
const contentExtractor = new ContentExtractor();

// Global access for debugging
if (window) {
  window.contentExtractor = contentExtractor;
}

export default contentExtractor;
