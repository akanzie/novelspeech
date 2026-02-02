/**
 * Content Script - Main Controller
 * Quản lý tất cả các modules: TTS, Content Extraction, Navigation, Highlight
 */

// Khởi tạo logger fallback
if (typeof logger === 'undefined') {
    window.logger = {
        log: (msg) => console.log('[LOG]', msg),
        error: (msg) => console.error('[ERROR]', msg),
        warn: (msg) => console.warn('[WARN]', msg),
        success: (msg) => console.log('[SUCCESS]', msg)
    };
}

logger.log('🚀 Content script khởi tạo');

// Báo hiệu sẵn sàng
window.postMessage({ type: 'CONTENT_SCRIPT_READY' }, '*');

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const readerState = {
    isReading: false,
    currentContent: null,
    autoNavigate: true,
    navigationDelay: 1500 // ms
};

// ============================================================================
// CONTENT EXTRACTION
// ============================================================================

function extractContent() {
    try {
        logger.log('📖 Trích xuất nội dung...');
        logger.log(`🔗 Current URL: ${window.location.href}`);
        logger.log(`📄 Page title: ${document.title}`);

        const result = contentExtractor.extract({
            startLine: 1,
            stopPatterns: ['-----', '---', '***']
        });

        readerState.currentContent = result.content;
        logger.success(`✓ Extracted ${result.content.length} characters`);
        return result.content;

    } catch (error) {
        logger.error(`❌ Trích xuất lỗi: ${error.message}`);
        logger.log('🔍 DEBUG: Attempting debug page structure...');
        // Trigger debug logging in extractor
        if (typeof contentExtractor !== 'undefined' && contentExtractor.debugPageStructure) {
            contentExtractor.debugPageStructure();
        }

        const errorMsg = `Trích xuất lỗi: ${error.message}. Kiểm tra log để biết chi tiết.`;
        updateStatus(`❌ ${errorMsg}`);
        sendError(errorMsg);
        throw error;
    }
}

// ============================================================================
// TTS CONTROL
// ============================================================================

function startReading() {
    try {
        logger.log('🎬 Bắt đầu đọc...');
        updateStatus('⏳ Đang chuẩn bị...');

        const content = extractContent();
        if (!content || !content.trim()) {
            const errMsg = 'Không có nội dung để đọc';
            updateStatus('❌ ' + errMsg);
            sendError(errMsg);
            return;
        }

        highlightManager.clear();

        const options = {
            onStart: () => {
                readerState.isReading = true;
                highlightManager.scrollTo(document.querySelector('#chapter-content') || document.body);
            },
            onEnd: () => {
                readerState.isReading = false;
                highlightManager.fadeHighlight();
                updateStatus('✓ Hoàn thành. Chuyển chương...');

                if (readerState.autoNavigate) {
                    setTimeout(() => {
                        chapterNavigator.goNext();
                    }, readerState.navigationDelay);
                }
            },
            onError: (error) => {
                readerState.isReading = false;
                const errorMsg = String(error);
                updateStatus(`❌ Lỗi: ${errorMsg}`);
                sendError(errorMsg);
                highlightManager.clear();
            }
        };

        if (ttsEngine.speak(content, options)) {
            logger.success('✓ Bắt đầu đọc thành công');
            updateStatus('▶️ Đang đọc...');
        } else {
            const errMsg = 'Không thể bắt đầu đọc';
            updateStatus('❌ ' + errMsg);
            sendError(errMsg);
        }

    } catch (error) {
        logger.error(`❌ Lỗi: ${error.message}`);
        const errorMsg = `Lỗi khởi động: ${error.message}`;
        updateStatus(`❌ ${errorMsg}`);
        sendError(errorMsg);
    }
}

function stopReading() {
    logger.log('⏹️ Dừng đọc');
    ttsEngine.stop();
    highlightManager.clear();
    readerState.isReading = false;
    updateStatus('⏹️ Đã dừng');
}

// ============================================================================
// NAVIGATION CONTROL
// ============================================================================

function goNextChapter() {
    logger.log('➡️ Chuyển sang chương tiếp theo...');
    chapterNavigator.goNext();
}

function goPreviousChapter() {
    logger.log('⬅️ Chuyển sang chương trước...');
    chapterNavigator.goPrevious();
}

// ============================================================================
// TTS SETTINGS
// ============================================================================

function updateSpeed(speed) {
    logger.log(`⚡ Cập nhật tốc độ: ${speed}x`);
    ttsEngine.setSpeed(speed);

    // Nếu đang đọc, restart
    if (readerState.isReading && readerState.currentContent) {
        stopReading();
        setTimeout(() => startReading(), 300);
    }
}

function updatePitch(pitch) {
    logger.log(`🎵 Cập nhật cao độ: ${pitch}`);
    ttsEngine.setPitch(pitch);

    if (readerState.isReading && readerState.currentContent) {
        stopReading();
        setTimeout(() => startReading(), 300);
    }
}

function updateVolume(volume) {
    logger.log(`🔊 Cập nhật âm lượng: ${(volume * 100).toFixed(0)}%`);
    ttsEngine.setVolume(volume);
}

function updateVoice(voiceIndex) {
    logger.log(`🎤 Cập nhật giọng: ${voiceIndex}`);
    ttsEngine.selectVoice(voiceIndex);

    if (readerState.isReading && readerState.currentContent) {
        stopReading();
        setTimeout(() => startReading(), 300);
    }
}

// ============================================================================
// STATUS UPDATE
// ============================================================================

function updateStatus(message) {
    logger.log(`📢 Status: ${message}`);

    try {
        chrome.runtime.sendMessage({
            action: 'updateStatus',
            status: message
        }).catch(err => {
            logger.warn('⚠️ Không thể gửi status: ' + err.message);
        });
    } catch (error) {
        logger.warn('⚠️ Gửi status lỗi: ' + error.message);
    }
}

// Gửi lỗi đến popup
function sendError(errorMessage) {
    logger.error(`🔴 Gửi lỗi: ${errorMessage}`);

    try {
        chrome.runtime.sendMessage({
            action: 'errorOccurred',
            error: errorMessage
        }).catch(err => {
            logger.warn('⚠️ Không thể gửi lỗi: ' + err.message);
        });
    } catch (error) {
        logger.warn('⚠️ Gửi lỗi thất bại: ' + error.message);
    }
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    logger.log(`📨 Nhận lệnh: ${request.action}`);

    try {
        switch (request.action) {
            case 'start':
                startReading();
                sendResponse({ success: true });
                break;

            case 'stop':
                stopReading();
                sendResponse({ success: true });
                break;

            case 'nextChapter':
                goNextChapter();
                sendResponse({ success: true });
                break;

            case 'previousChapter':
                goPreviousChapter();
                sendResponse({ success: true });
                break;

            case 'updateSpeed':
                updateSpeed(parseFloat(request.value));
                sendResponse({ success: true });
                break;

            case 'updatePitch':
                updatePitch(parseFloat(request.value));
                sendResponse({ success: true });
                break;

            case 'updateVolume':
                updateVolume(parseFloat(request.value));
                sendResponse({ success: true });
                break;

            case 'updateVoice':
                updateVoice(request.value);
                sendResponse({ success: true });
                break;

            case 'getVoices':
                const voices = ttsEngine.getVoices();
                sendResponse({
                    success: true,
                    voices: voices.map((v, i) => ({
                        index: i,
                        name: v.name,
                        lang: v.lang,
                        default: v.default
                    }))
                });
                break;

            case 'getProviderInfo':
                sendResponse({
                    success: true,
                    info: ttsEngine.getProviderInfo()
                });
                break;

            case 'debugExtractor':
                contentExtractor.debug();
                sendResponse({ success: true });
                break;

            case 'debugNavigator':
                chapterNavigator.debug();
                sendResponse({ success: true });
                break;

            case 'saveState':
                if (request.updates && window.stateManager) {
                    window.stateManager.setState(request.updates);
                    logger.log('💾 Trạng thái đã lưu: ' + Object.keys(request.updates).join(', '));
                }
                sendResponse({ success: true });
                break;

            default:
                logger.warn(`⚠️ Lệnh không biết: ${request.action}`);
                sendResponse({ success: false, error: 'Unknown action' });
        }
    } catch (error) {
        logger.error(`❌ Lỗi xử lý lệnh: ${error.message}`);
        sendResponse({ success: false, error: error.message });
    }

    return true; // Giữ channel mở cho async
});

// ============================================================================
// INITIALIZATION
// ============================================================================

logger.log('🔧 Chờ modules khởi tạo...');

// Chờ tất cả modules sẵn sàng
const waitForModules = () => {
    if (typeof ttsEngine === 'undefined' ||
        typeof contentExtractor === 'undefined' ||
        typeof chapterNavigator === 'undefined' ||
        typeof highlightManager === 'undefined') {
        logger.warn('⏳ Chờ modules...');
        setTimeout(waitForModules, 100);
        return;
    }

    logger.success('✅ Tất cả modules sẵn sàng');
    updateStatus('✓ Sẵn sàng');

    // Hiển thị provider info
    const providerInfo = ttsEngine.getProviderInfo();
    logger.log(`📡 TTS Provider: ${providerInfo.current}`);
    logger.log(`   Available: ${providerInfo.available.join(', ')}`);

    logger.success('✅ Content script khởi tạo hoàn toàn!');
};

waitForModules();
