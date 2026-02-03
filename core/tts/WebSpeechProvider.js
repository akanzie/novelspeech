import '../../utils/LogService.js';

class WebSpeechProvider {
  constructor(options = {}) {
    this.log = typeof options.log === 'function' ? options.log : null;
    this.speechSynthesis = (typeof window !== 'undefined' && window.speechSynthesis)
      ? window.speechSynthesis
      : null;
    this.currentUtterance = null;
    this.isSpeaking = false;
    this.isPaused = false;
    this.voices = [];
    this.currentVoice = null;
  }

  async init() {
    if (!this.speechSynthesis) return false;
    this.loadVoices();
    return true;
  }

  isAvailable() {
    return !!this.speechSynthesis;
  }

  loadVoices() {
    if (!this.speechSynthesis) return;
    this.voices = this.speechSynthesis.getVoices();
    if (this.voices.length === 0) {
      this.registerVoicesChanged(() => {
        this.voices = this.speechSynthesis.getVoices();
        this.setDefaultVoice();
      });
    } else {
      this.setDefaultVoice();
    }
  }

  registerVoicesChanged(handler) {
    if (!this.speechSynthesis) return;
    if (typeof this.speechSynthesis.addEventListener === 'function') {
      this.speechSynthesis.addEventListener('voiceschanged', handler);
      return;
    }
    const prev = this.speechSynthesis.onvoiceschanged;
    this.speechSynthesis.onvoiceschanged = () => {
      if (typeof prev === 'function') prev();
      handler();
    };
  }

  setDefaultVoice() {
    const vietnameseVoice = this.voices.find(voice =>
      voice.lang === 'vi-VN' || voice.lang.startsWith('vi')
    );
    this.currentVoice = vietnameseVoice || this.voices[0] || null;
  }

  getVoices() {
    return this.voices.map(v => ({
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      default: v.default
    }));
  }

  setVoice(voiceName) {
    if (!voiceName) return false;
    const voice = this.voices.find(v => v.name === voiceName);
    if (voice) {
      this.currentVoice = voice;
      return true;
    }
    return false;
  }

  async speak(text, settings) {
    if (!this.speechSynthesis) {
      return Promise.reject(new Error('Web Speech API is not available'));
    }

    return new Promise((resolve, reject) => {
      try {
        const currentVoices = this.voices.length > 0
          ? this.voices
          : (this.speechSynthesis.getVoices() || []);
        if (currentVoices.length > 0 && this.voices.length === 0) {
          this.voices = currentVoices;
          this.setDefaultVoice();
        }

        this.currentUtterance = new SpeechSynthesisUtterance(text);

        const resolvedVoice = typeof settings.voice === 'string'
          ? currentVoices.find(v => v.name === settings.voice)
          : settings.voice;
        const vietnameseVoice = currentVoices.find(voice =>
          voice.lang === 'vi-VN' || (voice.lang && voice.lang.startsWith('vi'))
        );

        this.currentUtterance.rate = settings.rate;
        this.currentUtterance.pitch = settings.pitch;
        this.currentUtterance.volume = settings.volume;
        this.currentUtterance.lang = 'vi-VN';
        this.currentUtterance.voice = resolvedVoice || vietnameseVoice || this.currentVoice || null;
        if (this.currentUtterance.voice) {
          this._log(`Su dung giong doc: ${this.currentUtterance.voice.name}`, 'INFO');
        } else {
          this._log('Khong tim thay giong doc phu hop, se dung giong mac dinh', 'WARN');
        }

        this.currentUtterance.onstart = () => {
          this.isSpeaking = true;
          this.isPaused = false;
          settings.onStart();
        };

        this.currentUtterance.onend = () => {
          this.isSpeaking = false;
          settings.onEnd();
          resolve();
        };

        this.currentUtterance.onerror = (event) => {
          this.isSpeaking = false;
          settings.onError(event);
          reject(new Error(`Speech synthesis error: ${event.error}`));
        };

        this.currentUtterance.onpause = () => {
          this.isPaused = true;
          settings.onPause();
        };

        this.currentUtterance.onresume = () => {
          this.isPaused = false;
          settings.onResume();
        };

        this.speechSynthesis.speak(this.currentUtterance);
      } catch (error) {
        reject(error);
      }
    });
  }

  pause() {
    if (this.isSpeaking && !this.isPaused && this.speechSynthesis) {
      this.speechSynthesis.pause();
      this.isPaused = true;
      return true;
    }
    return false;
  }

  resume() {
    if (this.isSpeaking && this.isPaused && this.speechSynthesis) {
      this.speechSynthesis.resume();
      this.isPaused = false;
      return true;
    }
    return false;
  }

  stop() {
    if (this.speechSynthesis && this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.isPaused = false;
      this.currentUtterance = null;
      return true;
    }
    return false;
  }

  getStatus() {
    return {
      isSpeaking: this.isSpeaking,
      isPaused: this.isPaused,
      currentVoice: this.currentVoice?.name || 'default'
    };
  }

  _log(message, level = 'INFO', data = {}) {
    if (this.log) {
      this.log(message, level, data);
      return;
    }
    if (globalThis.LogService?.log) {
      globalThis.LogService.log('WebSpeechProvider', message, level, data);
    }
  }
}

export default WebSpeechProvider;
