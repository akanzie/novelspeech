/**
 * MessageRouter - xu ly message va dieu huong hanh dong
 */

(() => {
  const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
  const MESSAGES = CONFIG.MESSAGES || {};

  class MessageRouter {
    constructor(options = {}) {
      this.extractor = options.extractor || null;
      this.domController = options.domController || null;
      this.notify = typeof options.notify === 'function' ? options.notify : null;
      this.log = typeof options.log === 'function' ? options.log : null;
      this.getReady = typeof options.getReady === 'function' ? options.getReady : () => false;

      this.currentContent = null;
    }

    start() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        return this.handle(message, sender, sendResponse);
      });
    }

    async handle(message, sender, sendResponse) {
      this._log(`Nhan tin nhan: ${message.type}`);

      try {
        let response;
        switch (message.type) {
          case MESSAGES.EXTRACT_CONTENT || 'extractContent':
            response = await this.handleExtractContent(message.data);
            break;
          case MESSAGES.HIGHLIGHT_LINE || 'highlightLine':
            response = await this.handleHighlightLine(message.data);
            break;
          case MESSAGES.APPLY_APPEARANCE || 'applyAppearance':
            response = await this.handleApplyAppearance(message.data);
            break;
          case MESSAGES.GET_CHAPTER_LINKS || 'getChapterLinks':
            response = await this.handleGetChapterLinks();
            break;
          case MESSAGES.CLEAR_HIGHLIGHT || 'clearHighlight':
            response = await this.handleClearHighlight();
            break;
          case MESSAGES.MAP_CONTENT || 'mapContent':
            response = await this.handleMapContent(message.data);
            break;
          case MESSAGES.GET_CONTENT || 'getContent':
            response = await this.handleGetContent();
            break;
          case MESSAGES.PING || 'ping':
            response = { success: true, ready: this.getReady() };
            break;
          default:
            response = { success: false, error: 'Unknown message type' };
        }

        sendResponse(response);
      } catch (error) {
        this._log('Loi xu ly tin nhan', 'ERROR', { error });
        sendResponse({
          success: false,
          error: error.message,
          stack: error.stack
        });
      }

      return true;
    }

    async handleExtractContent(options = {}) {
      try {
        this._log('Dang trich xuat noi dung', 'INFO', { options });
        if (!this.extractor) throw new Error('Extractor is not available');

        const result = await this.extractor.extract(options);
        if (!result.success) {
          throw new Error(result.error || 'Extraction failed');
        }

        this.currentContent = {
          text: result.text,
          lines: result.lines,
          metadata: {
            chapterTitle: this.extractChapterTitle(),
            chapterUrl: window.location.href,
            extractedAt: new Date().toISOString(),
            source: result.source,
            hasOCR: result.ocrUsed || false,
            totalLines: result.lines.length
          }
        };

        if (options.mapToDOM !== false && this.domController?.mapContentToDOM) {
          this.domController.mapContentToDOM(result.lines);
        }

        return {
          success: true,
          ...this.currentContent
        };
      } catch (error) {
        this._log('Loi trich xuat noi dung', 'ERROR', { error });
        return {
          success: false,
          error: error.message,
          content: null
        };
      }
    }

    async extractContent(options = {}) {
      return this.handleExtractContent(options);
    }

    async handleHighlightLine(data) {
      try {
        if (!this.currentContent) {
          throw new Error('No content available. Extract content first.');
        }

        const { lineIndex, lineText, autoScroll, highlight } = data;
        const text = lineText || this.currentContent.lines[lineIndex];
        if (!text) {
          throw new Error(`Line ${lineIndex} not found in content`);
        }

        const success = await this.domController.highlightLine(lineIndex, text, {
          autoScroll,
          highlight
        });

        return {
          success,
          lineIndex,
          lineText: text.substring(0, 100) + (text.length > 100 ? '...' : '')
        };
      } catch (error) {
        this._log('Loi highlight dong', 'ERROR', { error });
        return {
          success: false,
          error: error.message
        };
      }
    }

    async handleClearHighlight() {
      try {
        this.domController.clearAll();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    async handleMapContent(data) {
      try {
        if (!this.currentContent) {
          throw new Error('No content available');
        }

        const lines = data?.lines || this.currentContent.lines;
        const elements = this.domController.mapContentToDOM(lines);

        return {
          success: true,
          mappedCount: elements.length,
          totalLines: lines.length
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    async handleGetContent() {
      return {
        success: true,
        content: this.currentContent
      };
    }

    extractChapterTitle() {
      const titleSelectors = [
        '.chapter-title',
        '.chapter-name',
        '.title-chapter',
        'h1.chapter',
        '.entry-title',
        'header h1',
        '.truyen-title',
        'h1'
      ];

      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length > 0) {
          return element.textContent.trim();
        }
      }

      const pageTitle = document.title;
      const match = pageTitle.match(/(Chuong|Chapter)\s+\d+[:-\s]*(.+)/i);
      if (match && match[2]) {
        return match[2].trim();
      }

      return document.title || 'Khong xac dinh';
    }

    async handleApplyAppearance(data = {}) {
      try {
        this.domController.updateAppearance(data);
        return { success: true };
      } catch (error) {
        this._log('Loi ap dung giao dien', 'ERROR', { error });
        return { success: false, error: error.message };
      }
    }

    async handleGetChapterLinks() {
      try {
        const links = this.findChapterLinks();
        return { success: true, ...links };
      } catch (error) {
        this._log('Loi tim lien ket chuong', 'ERROR', { error });
        return { success: false, error: error.message };
      }
    }

    findChapterLinks() {
      const prevRel = document.querySelector('a[rel="prev"]');
      const nextRel = document.querySelector('a[rel="next"]');

      const prev = this.extractLink(prevRel);
      const next = this.extractLink(nextRel);

      if (prev || next) {
        return {
          prevUrl: prev || this.findLinkByText('prev'),
          nextUrl: next || this.findLinkByText('next')
        };
      }

      const detected = this.findLinksByChapterNumber();
      return {
        prevUrl: detected.prevUrl || this.findLinkByText('prev'),
        nextUrl: detected.nextUrl || this.findLinkByText('next')
      };
    }

    extractLink(anchor) {
      if (!anchor) return null;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('javascript:')) return null;
      try {
        return new URL(href, window.location.href).toString();
      } catch {
        return null;
      }
    }

    findLinkByText(direction) {
      const candidates = Array.from(document.querySelectorAll('a'));
      const patterns = direction === 'prev'
        ? [/chuong\s*truoc/i, /prev/i, /previous/i, /«/]
        : [/chuong\s*sau/i, /next/i, /following/i, /»/];

      for (const a of candidates) {
        const text = (a.textContent || '').trim();
        if (!text) continue;
        if (patterns.some(p => p.test(text))) {
          const url = this.extractLink(a);
          if (url) return url;
        }
      }

      const selector = direction === 'prev'
        ? 'a.prev, a.previous, a.chapter-prev, a#prev_chap, a#prev, a[aria-label*="prev"], a[aria-label*="truoc"]'
        : 'a.next, a.chapter-next, a#next_chap, a#next, a[aria-label*="next"], a[aria-label*="sau"]';

      return this.extractLink(document.querySelector(selector));
    }

    findLinksByChapterNumber() {
      const current = this.getChapterNumberFromUrl(window.location.href);
      if (!current) return { prevUrl: null, nextUrl: null };

      const anchors = Array.from(document.querySelectorAll('a[href*="chuong-"]'));
      const candidates = anchors
        .map(a => {
          const url = this.extractLink(a);
          if (!url) return null;
          const num = this.getChapterNumberFromUrl(url);
          return num ? { url, num } : null;
        })
        .filter(Boolean);

      let prevUrl = null;
      let nextUrl = null;
      let prevNum = -Infinity;
      let nextNum = Infinity;

      for (const c of candidates) {
        if (c.num < current && c.num > prevNum) {
          prevNum = c.num;
          prevUrl = c.url;
        }
        if (c.num > current && c.num < nextNum) {
          nextNum = c.num;
          nextUrl = c.url;
        }
      }

      return { prevUrl, nextUrl };
    }

    getChapterNumberFromUrl(url) {
      if (!url) return null;
      const match = url.match(/chuong-(\d+)/i);
      if (!match) return null;
      return parseInt(match[1], 10);
    }

    getReadingProgress() {
      if (!this.currentContent) return null;
      const highlighted = this.domController.currentHighlight;
      return {
        hasContent: !!this.currentContent,
        totalLines: this.currentContent.lines.length,
        currentHighlight: highlighted ? highlighted.lineIndex : -1,
        chapterTitle: this.currentContent.metadata.chapterTitle,
        chapterUrl: this.currentContent.metadata.chapterUrl
      };
    }

    _log(message, level = 'INFO', data = {}) {
      if (this.log) {
        this.log(message, level, data);
        return;
      }

      if (globalThis.LogService?.log) {
        globalThis.LogService.log('MessageRouter', message, level, data);
        return;
      }

      const prefix = '[MessageRouter]';
      const timestamp = new Date().toISOString();
      console.log(`${prefix} ${timestamp} - ${message}`, data || '');
    }
  }

  if (typeof window !== 'undefined') {
    window.MessageRouter = MessageRouter;
  }
})();
