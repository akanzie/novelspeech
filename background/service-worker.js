/**
 * Main Service Worker - Điểm khởi đầu của background process
 */

// Import services
import StateManager from './StateManager.js';
import EventHandler from './EventHandler.js';
import TTSService from '../core/services/TTSService.js';
import Logger from '../core/services/Logger.js';

class BackgroundService {
  constructor() {
    this.stateManager = null;
    this.eventHandler = null;
    this.ttsService = null;
    this.logger = null;

    this.init();
  }

  async init() {
    try {
      console.log('🚀 Initializing Background Service...');

      // Initialize services
      this.logger = new Logger();
      this.stateManager = new StateManager();
      this.ttsService = new TTSService();
      this.eventHandler = new EventHandler();

      // Link services
      this.eventHandler.setStateManager(this.stateManager);
      this.eventHandler.setTTSService(this.ttsService);

      // Setup state change listeners
      this.setupStateListeners();

      // Setup TTS event listeners
      this.setupTTSEventListeners();

      // Setup periodic tasks
      this.setupPeriodicTasks();

      console.log('✅ Background Service initialized successfully');

    } catch (error) {
      console.error('❌ Background Service initialization failed:', error);
    }
  }

  setupStateListeners() {
    // Listen for state changes to update UI
    this.stateManager.addListener(async (oldState, newState) => {
      // Broadcast state changes to all UI components
      await this.broadcastStateUpdate(newState);

      // Save reading history on significant changes
      if (newState.status === 'stopped' || newState.status === 'finished') {
        await this.stateManager.saveReadingHistory();
      }
    });
  }

  setupTTSEventListeners() {
    // Listen for TTS errors
    // Note: TTS events are handled in TTSService itself
  }

  async broadcastStateUpdate(state) {
    try {
      // Send to popup if open
      chrome.runtime.sendMessage({
        type: 'stateUpdate',
        data: state
      }).catch(() => {
        // Popup might not be open, ignore error
      });

      // Send to sidepanel if open
      chrome.runtime.sendMessage({
        type: 'stateUpdate',
        data: state
      }).catch(() => {
        // Sidepanel might not be open, ignore error
      });

    } catch (error) {
      console.error('Error broadcasting state update:', error);
    }
  }

  setupPeriodicTasks() {
    // Auto-save state every minute
    setInterval(() => {
      this.stateManager.saveToStorage();
    }, 60000);

    // Clean up old cache periodically
    setInterval(async () => {
      await this.cleanupOldCache();
    }, 3600000); // Every hour
  }

  async cleanupOldCache() {
    try {
      const result = await chrome.storage.local.get(['ocrCache']);
      if (result.ocrCache) {
        const now = Date.now();
        const cache = result.ocrCache.filter(entry => {
          // Keep entries from last 24 hours
          return (now - entry.timestamp) < (24 * 60 * 60 * 1000);
        });

        await chrome.storage.local.set({ ocrCache: cache });
        console.log('Cleaned up old OCR cache');
      }
    } catch (error) {
      console.error('Error cleaning cache:', error);
    }
  }

  // Handle extension installation/update
  handleInstall() {
    chrome.runtime.onInstalled.addListener((details) => {
      console.log('Extension installed/updated:', details.reason);

      if (details.reason === 'install') {
        // First install - setup default settings
        this.setupDefaultSettings();
      } else if (details.reason === 'update') {
        // Extension updated - migrate settings if needed
        this.migrateSettings();
      }
    });
  }

  async setupDefaultSettings() {
    const defaultSettings = {
      userSettings: {
        general: {
          autoStart: false,
          autoNextChapter: false,
          saveHistory: true,
          pageLoadTimeout: 10
        },
        tts: {
          engine: 'edge',
          defaultVoice: 'vi-VN-HoaiMyNeural',
          defaultSpeed: 1.0,
          defaultPitch: 1.0,
          volume: 100
        },
        appearance: {
          theme: 'auto',
          highlightColor: '#ffeb3b',
          highlightOpacity: 0.3
        },
        advanced: {
          ocrLanguage: 'vie',
          cacheOCRResults: true,
          enableDebug: false
        }
      }
    };

    await chrome.storage.local.set(defaultSettings);
    console.log('Default settings saved');
  }

  async migrateSettings() {
    // Migration logic for updates
    console.log('Migrating settings...');
    // Add migration logic here if needed
  }
}

// Initialize background service
const backgroundService = new BackgroundService();

// Handle extension lifecycle
backgroundService.handleInstall();

// Export for testing/debugging
if (typeof window !== 'undefined') {
  window.backgroundService = backgroundService;
}

export default backgroundService;
