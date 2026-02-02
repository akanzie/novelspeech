/**
 * State Manager Module
 * Quản lý lưu/khôi phục trạng thái extension
 */

class StateManager {
    constructor() {
        this.state = {
            isReading: false,
            currentChapter: null,
            currentContent: '',
            currentLineIndex: 0,
            speed: 1,
            pitch: 1,
            volume: 1,
            voice: 'default',
            lastTab: null,
            lastUpdateTime: null
        };
        
        logger.log('💾 State Manager khởi tạo');
        this.loadState();
    }

    // Lưu trạng thái vào storage
    saveState() {
        try {
            const stateData = {
                ...this.state,
                lastUpdateTime: Date.now()
            };
            
            // Lưu vào chrome.storage
            chrome.storage.local.set({ 'novelSpeechState': stateData }, () => {
                if (chrome.runtime.lastError) {
                    logger.warn('⚠️ Lưu state lỗi: ' + chrome.runtime.lastError.message);
                } else {
                    logger.log('💾 Trạng thái đã lưu');
                }
            });
        } catch (error) {
            logger.error('❌ Lỗi lưu state: ' + error.message);
        }
    }

    // Tải trạng thái từ storage
    loadState() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['novelSpeechState'], (result) => {
                if (result.novelSpeechState) {
                    const savedState = result.novelSpeechState;
                    // Chỉ khôi phục các trạng thái an toàn (không khôi phục content quá lâu)
                    const oneHourAgo = Date.now() - (60 * 60 * 1000);
                    
                    if (savedState.lastUpdateTime > oneHourAgo) {
                        this.state = {
                            ...this.state,
                            ...savedState,
                            isReading: false // Không khôi phục trạng thái "đang đọc"
                        };
                        logger.success('✓ Khôi phục trạng thái');
                        logger.log(`   Chapter: ${this.state.currentChapter}`);
                        logger.log(`   Dòng: ${this.state.currentLineIndex}`);
                        logger.log(`   Tốc độ: ${this.state.speed}x`);
                    } else {
                        logger.log('📝 Trạng thái quá cũ (> 1 giờ), không khôi phục');
                    }
                } else {
                    logger.log('📝 Không có trạng thái đã lưu');
                }
                resolve(this.state);
            });
        });
    }

    // Cập nhật trạng thái
    setState(updates) {
        this.state = {
            ...this.state,
            ...updates
        };
        logger.log(`📝 Cập nhật state: ${Object.keys(updates).join(', ')}`);
        this.saveState();
    }

    // Lấy trạng thái
    getState() {
        return { ...this.state };
    }

    // Cập nhật vị trí đọc
    setCurrentPosition(content, lineIndex, chapter = null) {
        this.setState({
            currentContent: content,
            currentLineIndex: lineIndex,
            currentChapter: chapter
        });
    }

    // Cập nhật TTS settings
    setTTSSettings(speed, pitch, volume, voice) {
        this.setState({
            speed,
            pitch,
            volume,
            voice
        });
    }

    // Set đang đọc
    setReading(isReading) {
        this.setState({ isReading });
    }

    // Xóa trạng thái
    clearState() {
        chrome.storage.local.remove(['novelSpeechState'], () => {
            this.state = {
                isReading: false,
                currentChapter: null,
                currentContent: '',
                currentLineIndex: 0,
                speed: 1,
                pitch: 1,
                volume: 1,
                voice: 'default',
                lastTab: null,
                lastUpdateTime: null
            };
            logger.success('✓ Đã xóa trạng thái');
        });
    }
}

// Tạo instance toàn cục
const stateManager = new StateManager();
window.stateManager = stateManager;

logger.log('✅ State Manager khởi tạo xong');
