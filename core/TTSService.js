/**
 * Text-to-Speech Service (provider-based)
 */

import '../utils/LogService.js';
import WebSpeechProvider from './tts/WebSpeechProvider.js';
import ChromeTTSProvider from './tts/ChromeTTSProvider.js';
import EdgeTTSProvider from './tts/EdgeTTSProvider.js';

class TTSService {
  constructor() {
    this.logger = null;

    const providerLog = (name) => (message, level = 'INFO', data = {}) => {
      this.log(`[${name}] ${message}`, level, data);
    };

    this.webProvider = new WebSpeechProvider({ log: providerLog('WebSpeech') });
    this.chromeProvider = new ChromeTTSProvider({ log: providerLog('ChromeTTS') });
    this.edgeProvider = new EdgeTTSProvider({
      log: providerLog('EdgeTTS'),
      fallback: this.webProvider
    });

    this.activeProvider = null;
    this.currentVoice = null;
    this.isSpeaking = false;
    this.isPaused = false;

    this.init();
  }

  setLogger(logger) {
    this.logger = logger;
  }

  log(message, level = 'info', data = {}) {
    const normalized = String(level).toUpperCase();
    const meta = { module: 'TTSService', ...(data || {}) };

    if (this.logger) {
      switch (normalized) {
        case 'ERROR':
          this.logger.error(message, meta);
          return;
        case 'WARN':
        case 'WARNING':
          this.logger.warn(message, meta);
          return;
        case 'DEBUG':
          this.logger.debug(message, meta);
          return;
        default:
          this.logger.log(message, meta);
          return;
      }
    }

    if (globalThis.LogService?.log) {
      globalThis.LogService.log('TTSService', message, normalized, data || {});
      return;
    }

    if (normalized === 'ERROR') {
      console.error(message, data);
    } else if (normalized === 'WARN') {
      console.warn(message, data);
    } else {
      console.log(message, data);
    }
  }

  async init() {
    try {
      await Promise.all([
        this.webProvider.init(),
        this.chromeProvider.init(),
        this.edgeProvider.init()
      ]);

      await this.syncDefaultVoice();
      this.log('TTS Service da khoi tao', 'info');
    } catch (error) {
      this.log('Loi khoi tao TTS Service', 'error', { error });
    }
  }

  async syncDefaultVoice() {
    if (this.currentVoice) return;
    const pickVietnamese = (voices, nameKey = 'name') => {
      if (!Array.isArray(voices) || voices.length === 0) return null;
      const vi = voices.find(v => (v.lang || '').toLowerCase().startsWith('vi'));
      return (vi && vi[nameKey]) ? vi[nameKey] : (voices[0][nameKey] || null);
    };

    const edgeVoices = await this.edgeProvider.getVoices();
    if (this.edgeProvider.isAvailable() && edgeVoices.length > 0) {
      this.currentVoice = pickVietnamese(edgeVoices, 'name');
      return;
    }

    const webVoices = this.webProvider.getVoices();
    const chromeVoices = this.chromeProvider.getVoices();
    this.currentVoice =
      pickVietnamese(webVoices, 'name') ||
      pickVietnamese(chromeVoices, 'voiceName') ||
      null;
  }

  resolveProviders(options = {}) {
    const edgeAvailable = this.edgeProvider.isAvailable();
    const webAvailable = this.webProvider.isAvailable();
    const chromeAvailable = this.chromeProvider.isAvailable();
    const preferEdge = options.useEdgeTTS !== false && edgeAvailable;
    const preferChrome = options.useChromeTTS === true || (!webAvailable && chromeAvailable);

    const order = [];
    if (preferEdge) order.push(this.edgeProvider);
    if (preferChrome && chromeAvailable) order.push(this.chromeProvider);
    if (webAvailable) order.push(this.webProvider);
    if (!preferChrome && chromeAvailable) order.push(this.chromeProvider);

    return order;
  }

  async speak(text, options = {}) {
    if (!text || text.trim().length === 0) {
      return Promise.reject(new Error('Text is empty'));
    }

    this.stop();

    const baseSettings = {
      rate: options.rate || 1.0,
      pitch: options.pitch || 1.0,
      volume: options.volume || 1.0,
      voice: options.voice || this.currentVoice,
      onStart: options.onStart || (() => { }),
      onEnd: options.onEnd || (() => { }),
      onError: options.onError || (() => { }),
      onPause: options.onPause || (() => { }),
      onResume: options.onResume || (() => { })
    };

    const providers = this.resolveProviders(options);
    if (providers.length === 0) {
      return Promise.reject(new Error('No TTS provider available'));
    }

    let lastError = null;

    for (const provider of providers) {
      const providerSettings = {
        ...baseSettings,
        onStart: () => {
          this.isSpeaking = true;
          this.isPaused = false;
          baseSettings.onStart();
        },
        onEnd: () => {
          this.isSpeaking = false;
          this.isPaused = false;
          if (this.activeProvider === provider) {
            this.activeProvider = null;
          }
          baseSettings.onEnd();
        },
        onError: (err) => {
          this.isSpeaking = false;
          this.isPaused = false;
          if (this.activeProvider === provider) {
            this.activeProvider = null;
          }
          baseSettings.onError(err);
        },
        onPause: () => {
          this.isPaused = true;
          baseSettings.onPause();
        },
        onResume: () => {
          this.isPaused = false;
          baseSettings.onResume();
        }
      };

      try {
        this.activeProvider = provider;
        const providerName = provider?.constructor?.name || 'Provider';
        const selectedVoice = typeof providerSettings.voice === 'string'
          ? providerSettings.voice
          : (providerSettings.voice?.name || providerSettings.voice?.voiceName || this.currentVoice || 'default');
        this.log(`TTS use provider: ${providerName}`, 'info', {
          engine: options.engine || options?.settings?.engine,
          voice: selectedVoice
        });
        await provider.speak(text, providerSettings);
        return;
      } catch (error) {
        lastError = error;
        const providerName = provider?.constructor?.name || 'Provider';
        this.log(`Provider ${providerName} failed, try next`, 'warn', { error });
      }
    }

    this.activeProvider = null;
    return Promise.reject(lastError || new Error('TTS failed'));
  }

  pause() {
    if (this.activeProvider?.pause) {
      const result = this.activeProvider.pause();
      if (result) this.isPaused = true;
      return result;
    }
    return false;
  }

  resume() {
    if (this.activeProvider?.resume) {
      const result = this.activeProvider.resume();
      if (result) this.isPaused = false;
      return result;
    }
    return false;
  }

  stop() {
    if (this.activeProvider?.stop) {
      const result = this.activeProvider.stop();
      this.isSpeaking = false;
      this.isPaused = false;
      this.activeProvider = null;
      return result;
    }

    let stopped = false;
    if (this.webProvider?.stop) stopped = this.webProvider.stop() || stopped;
    if (this.chromeProvider?.stop) stopped = this.chromeProvider.stop() || stopped;
    if (this.edgeProvider?.stop) stopped = this.edgeProvider.stop() || stopped;
    this.isSpeaking = false;
    this.isPaused = false;
    return stopped;
  }

  async getVoices() {
    return {
      webSpeech: this.webProvider.getVoices(),
      edgeTTS: await this.edgeProvider.getVoices(),
      chromeTTS: this.chromeProvider.getVoices()
    };
  }

  setVoice(voiceName) {
    if (!voiceName) return;
    const setWeb = this.webProvider.setVoice(voiceName);
    const setChrome = this.chromeProvider.setVoice(voiceName);
    const setEdge = this.edgeProvider.setVoice(voiceName);
    if (setWeb || setChrome || setEdge) {
      this.currentVoice = voiceName;
    }
  }

  getStatus() {
    return {
      isSpeaking: this.isSpeaking,
      isPaused: this.isPaused,
      currentVoice: this.currentVoice || 'default',
      edgeTTSEnabled: this.edgeProvider.isAvailable(),
      availableVoices: this.webProvider.getVoices().length,
      chromeTTSEnabled: this.chromeProvider.isAvailable()
    };
  }
}

export default TTSService;
