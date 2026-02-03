/**
 * Main Content Script - Entry point for content extraction and DOM control
 */

import ContentExtractor from './ContentExtractor.js';
import DOMController from './DOMController.js';

class StoryReaderContent {
  constructor() {
    this.extractor = new ContentExtractor();
    this.domController = new DOMController();
    this.currentContent = null;
    this.isReady = false;

    this.init();
  }

  async init() {
    console.log('📚 Story Reader Content Script initializing...');

    // Wait for page to load
    await this.waitForPageLoad();

    // Setup message listeners
    this.setupMessageListeners();

    // Auto-extract on load if enabled
    this.autoExtractOnLoad();

    this.isReady = true;
    console.log('✅ Content Script ready');

    // Notify background that we're ready
    this.notifyBackground('contentScriptReady');
  }

  async waitForPageLoad() {
    if (document.readyState === 'complete') {
      return;
    }

    return new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      } else {
        window.addEventListener('load', resolve, { once: true });
      }
    });
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      return this.handleMessage(message, sender, sendResponse);
    });
  }

  async handleMessage(message, sender, sendResponse) {
    console.log('📨 Content script received:', message.type);

    try {
      let response;

      switch (message.type) {
        case 'extractContent':
          response = await this.handleExtractContent(message.data);
          break;

        case 'highlightLine':
          response = await this.handleHighlightLine(message.data);
          break;

        case 'clearHighlight':
          response = await this.handleClearHighlight();
          break;

        case 'mapContent':
          response = await this.handleMapContent(message.data);
          break;

        case 'getContent':
          response = await this.handleGetContent();
          break;

        case 'ping':
          response = { success: true, ready: this.isReady };
          break;

        default:
          response = { success: false, error: 'Unknown message type' };
      }

      sendResponse(response);

    } catch (error) {
      console.error('❌ Message handling error:', error);
      sendResponse({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }

    return true; // Keep message channel open
  }

  async handleExtractContent(options = {}) {
    try {
      console.log('Extracting content with options:', options);

      // Extract content
      const result = await this.extractor.extract(options);

      if (!result.success) {
        throw new Error(result.error || 'Extraction failed');
      }

      // Store content locally
      this.currentContent = {
        text: result.text,
        lines: result.lines,
        metadata: {
          chapterTitle: this.extractChapterTitle(),
          chapterUrl: window.location.href,
          extractedAt: new Date().toISOString(),
          source: result.source,
          hasOCR: result.hasOCR || false,
          totalLines: result.lines.length
        }
      };

      // Map content to DOM if requested
      if (options.mapToDOM !== false) {
        this.domController.mapContentToDOM(result.lines);
      }

      return {
        success: true,
        ...this.currentContent
      };

    } catch (error) {
      console.error('Extract content error:', error);
      return {
        success: false,
        error: error.message,
        content: null
      };
    }
  }

  async handleHighlightLine(data) {
    try {
      if (!this.currentContent) {
        throw new Error('No content available. Extract content first.');
      }

      const { lineIndex, lineText } = data;

      // Get line text if not provided
      const text = lineText || this.currentContent.lines[lineIndex];

      if (!text) {
        throw new Error(`Line ${lineIndex} not found in content`);
      }

      // Highlight the line
      const success = await this.domController.highlightLine(lineIndex, text);

      return {
        success,
        lineIndex,
        lineText: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      };

    } catch (error) {
      console.error('Highlight line error:', error);
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
    // Try various selectors for chapter title
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

    // Fallback to page title
    const pageTitle = document.title;
    const match = pageTitle.match(/(Chương|Chapter)\s+\d+[:-\s]*(.+)/i);

    if (match && match[2]) {
      return match[2].trim();
    }

    return document.title || 'Không xác định';
  }

  async autoExtractOnLoad() {
    // Check if auto-extract is enabled
    chrome.storage.local.get(['autoExtract'], (result) => {
      if (result.autoExtract !== false) {
        console.log('Auto-extracting content...');

        // Small delay to ensure all content is loaded
        setTimeout(async () => {
          try {
            const content = await this.handleExtractContent();

            if (content.success) {
              // Notify background about extracted content
              this.notifyBackground('contentExtracted', {
                chapterUrl: window.location.href,
                chapterTitle: content.metadata.chapterTitle,
                lineCount: content.lines.length
              });
            }
          } catch (error) {
            console.error('Auto-extract error:', error);
          }
        }, 2000);
      }
    });
  }

  notifyBackground(type, data = {}) {
    chrome.runtime.sendMessage({
      type,
      data,
      timestamp: Date.now(),
      url: window.location.href
    }).catch(error => {
      // Background might not be ready, ignore
      console.log('Background not ready:', error.message);
    });
  }

  // Utility method to get current reading progress
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
}

// Initialize content script
const storyReaderContent = new StoryReaderContent();

// Make available globally for debugging
window.storyReaderContent = storyReaderContent;

export default storyReaderContent;
