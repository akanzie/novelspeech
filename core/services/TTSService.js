/**
 * Text-to-Speech Service
 * Hỗ trợ Edge TTS và Web Speech API
 */

class TTSService {
  constructor() {
    this.speechSynthesis = window.speechSynthesis;
    this.currentUtterance = null;
    this.isSpeaking = false;
    this.isPaused = false;
    this.voices = [];
    this.currentVoice = null;

    // Edge TTS configuration
    this.edgeTTSEnabled = false;
    this.edgeVoices = [
      { name: 'vi-VN-HoaiMyNeural', displayName: 'Hoài My - Nữ miền Nam' },
      { name: 'vi-VN-NamMinhNeural', displayName: 'Minh Nam - Nam miền Bắc' },
      { name: 'vi-VN-ThanhNamNeural', displayName: 'Thanh Nam - Nam miền Nam' },
      { name: 'vi-VN-HongMyNeural', displayName: 'Hồng My - Nữ miền Bắc' }
    ];

    this.init();
  }

  async init() {
    try {
      // Load voices for Web Speech API
      this.loadVoices();

      // Check for Edge TTS support
      this.checkEdgeTTSSupport();

      console.log('✅ TTS Service initialized');
    } catch (error) {
      console.error('❌ TTS Service init error:', error);
    }
  }

  loadVoices() {
    // Get available voices
    this.voices = this.speechSynthesis.getVoices();

    // If voices not loaded yet, wait for them
    if (this.voices.length === 0) {
      this.speechSynthesis.onvoiceschanged = () => {
        this.voices = this.speechSynthesis.getVoices();
        this.setDefaultVoice();
      };
    } else {
      this.setDefaultVoice();
    }
  }

  setDefaultVoice() {
    // Try to find Vietnamese voice
    const vietnameseVoice = this.voices.find(voice =>
      voice.lang === 'vi-VN' || voice.lang.startsWith('vi')
    );

    this.currentVoice = vietnameseVoice || this.voices[0] || null;
  }

  async checkEdgeTTSSupport() {
    try {
      // Test Edge TTS API
      const testUrl = 'https://edge.microsoft.com/tts/synthesize';
      const response = await fetch(testUrl, { method: 'HEAD' });
      this.edgeTTSEnabled = response.ok;
      console.log(`Edge TTS available: ${this.edgeTTSEnabled}`);
    } catch (error) {
      this.edgeTTSEnabled = false;
      console.log('Edge TTS not available, using Web Speech API');
    }
  }

  async speak(text, options = {}) {
    if (!text || text.trim().length === 0) {
      return Promise.reject(new Error('Text is empty'));
    }

    // Stop any current speech
    this.stop();

    const settings = {
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

    return new Promise((resolve, reject) => {
      try {
        // Use Edge TTS if available and preferred
        if (this.edgeTTSEnabled && options.useEdgeTTS !== false) {
          this.speakWithEdgeTTS(text, settings)
            .then(resolve)
            .catch(error => {
              console.warn('Edge TTS failed, falling back to Web Speech:', error);
              this.speakWithWebSpeech(text, settings)
                .then(resolve)
                .catch(reject);
            });
        } else {
          this.speakWithWebSpeech(text, settings)
            .then(resolve)
            .catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async speakWithWebSpeech(text, settings) {
    return new Promise((resolve, reject) => {
      try {
        this.currentUtterance = new SpeechSynthesisUtterance(text);

        // Configure utterance
        this.currentUtterance.rate = settings.rate;
        this.currentUtterance.pitch = settings.pitch;
        this.currentUtterance.volume = settings.volume;
        this.currentUtterance.voice = settings.voice || this.currentVoice;

        // Event handlers
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

        // Start speaking
        this.speechSynthesis.speak(this.currentUtterance);

      } catch (error) {
        reject(error);
      }
    });
  }

  async speakWithEdgeTTS(text, settings) {
    // Note: Edge TTS requires proper setup with proxy/API
    // This is a placeholder implementation
    return new Promise((resolve, reject) => {
      try {
        // Simulate Edge TTS for now
        console.log('Edge TTS would speak:', text.substring(0, 50) + '...');

        // For now, fall back to Web Speech
        this.speakWithWebSpeech(text, settings)
          .then(resolve)
          .catch(reject);

      } catch (error) {
        reject(error);
      }
    });
  }

  pause() {
    if (this.isSpeaking && !this.isPaused) {
      this.speechSynthesis.pause();
      this.isPaused = true;
      return true;
    }
    return false;
  }

  resume() {
    if (this.isSpeaking && this.isPaused) {
      this.speechSynthesis.resume();
      this.isPaused = false;
      return true;
    }
    return false;
  }

  stop() {
    if (this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.isPaused = false;
      this.currentUtterance = null;
      return true;
    }
    return false;
  }

  getVoices() {
    return {
      webSpeech: this.voices.map(v => ({
        name: v.name,
        lang: v.lang,
        localService: v.localService,
        default: v.default
      })),
      edgeTTS: this.edgeVoices
    };
  }

  setVoice(voiceName) {
    if (voiceName.includes('Edge')) {
      // Edge TTS voice
      this.currentVoice = voiceName;
    } else {
      // Web Speech voice
      const voice = this.voices.find(v => v.name === voiceName);
      if (voice) {
        this.currentVoice = voice;
      }
    }
  }

  getStatus() {
    return {
      isSpeaking: this.isSpeaking,
      isPaused: this.isPaused,
      currentVoice: this.currentVoice?.name || 'default',
      edgeTTSEnabled: this.edgeTTSEnabled,
      availableVoices: this.voices.length
    };
  }
}

export default TTSService;
