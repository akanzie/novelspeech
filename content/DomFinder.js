/**
 * DomFinder - tim va lam sach container noi dung
 */

(() => {
  const DEFAULT_SELECTORS = [
    '#chapter-content',
    '.chapter-content',
    '.break-words',
    '.chapter-c',
    '.content1',
    '.box-chap',
    '.panel-body',
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

  class DomFinder {
    constructor(options = {}) {
      this.selectors = Array.isArray(options.selectors) ? options.selectors : DEFAULT_SELECTORS.slice();
      this.minTextLength = typeof options.minTextLength === 'number' ? options.minTextLength : 200;
    }

    setConfig(config = {}) {
      if (Array.isArray(config.selectors)) {
        this.selectors = config.selectors;
      }
      if (typeof config.minTextLength === 'number') {
        this.minTextLength = config.minTextLength;
      }
    }

    findContentContainer() {
      for (const selector of this.selectors) {
        const el = document.querySelector(selector);
        if (el && this.isValidContent(el)) {
          return el;
        }
      }

      return this.findByTextDensity() || document.body;
    }

    findByTextDensity() {
      const candidates = Array.from(document.querySelectorAll('div, article, section, main, .content'))
        .filter(el => {
          const text = (el.textContent || '').trim();
          return text.length > 300 && this.getTextDensity(el) > 0.15 && !this.isJunkElement(el);
        })
        .sort((a, b) => (b.textContent || '').length - (a.textContent || '').length);

      return candidates[0] || null;
    }

    getTextDensity(el) {
      const text = el.textContent || '';
      const html = el.innerHTML || '';
      return text.length / (html.length || 1);
    }

    isValidContent(el) {
      if (!el || el.offsetWidth < 200 || el.offsetHeight < 200) return false;
      const text = (el.textContent || '').trim();
      const minLen = Math.max(300, this.minTextLength || 0);
      return text.length > minLen && this.getTextDensity(el) > 0.1;
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
  }

  if (typeof window !== 'undefined') {
    window.DomFinder = DomFinder;
  }
})();
