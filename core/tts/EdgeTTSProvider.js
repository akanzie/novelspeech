import '../../utils/LogService.js';

class EdgeTTSProvider {
  constructor(options = {}) {
    this.log = typeof options.log === 'function' ? options.log : null;
    this.fallback = options.fallback || null;
    this.available = false;
    this.supportChecked = false;
    this.isSpeaking = false;
    this.isPaused = false;
    this.currentVoice = null;
    this.edgeVoices = [];
    this.offscreenReady = false;
    this.offscreenUrl = 'ui/offscreen/tts.html';
  }

  async init() {
    await this.checkSupport();
    if (this.available) {
      await this.loadVoices();
    }
    return this.available;
  }

  isAvailable() {
    return this.available;
  }

  async checkSupport() {
    if (this.supportChecked) return this.available;
    this.supportChecked = true;

    try {
      const ua = globalThis?.navigator?.userAgent || '';
      const isEdge = ua.includes('Edg/');
      const canOffscreen = !!globalThis?.chrome?.offscreen?.createDocument;
      this.available = isEdge && canOffscreen;
      this._log(`Edge TTS san sang (Edge browser: ${isEdge})`, 'INFO');
    } catch (error) {
      this.available = false;
      this._log('Edge TTS khong kha dung', 'WARN', { error });
    }

    return this.available;
  }

  loadVoices() {
    if (!this.available) return;
    this.getVoices();
  }

  registerVoicesChanged(handler) {
    // handled in offscreen
    void handler;
  }

  filterEdgeVoices(voices = []) {
    const ua = globalThis?.navigator?.userAgent || '';
    const isEdge = ua.includes('Edg/');
    if (!isEdge) return [];
    return voices.filter(v => {
      const name = (v.name || '').toLowerCase();
      const uri = (v.voiceURI || '').toLowerCase();
      return name.includes('microsoft') || name.includes('neural') || uri.includes('microsoft');
    });
  }

  setDefaultVoice() {
    if (this.edgeVoices.length === 0) return;
    const vietnamese = this.edgeVoices.find(v =>
      v.lang === 'vi-VN' || (v.lang && v.lang.startsWith('vi'))
    );
    this.currentVoice = vietnamese || this.edgeVoices[0] || null;
  }

  async getVoices() {
    if (!this.available) return [];
    try {
      await this.ensureOffscreen();
      let response = null;
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await this.sendOffscreen('getVoices', { edgeOnly: true });
          break;
        } catch (error) {
          lastError = error;
          await new Promise(r => setTimeout(r, 300));
        }
      }
      if (!response) {
        throw lastError || new Error('Offscreen TTS not ready');
      }
      const voices = Array.isArray(response?.voices) ? response.voices : [];
      this.edgeVoices = voices;
      this.setDefaultVoice();
      return voices.map(v => ({
        name: v.name,
        lang: v.lang,
        localService: v.localService,
        default: v.default,
        displayName: v.name
      }));
    } catch (error) {
      this._log('Khong the lay giong doc Edge', 'WARN', { error: error?.message || String(error) });
      return [];
    }
  }

  setVoice(voiceName) {
    if (!voiceName) return false;
    const voice = this.edgeVoices.find(v => v.name === voiceName);
    if (voice) {
      this.currentVoice = voice;
      return true;
    }
    return false;
  }

  async speak(text, settings) {
    if (!this.available) {
      return Promise.reject(new Error('Edge TTS is not available'));
    }

    await this.ensureOffscreen();

    this.isSpeaking = true;
    this.isPaused = false;
    settings.onStart();

    const voiceName = typeof settings.voice === 'string'
      ? settings.voice
      : settings.voice?.name || settings.voice?.voiceName || this.currentVoice?.name;

    try {
      await this.sendOffscreen('speak', {
        text,
        rate: settings.rate,
        pitch: settings.pitch,
        volume: settings.volume,
        voiceName
      });
      this.isSpeaking = false;
      settings.onEnd();
      return;
    } catch (error) {
      this.isSpeaking = false;
      settings.onError(error);
      return Promise.reject(error);
    }
  }

  pause() {
    if (!this.available) return false;
    if (this.isSpeaking && !this.isPaused) {
      this.isPaused = true;
      this.sendOffscreen('pause');
      return true;
    }
    return this.fallback?.pause ? this.fallback.pause() : false;
  }

  resume() {
    if (!this.available) return false;
    if (this.isSpeaking && this.isPaused) {
      this.isPaused = false;
      this.sendOffscreen('resume');
      return true;
    }
    return this.fallback?.resume ? this.fallback.resume() : false;
  }

  stop() {
    if (!this.available) return false;
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.isPaused = false;
      this.sendOffscreen('stop');
      return true;
    }
    return this.fallback?.stop ? this.fallback.stop() : false;
  }

  getStatus() {
    return {
      isSpeaking: this.isSpeaking,
      isPaused: this.isPaused,
      currentVoice: this.currentVoice?.name || this.currentVoice || 'default',
      available: this.available
    };
  }

  _log(message, level = 'INFO', data = {}) {
    if (this.log) {
      this.log(message, level, data);
      return;
    }
    if (globalThis.LogService?.log) {
      globalThis.LogService.log('EdgeTTSProvider', message, level, data);
    }
  }

  async ensureOffscreen() {
    if (this.offscreenReady) return;
    const offscreen = globalThis?.chrome?.offscreen;
    if (!offscreen?.createDocument) {
      throw new Error('Offscreen API is not available');
    }
    const hasDocument = await offscreen.hasDocument();
    if (!hasDocument) {
      await offscreen.createDocument({
        url: this.offscreenUrl,
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Text to speech playback'
      });
    }
    await this.waitForOffscreenReady();
    this.offscreenReady = true;
  }

  async waitForOffscreenReady() {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.sendOffscreen('ping');
        return;
      } catch (error) {
        lastError = error;
        await new Promise(r => setTimeout(r, 200));
      }
    }
    throw lastError || new Error('Offscreen TTS not ready');
  }

  async sendOffscreen(action, payload = {}) {
    const message = { type: 'ttsOffscreen', action, payload };
    const response = await chrome.runtime.sendMessage(message);
    if (response?.success === false) {
      throw new Error(response?.error || 'Offscreen TTS failed');
    }
    return response;
  }
}

export default EdgeTTSProvider;
