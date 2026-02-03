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
    this.speechSynthesis = (typeof window !== 'undefined' && window.speechSynthesis)
      ? window.speechSynthesis
      : null;
  }

  async init() {
    this.loadVoices();
    await this.checkSupport();
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
      this.available = isEdge && !!this.speechSynthesis;
      this._log(`Edge TTS san sang (Edge browser: ${isEdge})`, 'INFO');
    } catch (error) {
      this.available = false;
      this._log('Edge TTS khong kha dung', 'WARN', { error });
    }

    return this.available;
  }

  loadVoices() {
    if (!this.speechSynthesis) return;
    const all = this.speechSynthesis.getVoices();
    if (all.length === 0) {
      this.speechSynthesis.onvoiceschanged = () => {
        this.edgeVoices = this.filterEdgeVoices(this.speechSynthesis.getVoices());
        this.setDefaultVoice();
      };
      return;
    }
    this.edgeVoices = this.filterEdgeVoices(all);
    this.setDefaultVoice();
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

  getVoices() {
    if (this.edgeVoices.length === 0) {
      this.loadVoices();
    }
    return this.edgeVoices.map(v => ({
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      default: v.default,
      displayName: v.name
    }));
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

    if (!this.speechSynthesis) {
      return Promise.reject(new Error('Edge Web Speech is not available'));
    }

    return new Promise((resolve, reject) => {
      try {
        this.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);

        const resolvedVoice = typeof settings.voice === 'string'
          ? this.edgeVoices.find(v => v.name === settings.voice)
          : settings.voice;

        utterance.rate = settings.rate;
        utterance.pitch = settings.pitch;
        utterance.volume = settings.volume;
        utterance.voice = resolvedVoice || this.currentVoice;

        utterance.onstart = () => {
          this.isSpeaking = true;
          this.isPaused = false;
          settings.onStart();
        };

        utterance.onend = () => {
          this.isSpeaking = false;
          settings.onEnd();
          resolve();
        };

        utterance.onerror = (event) => {
          this.isSpeaking = false;
          settings.onError(event);
          reject(new Error(`Edge speech error: ${event.error}`));
        };

        utterance.onpause = () => {
          this.isPaused = true;
          settings.onPause();
        };

        utterance.onresume = () => {
          this.isPaused = false;
          settings.onResume();
        };

        this.speechSynthesis.speak(utterance);
      } catch (error) {
        reject(error);
      }
    });
  }

  pause() {
    if (this.speechSynthesis && this.isSpeaking && !this.isPaused) {
      this.speechSynthesis.pause();
      this.isPaused = true;
      return true;
    }
    if (this.fallback?.pause) {
      this.isPaused = true;
      return this.fallback.pause();
    }
    return false;
  }

  resume() {
    if (this.speechSynthesis && this.isSpeaking && this.isPaused) {
      this.speechSynthesis.resume();
      this.isPaused = false;
      return true;
    }
    if (this.fallback?.resume) {
      this.isPaused = false;
      return this.fallback.resume();
    }
    return false;
  }

  stop() {
    if (this.speechSynthesis && this.isSpeaking) {
      this.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.isPaused = false;
      return true;
    }
    if (this.fallback?.stop) {
      this.isSpeaking = false;
      this.isPaused = false;
      return this.fallback.stop();
    }
    return false;
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
}

export default EdgeTTSProvider;
