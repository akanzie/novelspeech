/**
 * Main Content Script - thin orchestrator
 */
(() => {
  const CONFIG = globalThis.NOVELSPEECH_CONFIG || {};
  const MESSAGES = CONFIG.MESSAGES || {};

  class StoryReaderContent {
    constructor() {
      const ExtractorClass = window.ContentExtractor || ContentExtractor;
      const DomControllerClass = window.DOMController || DOMController;
      const MessageRouterClass = window.MessageRouter || MessageRouter;
      const AutoExtractClass = window.AutoExtract || AutoExtract;

      this.extractor = new ExtractorClass();
      this.domController = new DomControllerClass();
      this.isReady = false;

      this.router = new MessageRouterClass({
        extractor: this.extractor,
        domController: this.domController,
        log: this.log.bind(this),
        notify: this.notifyBackground.bind(this),
        getReady: () => this.isReady
      });

      this.autoExtract = new AutoExtractClass({
        router: this.router,
        domController: this.domController,
        log: this.log.bind(this),
        notify: this.notifyBackground.bind(this)
      });

      this.init();
    }

    async init() {
      this.log('Content Script dang khoi tao...');

      await this.waitForPageLoad();

      this.router.start();
      this.autoExtract.start();

      this.isReady = true;
      this.log('Content Script da san sang');

      this.notifyBackground(MESSAGES.CONTENT_SCRIPT_READY || 'contentScriptReady');
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

    notifyBackground(type, data = {}) {
      chrome.runtime.sendMessage({
        type,
        data,
        timestamp: Date.now(),
        url: window.location.href
      }).catch(error => {
        this.log('Background chua san sang', 'WARN', { error });
      });
    }

    log(message, level = 'INFO', data = {}) {
      if (globalThis.LogService?.log) {
        globalThis.LogService.log('ContentScript', message, level, data);
        return;
      }

      const timestamp = new Date().toISOString();
      const payload = {
        level,
        message: `[${timestamp}] ${message}`,
        module: 'ContentScript',
        data
      };

      try {
        if (chrome?.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: MESSAGES.LOG || 'log', data: payload });
        }
      } catch {
        const prefix = '[ContentScript]';
        console.log(`${prefix} ${timestamp} - ${message}`, data || '');
      }
    }
  }

  const storyReaderContent = new StoryReaderContent();
  window.storyReaderContent = storyReaderContent;
})();
