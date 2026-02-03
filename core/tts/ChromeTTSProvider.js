import '../../utils/LogService.js';

class ChromeTTSProvider {
  constructor(options = {}) {
    this.log = typeof options.log === 'function' ? options.log : null;
    this.available = typeof chrome !== 'undefined' && !!chrome.tts;
    this.chromeVoices = [];
    this.currentVoice = null;
    this.isSpeaking = false;
    this.isPaused = false;
  }

  async init() {
    if (!this.available) return false;
    this.loadVoices();
    return true;
  }

  isAvailable() {
    return this.available;
  }

  loadVoices() {
    if (!this.available) return;
    chrome.tts.getVoices((voices) => {
      this.chromeVoices = Array.isArray(voices) ? voices : [];
      if (!this.currentVoice && this.chromeVoices.length > 0) {
        const vietnamese = this.chromeVoices.find(v =>
          v.lang === 'vi-VN' || (v.lang && v.lang.startsWith('vi'))
        );
        this.currentVoice = vietnamese ? vietnamese.voiceName : this.chromeVoices[0].voiceName;
      }
    });
  }

  getVoices() {
    return this.chromeVoices.map(v => ({
      voiceName: v.voiceName,
      lang: v.lang,
      gender: v.gender,
      remote: v.remote
    }));
  }

  setVoice(voiceName) {
    if (!voiceName) return false;
    const voice = this.chromeVoices.find(v => v.voiceName === voiceName);
    if (voice) {
      this.currentVoice = voice.voiceName;
      return true;
    }
    return false;
  }

  async speak(text, settings) {
    if (!this.available) {
      return Promise.reject(new Error('Chrome TTS API is not available'));
    }

    return new Promise((resolve, reject) => {
      try {
        this.isSpeaking = true;
        this.isPaused = false;

        const voiceName = typeof settings.voice === 'string'
          ? settings.voice
          : settings.voice?.name || settings.voice?.voiceName || this.currentVoice;

        chrome.tts.speak(text, {
          rate: settings.rate,
          pitch: settings.pitch,
          volume: settings.volume,
          voiceName,
          onEvent: (event) => {
            if (event.type === 'start') {
              settings.onStart();
            }
            if (event.type === 'end') {
              this.isSpeaking = false;
              settings.onEnd();
              resolve();
            }
            if (event.type === 'error') {
              this.isSpeaking = false;
              settings.onError(event);
              reject(new Error(`Chrome TTS error: ${event.errorMessage || event.type}`));
            }
            if (event.type === 'pause') {
              this.isPaused = true;
              settings.onPause();
            }
            if (event.type === 'resume') {
              this.isPaused = false;
              settings.onResume();
            }
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  pause() {
    if (this.available && this.isSpeaking && !this.isPaused) {
      chrome.tts.pause();
      this.isPaused = true;
      return true;
    }
    return false;
  }

  resume() {
    if (this.available && this.isSpeaking && this.isPaused) {
      chrome.tts.resume();
      this.isPaused = false;
      return true;
    }
    return false;
  }

  stop() {
    if (this.available && this.isSpeaking) {
      chrome.tts.stop();
      this.isSpeaking = false;
      this.isPaused = false;
      return true;
    }
    return false;
  }

  getStatus() {
    return {
      isSpeaking: this.isSpeaking,
      isPaused: this.isPaused,
      currentVoice: this.currentVoice || 'default'
    };
  }
}

export default ChromeTTSProvider;
