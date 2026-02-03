/**
 * Event Handler - Xử lý messages và events giữa các components
 */

class EventHandler {
  constructor() {
    this.messageHandlers = new Map();
    this.stateManager = null;
    this.ttsService = null;
    this.init();
  }

  async init() {
    // Setup message listeners
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      return this.handleMessage(message, sender, sendResponse);
    });

    // Setup connection listeners
    chrome.runtime.onConnect.addListener((port) => {
      this.handleConnection(port);
    });

    console.log('✅ Event Handler initialized');
  }

  setStateManager(stateManager) {
    this.stateManager = stateManager;
  }

  setTTSService(ttsService) {
    this.ttsService = ttsService;
  }

  async handleMessage(message, sender, sendResponse) {
    console.log('📨 Message received:', message.type, message);

    try {
      let response;

      switch (message.type) {
        case 'startReading':
          response = await this.handleStartReading(message.data, sender.tab?.id);
          break;

        case 'pauseReading':
          response = await this.handlePauseReading();
          break;

        case 'resumeReading':
          response = await this.handleResumeReading();
          break;

        case 'stopReading':
          response = await this.handleStopReading();
          break;

        case 'nextLine':
          response = await this.handleNextLine();
          break;

        case 'prevLine':
          response = await this.handlePrevLine();
          break;

        case 'updateSettings':
          response = await this.handleUpdateSettings(message.data);
          break;

        case 'getState':
          response = await this.handleGetState();
          break;

        case 'extractContent':
          response = await this.handleExtractContent(sender.tab?.id);
          break;

        case 'highlightLine':
          response = await this.handleHighlightLine(message.data, sender.tab?.id);
          break;

        case 'syncState':
          response = await this.handleSyncState(message.data);
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

    // Return true to indicate async response
    return true;
  }

  handleConnection(port) {
    console.log('🔗 Connection established:', port.name);

    port.onMessage.addListener((message) => {
      this.handleMessage(message, { tab: { id: port.sender?.tab?.id } }, (response) => {
        port.postMessage({ ...response, _id: message._id });
      });
    });

    port.onDisconnect.addListener(() => {
      console.log('🔌 Connection closed:', port.name);
    });
  }

  async handleStartReading(data, tabId) {
    try {
      if (!tabId) {
        throw new Error('No active tab found');
      }

      // Step 1: Extract content from the page
      console.log('Step 1: Extracting content...');
      const content = await this.extractContentFromTab(tabId);

      if (!content || !content.success) {
        throw new Error('Failed to extract content: ' + (content?.error || 'Unknown error'));
      }

      // Step 2: Update state with new content
      console.log('Step 2: Updating state...');
      await this.stateManager.updateState({
        status: 'playing',
        chapterUrl: content.metadata.chapterUrl,
        chapterTitle: content.metadata.chapterTitle,
        content: content.lines,
        currentLine: data?.startLine || 0,
        totalLines: content.lines.length,
        settings: data?.settings || {}
      });

      // Step 3: Start reading from current line
      console.log('Step 3: Starting TTS...');
      await this.startReadingFromCurrentLine();

      return { success: true, contentLength: content.lines.length };

    } catch (error) {
      console.error('Start reading error:', error);
      return { success: false, error: error.message };
    }
  }

  async extractContentFromTab(tabId) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'extractContent' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async startReadingFromCurrentLine() {
    const state = await this.stateManager.getState();

    if (!state.content || state.currentLine >= state.content.length) {
      console.warn('No content to read or already at end');
      return;
    }

    // Get current line
    const currentLine = state.content[state.currentLine];

    // Highlight the line in content script
    await this.highlightCurrentLine();

    // Start TTS
    await this.ttsService.speak(currentLine, {
      rate: state.settings?.rate || 1.0,
      pitch: state.settings?.pitch || 1.0,
      volume: state.settings?.volume || 1.0,
      voice: state.settings?.voice,
      onStart: () => {
        console.log('🎤 Started reading line', state.currentLine);
      },
      onEnd: () => {
        this.handleLineFinished();
      },
      onError: (error) => {
        console.error('TTS error:', error);
        this.stateManager.updateState({ status: 'error' });
      }
    });
  }

  async highlightCurrentLine() {
    const state = await this.stateManager.getState();
    const tabId = await this.getActiveTabId();

    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'highlightLine',
        data: { lineIndex: state.currentLine }
      });
    }
  }

  async handleLineFinished() {
    const state = await this.stateManager.getState();

    // Move to next line
    const nextLine = state.currentLine + 1;

    if (nextLine < state.totalLines) {
      // Update state
      await this.stateManager.updateState({
        currentLine: nextLine,
        status: 'playing'
      });

      // Read next line
      await this.startReadingFromCurrentLine();
    } else {
      // Finished reading
      await this.stateManager.updateState({
        status: 'finished',
        currentLine: 0
      });

      console.log('✅ Finished reading chapter');
    }
  }

  async handlePauseReading() {
    try {
      const paused = this.ttsService.pause();

      if (paused) {
        await this.stateManager.updateState({ status: 'paused' });
        return { success: true, status: 'paused' };
      } else {
        return { success: false, error: 'Cannot pause' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleResumeReading() {
    try {
      const resumed = this.ttsService.resume();

      if (resumed) {
        await this.stateManager.updateState({ status: 'playing' });
        return { success: true, status: 'playing' };
      } else {
        return { success: false, error: 'Cannot resume' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleStopReading() {
    try {
      const stopped = this.ttsService.stop();

      if (stopped) {
        await this.stateManager.updateState({
          status: 'stopped',
          currentLine: 0
        });
        return { success: true, status: 'stopped' };
      } else {
        return { success: false, error: 'Cannot stop' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleNextLine() {
    try {
      const state = await this.stateManager.getState();
      const nextLine = Math.min(state.currentLine + 1, state.totalLines - 1);

      if (nextLine !== state.currentLine) {
        // Stop current speech
        this.ttsService.stop();

        // Update state
        await this.stateManager.updateState({
          currentLine: nextLine,
          status: 'playing'
        });

        // Start reading new line
        await this.startReadingFromCurrentLine();

        return { success: true, currentLine: nextLine };
      } else {
        return { success: false, error: 'Already at last line' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handlePrevLine() {
    try {
      const state = await this.stateManager.getState();
      const prevLine = Math.max(state.currentLine - 1, 0);

      if (prevLine !== state.currentLine) {
        // Stop current speech
        this.ttsService.stop();

        // Update state
        await this.stateManager.updateState({
          currentLine: prevLine,
          status: 'playing'
        });

        // Start reading new line
        await this.startReadingFromCurrentLine();

        return { success: true, currentLine: prevLine };
      } else {
        return { success: false, error: 'Already at first line' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleUpdateSettings(settings) {
    try {
      await this.stateManager.updateState({ settings });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleGetState() {
    try {
      const state = await this.stateManager.getState();
      return { success: true, state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleExtractContent(tabId) {
    try {
      const content = await this.extractContentFromTab(tabId);
      return content;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleHighlightLine(data, tabId) {
    if (!tabId) return { success: false, error: 'No tab ID' };

    try {
      chrome.tabs.sendMessage(tabId, {
        type: 'highlightLine',
        data
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleSyncState(data) {
    try {
      await this.stateManager.updateState(data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getActiveTabId() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]?.id || null);
      });
    });
  }
}

export default EventHandler;
