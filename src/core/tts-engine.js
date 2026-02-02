/**
 * TTS Engine Module
 * Hỗ trợ nhiều TTS providers: Web Speech API, Microsoft Edge TTS
 */

class TTSEngine {
    constructor() {
        this.provider = 'web-speech'; // mặc định
        this.isReading = false;
        this.currentUtterance = null;
        this.currentText = '';

        // Trạng thái
        this.state = {
            speed: 1,
            pitch: 1,
            volume: 1,
            voice: null
        };

        // Kiểm tra provider có sẵn
        this.detectProviders();
    }

    // Phát hiện TTS provider khả dụng
    detectProviders() {
        logger.log('🔍 Phát hiện TTS providers...');

        // Web Speech API (mặc định)
        if ('speechSynthesis' in window) {
            logger.success('✓ Web Speech API khả dụng');
            this.availableProviders = ['web-speech'];
        } else {
            logger.warn('⚠️ Web Speech API không khả dụng');
            this.availableProviders = [];
        }

        // Kiểm tra Microsoft Edge TTS (qua API)
        // Note: Cần internet để dùng Edge TTS
        this.checkEdgeTTSAvailable();
    }

    // Kiểm tra Edge TTS
    async checkEdgeTTSAvailable() {
        try {
            // Edge TTS thường chỉ có trên Edge browser
            const isEdge = /Edg/.test(navigator.userAgent);
            const hasEdgeAPI = window.speechSynthesis && 
                              window.speechSynthesis.toString().includes('Microsoft');

            if (isEdge && hasEdgeAPI) {
                this.availableProviders.push('edge-tts');
                logger.success('✓ Microsoft Edge TTS khả dụng');
                this.provider = 'edge-tts'; // ưu tiên Edge nếu có
            }
        } catch (err) {
            logger.warn('⚠️ Kiểm tra Edge TTS lỗi: ' + err.message);
        }
    }

    // Lấy danh sách giọng nói
    getVoices() {
        logger.log(`🎤 Lấy danh sách giọng nói từ ${this.provider}`);

        if (this.provider === 'edge-tts' || this.provider === 'web-speech') {
            const voices = window.speechSynthesis.getVoices();
            logger.log(`   Tổng giọng nói: ${voices.length}`);

            // Tìm giọng Việt
            let vietnameseVoices = voices.filter(v => 
                v.lang.includes('vi') || 
                v.lang.includes('vi-VN') ||
                v.name.toLowerCase().includes('vietnamese')
            );

            if (vietnameseVoices.length > 0) {
                logger.success(`   ✓ Tìm thấy ${vietnameseVoices.length} giọng Việt`);
                vietnameseVoices.forEach((v, i) => {
                    logger.log(`      [${i}] ${v.name} (${v.lang}) ${v.default ? '[DEFAULT]' : ''}`);
                });
            } else {
                logger.warn('   ⚠️ Không có giọng Việt, danh sách tất cả:');
                voices.forEach((v, i) => {
                    if (i < 10) logger.log(`      [${i}] ${v.name} (${v.lang})`);
                });
                if (voices.length > 10) logger.log(`      ... và ${voices.length - 10} giọng khác`);
            }

            return voices;
        }

        return [];
    }

    // Chọn giọng nói
    selectVoice(voiceIndex) {
        logger.log(`🎤 Chọn giọng: index ${voiceIndex}`);
        const voices = this.getVoices();

        if (voiceIndex === 'default' || voiceIndex === null) {
            this.state.voice = null;
            logger.log('   Sẽ dùng giọng mặc định');
        } else if (voices[voiceIndex]) {
            this.state.voice = voiceIndex;
            logger.success(`   ✓ Chọn: ${voices[voiceIndex].name}`);
        } else {
            logger.error(`   ❌ Chỉ số giọng không hợp lệ: ${voiceIndex}`);
        }
    }

    // Đặt thông số
    setSpeed(speed) {
        this.state.speed = Math.max(0.5, Math.min(2, speed));
        logger.log(`⚡ Tốc độ: ${this.state.speed.toFixed(1)}x`);
    }

    setPitch(pitch) {
        this.state.pitch = Math.max(0.5, Math.min(2, pitch));
        logger.log(`🎵 Cao độ: ${this.state.pitch.toFixed(1)}`);
    }

    setVolume(volume) {
        this.state.volume = Math.max(0, Math.min(1, volume));
        logger.log(`🔊 Âm lượng: ${(this.state.volume * 100).toFixed(0)}%`);
    }

    // Dừng đọc hiện tại
    stop() {
        if (this.provider === 'web-speech' || this.provider === 'edge-tts') {
            window.speechSynthesis.cancel();
        }
        this.isReading = false;
        logger.log('⏹️ Đã dừng');
    }

    // Nói (TTS)
    async speak(text, options = {}) {
        if (!text || !text.trim()) {
            logger.error('❌ Nội dung trống');
            return false;
        }

        this.currentText = text;

        if (this.provider === 'web-speech' || this.provider === 'edge-tts') {
            return await this._speakWebSpeech(text, options);
        }

        logger.error(`❌ Provider không được hỗ trợ: ${this.provider}`);
        return false;
    }

    // Web Speech API TTS
    async _speakWebSpeech(text, options = {}) {
        try {
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);

            // Cấu hình
            utterance.rate = this.state.speed;
            utterance.pitch = this.state.pitch;
            utterance.volume = this.state.volume;
            utterance.lang = 'vi-VN';

            // Chọn giọng
            const voices = window.speechSynthesis.getVoices();
            if (this.state.voice !== null && voices[this.state.voice]) {
                utterance.voice = voices[this.state.voice];
                logger.log(`🎤 Dùng giọng: ${voices[this.state.voice].name}`);
            } else {
                // Tìm giọng Việt mặc định
                let vietnameseVoice = voices.find(v =>
                    v.lang.includes('vi-VN') ||
                    v.lang.includes('vi')
                );
                if (vietnameseVoice) {
                    utterance.voice = vietnameseVoice;
                    logger.log(`🎤 Dùng giọng Việt: ${vietnameseVoice.name}`);
                } else {
                    logger.warn('⚠️ Không có giọng Việt');
                }
            }

            // Events
            utterance.onstart = () => {
                this.isReading = true;
                logger.log('🎙️ Bắt đầu đọc');

                // Highlight container đang đọc
                if (window.highlightManager && window.contentExtractor) {
                    const container = document.querySelector('#chapter-content, .chapter-content, .break-words');
                    if (container) {
                        window.highlightManager.highlight(container);
                    }
                }

                if (options.onStart) options.onStart();
            };

            utterance.onend = () => {
                this.isReading = false;
                logger.success('✓ Hoàn thành đọc');

                // Xóa highlight
                if (window.highlightManager) {
                    window.highlightManager.clear();
                }

                if (options.onEnd) options.onEnd();
            };

            utterance.onerror = (event) => {
                this.isReading = false;
                logger.error(`❌ Lỗi: ${event.error}`);

                // Xóa highlight khi lỗi
                if (window.highlightManager) {
                    window.highlightManager.clear();
                }

                if (options.onError) options.onError(event.error);
            };

            utterance.onboundary = (event) => {
                if (options.onBoundary) options.onBoundary(event);
            };

            this.currentUtterance = utterance;
            window.speechSynthesis.speak(utterance);
            logger.success('✓ Bắt đầu nói');
            return true;

        } catch (error) {
            logger.error(`❌ Lỗi TTS: ${error.message}`);
            return false;
        }
    }

    // Kiểm tra đang đọc
    isPlaying() {
        return this.isReading;
    }

    // Lấy thông tin provider
    getProviderInfo() {
        return {
            current: this.provider,
            available: this.availableProviders,
            isEdgeAvailable: this.availableProviders.includes('edge-tts'),
            isWebSpeechAvailable: this.availableProviders.includes('web-speech')
        };
    }
}

// Tạo instance toàn cục
const ttsEngine = new TTSEngine();
window.ttsEngine = ttsEngine;

logger.log('✅ TTS Engine khởi tạo xong');
