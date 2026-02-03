/**
   * DOM Controller - handle DOM highlight and scroll
   */

(() => {
  const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
  const MESSAGES = CONFIG.MESSAGES || {};

  class DOMController {
    constructor() {
      this.highlightClass = 'novelspeech-highlight';
      this.readingClass = 'novelspeech-reading';
      this.currentHighlight = null;
      this.lineElements = [];
      this.textMapping = new Map();

      this.init();
    }

    init() {
      this.log('DOM Controller da khoi tao');
      this.injectStyles();
    }

    log(message, level = 'INFO', data = {}) {
      if (globalThis.LogService?.log) {
        globalThis.LogService.log('DOMController', message, level, data);
        return;
      }

      const timestamp = new Date().toISOString();
      const payload = {
        level,
        message: `[${timestamp}] ${message}`,
        module: 'DOMController',
        data
      };

      try {
        if (chrome?.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: MESSAGES.LOG || 'log', data: payload });
        }
      } catch {
        const prefix = '[DOMController]';
        console.log(`${prefix} ${timestamp} - ${message}`, data || '');
      }
    }

    injectStyles() {
      const styleId = 'novelspeech-dynamic-styles';
      if (document.getElementById(styleId)) return;

      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
            .${this.highlightClass} {
                background-color: var(--novelspeech-highlight-bg, rgba(255, 235, 59, 0.3)) !important;
                border-left: 3px solid var(--novelspeech-highlight-border, #FF9800) !important;
                padding-left: 10px !important;
                transition: all 0.3s ease !important;
                animation: pulse-highlight 2s infinite !important;
            }
            
            .${this.readingClass} {
                background-color: rgba(67, 97, 238, 0.2) !important;
                border-left: 3px solid #4361ee !important;
            }
            
            @keyframes pulse-highlight {
                0% { background-color: var(--novelspeech-highlight-bg, rgba(255, 235, 59, 0.3)); }
                50% { background-color: var(--novelspeech-highlight-bg-strong, rgba(255, 235, 59, 0.5)); }
                100% { background-color: var(--novelspeech-highlight-bg, rgba(255, 235, 59, 0.3)); }
            }
            
            .novelspeech-scroll-marker {
                position: absolute;
                width: 100%;
                height: 2px;
                background: linear-gradient(90deg, #4361ee, #7209b7);
                z-index: 999999;
                pointer-events: none;
                opacity: 0.8;
            }
        `;

      document.head.appendChild(style);
    }

    updateAppearance(options = {}) {
      const root = document.documentElement;
      if (!root) return;

      const { highlightColor, highlightOpacity } = options;
      if (highlightColor) {
        root.style.setProperty('--novelspeech-highlight-border', highlightColor);
      }

      if (highlightColor && typeof highlightOpacity === 'number') {
        const rgb = this.hexToRgb(highlightColor);
        if (rgb) {
          root.style.setProperty('--novelspeech-highlight-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${highlightOpacity})`);
          root.style.setProperty('--novelspeech-highlight-bg-strong', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, highlightOpacity + 0.2)})`);
        }
      }
    }

    hexToRgb(hex) {
      const cleaned = hex.replace('#', '');
      if (cleaned.length !== 6) return null;
      const r = parseInt(cleaned.substring(0, 2), 16);
      const g = parseInt(cleaned.substring(2, 4), 16);
      const b = parseInt(cleaned.substring(4, 6), 16);
      return { r, g, b };
    }

    async highlightLine(lineIndex, lineText, options = {}) {
      try {
        const { autoScroll = true, highlight = true } = options;
        this.clearHighlight();

        const element = await this.findLineElement(lineText, lineIndex);
        if (!element) {
          this.log(`Khong tim thay phan tu cho dong ${lineIndex}`, 'WARN');
          return false;
        }

        if (highlight) {
          element.classList.add(this.highlightClass);
          element.classList.add(this.readingClass);
        }

        this.currentHighlight = highlight ? {
          element,
          lineIndex,
          lineText
        } : null;

        if (autoScroll) {
          await this.scrollToElement(element);
          this.addScrollMarker(element);
        }

        this.log(`Da highlight dong ${lineIndex}`);
        return true;
      } catch (error) {
        this.log('Loi khi highlight dong', 'ERROR', { error });
        return false;
      }
    }

    async findLineElement(lineText, lineIndex) {
      if (this.textMapping.has(lineIndex)) {
        const element = this.textMapping.get(lineIndex);
        if (document.contains(element)) {
          return element;
        }
        this.textMapping.delete(lineIndex);
      }

      const elements = await this.findTextElements(lineText);
      if (elements.length > 0) {
        const element = this.selectBestElement(elements, lineIndex);
        this.textMapping.set(lineIndex, element);
        return element;
      }

      return this.createLineWrapper(lineText, lineIndex);
    }

    async findTextElements(text) {
      const searchText = text.trim();
      if (searchText.length < 10) return [];

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function (node) {
            if (!node.textContent || node.textContent.trim().length === 0) {
              return NodeFilter.FILTER_REJECT;
            }

            if (node.textContent.includes(searchText)) {
              return NodeFilter.FILTER_ACCEPT;
            }

            const partialLength = Math.min(50, searchText.length);
            const partialText = searchText.substring(0, partialLength);
            if (node.textContent.includes(partialText)) {
              return NodeFilter.FILTER_ACCEPT;
            }

            return NodeFilter.FILTER_REJECT;
          }
        }
      );

      const elements = [];
      let node;
      while (node = walker.nextNode()) {
        const parent = node.parentElement;
        if (parent && !elements.includes(parent)) {
          elements.push(parent);
        }
      }

      return elements;
    }

    selectBestElement(elements, lineIndex) {
      const contentSelectors = [
        '#chapter-content',
        '.chapter-content',
        '.reading-content',
        '.entry-content',
        'article',
        'main'
      ];

      for (const element of elements) {
        for (const selector of contentSelectors) {
          if (element.closest(selector)) {
            return element;
          }
        }
      }

      return elements[0];
    }

    createLineWrapper(text, lineIndex) {
      const wrapper = document.createElement('div');
      wrapper.className = 'novelspeech-temp-wrapper';
      wrapper.dataset.lineIndex = lineIndex;
      wrapper.textContent = text;

      const contentArea = document.querySelector('#chapter-content') ||
        document.querySelector('article') ||
        document.body;

      contentArea.appendChild(wrapper);
      this.textMapping.set(lineIndex, wrapper);

      return wrapper;
    }

    async scrollToElement(element) {
      if (!element || !document.contains(element)) {
        this.log('Khong tim thay phan tu de cuon', 'WARN');
        return false;
      }

      try {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });

        setTimeout(() => {
          const headerHeight = this.getHeaderHeight();
          const elementRect = element.getBoundingClientRect();

          if (elementRect.top < headerHeight) {
            window.scrollBy({
              top: elementRect.top - headerHeight - 20,
              behavior: 'smooth'
            });
          }
        }, 100);

        return true;
      } catch (error) {
        this.log('Loi khi cuon toi phan tu', 'ERROR', { error });
        return false;
      }
    }

    getHeaderHeight() {
      const fixedHeaders = document.querySelectorAll('header, .header, .fixed-header, [style*="fixed"]');
      let totalHeight = 0;

      fixedHeaders.forEach(header => {
        const rect = header.getBoundingClientRect();
        totalHeight += rect.height;
      });

      return totalHeight;
    }

    addScrollMarker(element) {
      this.removeScrollMarker();

      const marker = document.createElement('div');
      marker.className = 'novelspeech-scroll-marker';

      const rect = element.getBoundingClientRect();
      marker.style.top = `${window.scrollY + rect.top}px`;
      marker.style.left = '0';

      document.body.appendChild(marker);
      this.scrollMarker = marker;

      setTimeout(() => {
        this.removeScrollMarker();
      }, 3000);
    }

    removeScrollMarker() {
      if (this.scrollMarker && this.scrollMarker.parentNode) {
        this.scrollMarker.parentNode.removeChild(this.scrollMarker);
        this.scrollMarker = null;
      }
    }

    clearHighlight() {
      document.querySelectorAll(`.${this.highlightClass}`).forEach(el => {
        el.classList.remove(this.highlightClass, this.readingClass);
      });

      this.currentHighlight = null;
      this.removeScrollMarker();
    }

    clearAll() {
      this.clearHighlight();
      this.textMapping.clear();
      this.lineElements = [];

      document.querySelectorAll('.novelspeech-temp-wrapper').forEach(el => {
        el.parentNode?.removeChild(el);
      });
    }

    mapContentToDOM(lines) {
      this.log('Dang anh xa noi dung vao DOM...');
      this.lineElements = [];
      this.textMapping.clear();

      lines.forEach((line, index) => {
        const element = this.findTextElement(line);
        if (element) {
          this.lineElements.push(element);
          this.textMapping.set(index, element);
        }
      });

      this.log(`Da anh xa ${this.lineElements.length}/${lines.length} dong vao DOM`);
      return this.lineElements;
    }

    findTextElement(text) {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function (node) {
            const nodeText = node.textContent.trim();
            const searchText = text.trim();

            if (nodeText.length === 0) return NodeFilter.FILTER_REJECT;

            if (nodeText.includes(searchText) ||
              searchText.includes(nodeText.substring(0, 50))) {
              return NodeFilter.FILTER_ACCEPT;
            }

            return NodeFilter.FILTER_REJECT;
          }
        }
      );

      let node = walker.nextNode();
      return node ? node.parentElement : null;
    }

    getCurrentScrollPosition() {
      return {
        scrollY: window.scrollY,
        scrollX: window.scrollX,
        windowHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight
      };
    }

    async simulateReadingProgress(lines, currentLine, speed = 1) {
      for (let i = currentLine; i < lines.length; i++) {
        await this.highlightLine(i, lines[i]);
        await new Promise(resolve => setTimeout(resolve, 5000 / speed));
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.DOMController = DOMController;
  }
})();
