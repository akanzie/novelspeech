/**
 * DOM Controller - Điều khiển DOM, highlight và scroll
 */

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
    console.log('✅ DOM Controller initialized');

    // Inject styles if not already present
    this.injectStyles();
  }

  injectStyles() {
    const styleId = 'novelspeech-dynamic-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
            .${this.highlightClass} {
                background-color: rgba(255, 235, 59, 0.3) !important;
                border-left: 3px solid #FF9800 !important;
                padding-left: 10px !important;
                transition: all 0.3s ease !important;
                animation: pulse-highlight 2s infinite !important;
            }
            
            .${this.readingClass} {
                background-color: rgba(67, 97, 238, 0.2) !important;
                border-left: 3px solid #4361ee !important;
            }
            
            @keyframes pulse-highlight {
                0% { background-color: rgba(255, 235, 59, 0.3); }
                50% { background-color: rgba(255, 235, 59, 0.5); }
                100% { background-color: rgba(255, 235, 59, 0.3); }
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

  async highlightLine(lineIndex, lineText) {
    try {
      // Remove previous highlight
      this.clearHighlight();

      // Find or create highlight element
      const element = await this.findLineElement(lineText, lineIndex);

      if (!element) {
        console.warn(`Could not find element for line ${lineIndex}`);
        return false;
      }

      // Add highlight classes
      element.classList.add(this.highlightClass);
      element.classList.add(this.readingClass);

      // Store reference
      this.currentHighlight = {
        element,
        lineIndex,
        lineText
      };

      // Scroll to element
      await this.scrollToElement(element);

      // Add scroll marker
      this.addScrollMarker(element);

      console.log(`✅ Highlighted line ${lineIndex}`);
      return true;

    } catch (error) {
      console.error('Error highlighting line:', error);
      return false;
    }
  }

  async findLineElement(lineText, lineIndex) {
    // Try to find existing mapping first
    if (this.textMapping.has(lineIndex)) {
      const element = this.textMapping.get(lineIndex);
      if (document.contains(element)) {
        return element;
      }
      this.textMapping.delete(lineIndex);
    }

    // Search for the text in the document
    const elements = await this.findTextElements(lineText);

    if (elements.length > 0) {
      // Use the most appropriate element
      const element = this.selectBestElement(elements, lineIndex);
      this.textMapping.set(lineIndex, element);
      return element;
    }

    // If not found, try to create a wrapper
    return this.createLineWrapper(lineText, lineIndex);
  }

  async findTextElements(text) {
    const searchText = text.trim();
    if (searchText.length < 10) return [];

    // Use TreeWalker to find text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          // Skip empty nodes
          if (!node.textContent || node.textContent.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }

          // Check if node contains the text
          if (node.textContent.includes(searchText)) {
            return NodeFilter.FILTER_ACCEPT;
          }

          // Check partial match (for long lines)
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
      // Get the parent element
      const parent = node.parentElement;
      if (parent && !elements.includes(parent)) {
        elements.push(parent);
      }
    }

    return elements;
  }

  selectBestElement(elements, lineIndex) {
    // Prioritize elements in the main content area
    const contentSelectors = [
      '#chapter-content',
      '.chapter-content',
      '.reading-content',
      '.entry-content',
      'article',
      'main'
    ];

    // Check if any element is in content area
    for (const element of elements) {
      for (const selector of contentSelectors) {
        if (element.closest(selector)) {
          return element;
        }
      }
    }

    // Return the first element
    return elements[0];
  }

  createLineWrapper(text, lineIndex) {
    // Create a temporary wrapper for text that can't be found
    const wrapper = document.createElement('div');
    wrapper.className = 'novelspeech-temp-wrapper';
    wrapper.dataset.lineIndex = lineIndex;
    wrapper.textContent = text;

    // Try to insert in a reasonable location
    const contentArea = document.querySelector('#chapter-content') ||
      document.querySelector('article') ||
      document.body;

    contentArea.appendChild(wrapper);
    this.textMapping.set(lineIndex, wrapper);

    return wrapper;
  }

  async scrollToElement(element) {
    if (!element || !document.contains(element)) {
      console.warn('Element not found for scrolling');
      return false;
    }

    try {
      // Smooth scroll to element
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });

      // Additional adjustment for fixed headers
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
      console.error('Error scrolling to element:', error);
      return false;
    }
  }

  getHeaderHeight() {
    // Calculate total height of fixed headers
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

    // Auto-remove after 3 seconds
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
    // Remove all highlight classes
    document.querySelectorAll(`.${this.highlightClass}`).forEach(el => {
      el.classList.remove(this.highlightClass, this.readingClass);
    });

    // Clear current highlight reference
    this.currentHighlight = null;

    // Remove scroll marker
    this.removeScrollMarker();
  }

  clearAll() {
    this.clearHighlight();
    this.textMapping.clear();
    this.lineElements = [];

    // Remove temporary wrappers
    document.querySelectorAll('.novelspeech-temp-wrapper').forEach(el => {
      el.parentNode?.removeChild(el);
    });
  }

  mapContentToDOM(lines) {
    console.log('Mapping content to DOM...');
    this.lineElements = [];
    this.textMapping.clear();

    lines.forEach((line, index) => {
      const element = this.findTextElement(line);
      if (element) {
        this.lineElements.push(element);
        this.textMapping.set(index, element);
      }
    });

    console.log(`Mapped ${this.lineElements.length} of ${lines.length} lines to DOM`);
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

          // Check for exact or partial match
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
    // Simulate reading progress for testing
    for (let i = currentLine; i < lines.length; i++) {
      await this.highlightLine(i, lines[i]);
      await new Promise(resolve => setTimeout(resolve, 5000 / speed));
    }
  }
}

export default DOMController;
