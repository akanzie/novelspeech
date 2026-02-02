// Initialize logger if not defined
if (typeof logger === 'undefined') {
    window.logger = {
        log: (msg) => console.log('[LOG]', msg),
        error: (msg) => console.error('[ERROR]', msg),
        warn: (msg) => console.warn('[WARN]', msg),
        success: (msg) => console.log('[SUCCESS]', msg)
    };
}

logger.log('🚀 Content script khởi tạo');

// Thêm CSS để highlight nội dung
const highlightStyle = document.createElement('style');
highlightStyle.textContent = `
    .tts-highlight {
        background-color: #FFD700 !important;
        padding: 2px 4px;
        border-radius: 3px;
        transition: background-color 0.3s;
    }
    .tts-reading-container {
        border-left: 4px solid #FFD700;
        padding-left: 10px;
        margin: 10px 0;
    }
`;
document.head.appendChild(highlightStyle);

let isReading = false;
let currentUtterance = null;
let currentIndex = 0;
let textChunks = [];
let currentHighlightElement = null;

// Biến toàn cục để theo dõi trạng thái
const readerState = {
    speed: 1,
    pitch: 1,
    volume: 1,
    voice: null
};

// Báo hiệu rằng content script đã sẵn sàng
window.postMessage({ type: 'CONTENT_SCRIPT_READY' }, '*');

// Cập nhật danh sách giọng nói
function updateVoiceList() {
    const voices = window.speechSynthesis.getVoices();
    logger.log(`🎤 Tổng giọng nói: ${voices.length}`);

    // Tìm giọng Việt
    let vietnameseVoiceIndex = -1;
    let defaultVoiceIndex = 0;

    voices.forEach((voice, index) => {
        logger.log(`   [${index}] ${voice.name} (${voice.lang})`);

        // Ưu tiên tìm giọng Việt
        if (voice.lang.includes('vi') || voice.name.toLowerCase().includes('vietnamese')) {
            vietnameseVoiceIndex = index;
            logger.success(`   ✓ Tìm thấy giọng Việt: ${voice.name}`);
        }

        // Giữ giọng mặc định
        if (voice.default) {
            defaultVoiceIndex = index;
        }
    });

    // Nếu có giọng Việt, sử dụng nó
    if (vietnameseVoiceIndex !== -1) {
        readerState.voice = vietnameseVoiceIndex;
        logger.success(`✓ Đã chọn giọng Việt tự động`);
    } else if (voices.length > 0) {
        logger.warn(`⚠️ Không có giọng Việt, dùng giọng mặc định`);
        readerState.voice = defaultVoiceIndex;
    } else {
        logger.error(`❌ Không có giọng nói nào trên hệ thống!`);
    }
}

// Khi trang tải xong, cập nhật danh sách giọng nói
if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = updateVoiceList;
}
updateVoiceList();

// Lấy nội dung từ trang web
function extractContent() {
    try {
        logger.log('📖 Trích xuất nội dung...');
        let bodyText = '';

        // Phương pháp 1: Tìm div nội dung chính
        let contentDiv = document.querySelector('#chapter-content') || 
                        document.querySelector('[class*="chapter"]') ||
                        document.querySelector('[class*="content"]') ||
                        document.querySelector('main');

        if (contentDiv) {
            logger.log(`✓ Tìm thấy div nội dung: ${contentDiv.className}`);
            bodyText = contentDiv.innerText || contentDiv.textContent;
        } else {
            logger.warn('⚠ Không tìm thấy div, sử dụng body');
            bodyText = document.body.innerText || document.body.textContent;
        }

        if (!bodyText || bodyText.trim().length < 50) {
            logger.error('❌ Nội dung quá ngắn hoặc trống');
            throw new Error('Nội dung quá ngắn hoặc không có văn bản');
        }

        const lines = bodyText.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        logger.log(`📊 Tổng dòng: ${lines.length}`);
        logger.log(`📄 Dòng đầu tiên: ${lines[0].substring(0, 50)}...`);

        if (lines.length < 2) {
            throw new Error('Không đủ nội dung để đọc');
        }

        const startIndex = 1;
        let contentText = '';

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];

            if (line.includes('-----')) {
                logger.log(`🔚 Tìm thấy dấu ---- tại dòng ${i}`);
                break;
            }

            contentText += line + ' ';
        }

        if (contentText.trim().length === 0) {
            throw new Error('Nội dung trống sau chương thứ 2');
        }

        logger.success(`✓ Nội dung được lấy: ${contentText.substring(0, 100)}...`);
        logger.log(`📏 Độ dài nội dung: ${contentText.length}`);
        return contentText;
    } catch (error) {
        logger.error(`❌ Lỗi trích xuất nội dung: ${error.message}`);
        throw error;
    }
}

// Chuyển sang chương tiếp theo
function goToNextChapter() {
    const currentUrl = window.location.href;
    logger.log(`🔗 URL hiện tại: ${currentUrl}`);

    const match = currentUrl.match(/chuong-(\d+)/i);

    if (match) {
        const currentChapter = parseInt(match[1]);
        const nextChapter = currentChapter + 1;
        const nextUrl = currentUrl.replace(/chuong-\d+/i, `chuong-${nextChapter}`);

        logger.success(`➡️  Chuyển từ chương ${currentChapter} sang ${nextChapter}`);
        logger.log(`🌐 URL mới: ${nextUrl}`);
        window.location.href = nextUrl;
    } else {
        logger.warn('⚠ Không tìm thấy số chương trong URL');
    }
}

// Chuyển sang chương trước
function goToPreviousChapter() {
    const currentUrl = window.location.href;
    logger.log(`🔗 URL hiện tại: ${currentUrl}`);

    const match = currentUrl.match(/chuong-(\d+)/i);

    if (match) {
        const currentChapter = parseInt(match[1]);
        if (currentChapter <= 1) {
            logger.warn('⚠ Đây là chương đầu tiên');
            updateStatus('⚠️ Đây là chương đầu tiên');
            return;
        }
        const previousChapter = currentChapter - 1;
        const previousUrl = currentUrl.replace(/chuong-\d+/i, `chuong-${previousChapter}`);

        logger.success(`⬅️  Chuyển từ chương ${currentChapter} sang ${previousChapter}`);
        logger.log(`🌐 URL mới: ${previousUrl}`);
        window.location.href = previousUrl;
    } else {
        logger.warn('⚠ Không tìm thấy số chương trong URL');
    }
}

// Đọc nội dung
function speak(text) {
    if (!text.trim()) {
        logger.error('❌ Nội dung trống');
        return;
    }

    window.speechSynthesis.cancel();
    clearHighlight();

    // Tách thành câu/đoạn để highlight realtime
    const sentences = text.split(/([.!?।।।।])/).filter(s => s.trim().length > 0);

    // Tạo element để highlight
    const contentDiv = document.querySelector('#chapter-content') || document.body;
    let highlightSpans = [];

    // Tìm và wrap các câu trong text
    let remainingText = text;
    sentences.forEach((sentence, index) => {
        if (sentence.match(/[.!?।।।।]/)) return;

        const span = document.createElement('span');
        span.className = 'tts-highlight-segment';
        span.textContent = sentence + ' ';
        span.dataset.index = index;
        highlightSpans.push(span);
    });

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate = readerState.speed;
    utterance.pitch = readerState.pitch;
    utterance.volume = readerState.volume;

    const voices = window.speechSynthesis.getVoices();
    if (readerState.voice !== null && voices[readerState.voice]) {
        utterance.voice = voices[readerState.voice];
        logger.log(`🎤 Sử dụng giọng: ${voices[readerState.voice].name} (${voices[readerState.voice].lang})`);
    } else if (voices.length > 0) {
        // Tìm giọng Việt nếu không có voice được chọn
        let vietnameseVoice = voices.find(v => v.lang.includes('vi'));
        if (vietnameseVoice) {
            utterance.voice = vietnameseVoice;
            logger.log(`🎤 Sử dụng giọng Việt: ${vietnameseVoice.name}`);
        } else {
            logger.warn(`⚠️ Không có giọng Việt, dùng giọng mặc định`);
        }
    }

    // Track vị trí đang đọc
    utterance.onboundary = (event) => {
        if (event.name === 'sentence') {
            // Highlight câu hiện tại
            highlightSpans.forEach((span, idx) => {
                if (idx === Math.floor(highlightSpans.length * (event.charIndex / text.length))) {
                    span.classList.add('tts-highlight');
                    currentHighlightElement = span;
                    span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    span.classList.remove('tts-highlight');
                }
            });
        }
    };

    utterance.onstart = () => {
        logger.log('🎙️  Bắt đầu đọc...');
        isReading = true;
    };

    utterance.onend = () => {
        logger.success('✓ Hoàn thành đọc');
        isReading = false;
        clearHighlight();
        updateStatus('✓ Hoàn thành. Chuyển sang chương tiếp theo...');
        setTimeout(() => {
            goToNextChapter();
        }, 1500);
    };

    utterance.onerror = (event) => {
        logger.error(`❌ Lỗi đọc: ${event.error}`);
        updateStatus(`❌ Lỗi: ${event.error}`);
        isReading = false;
        clearHighlight();
    };

    currentUtterance = utterance;
    logger.log('🚀 Bắt đầu nói...');
    window.speechSynthesis.speak(utterance);
}

// Xóa highlight
function clearHighlight() {
    const allHighlights = document.querySelectorAll('.tts-highlight');
    allHighlights.forEach(el => el.classList.remove('tts-highlight'));
    currentHighlightElement = null;
}

// Cập nhật trạng thái
function updateStatus(message) {
    logger.log(`📢 Cập nhật trạng thái: ${message}`);
    chrome.runtime.sendMessage({
        action: 'updateStatus',
        status: message
    }).catch(err => logger.error(`Lỗi gửi status: ${err.message}`));
}

// Bắt đầu đọc
function startReading() {
    try {
        logger.log('🎬 Bắt đầu đọc...');
        const content = extractContent();

        if (!content || !content.trim()) {
            updateStatus('❌ Không tìm thấy nội dung để đọc');
            logger.error('Nội dung trống');
            return;
        }

        logger.success('✓ Bắt đầu đọc nội dung...');
        speak(content);
    } catch (error) {
        logger.error(`❌ Lỗi khi đọc: ${error.message}`);
        updateStatus('❌ Lỗi: ' + error.message);
    }
}

// Dừng đọc
function stopReading() {
    logger.log('⏹️  Dừng đọc');
    window.speechSynthesis.cancel();
    isReading = false;
    clearHighlight();
    updateStatus('⏹️  Đã dừng');
}

// Gửi hành động từ content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    logger.log(`📨 Nhận lệnh: ${request.action}`);

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
            goToNextChapter();
            sendResponse({ success: true });
            break;
        case 'previousChapter':
            goToPreviousChapter();
            sendResponse({ success: true });
            break;
        case 'updateSpeed':
            logger.log(`⚡ Cập nhật tốc độ: ${request.value}`);
            readerState.speed = request.value;
            if (isReading && currentUtterance) {
                window.speechSynthesis.cancel();
                speak(currentUtterance.text);
            }
            sendResponse({ success: true });
            break;
        case 'updatePitch':
            logger.log(`🎵 Cập nhật cao độ: ${request.value}`);
            readerState.pitch = request.value;
            if (isReading && currentUtterance) {
                window.speechSynthesis.cancel();
                speak(currentUtterance.text);
            }
            sendResponse({ success: true });
            break;
        case 'updateVolume':
            logger.log(`🔊 Cập nhật âm lượng: ${request.value}`);
            readerState.volume = request.value;
            if (isReading && currentUtterance) {
                currentUtterance.volume = request.value;
            }
            sendResponse({ success: true });
            break;
        case 'updateVoice':
            logger.log(`🎤 Cập nhật giọng: ${request.value}`);
            readerState.voice = request.value === 'default' ? null : parseInt(request.value);
            if (isReading && currentUtterance) {
                window.speechSynthesis.cancel();
                speak(currentUtterance.text);
            }
            sendResponse({ success: true });
            break;
        default:
            logger.warn(`⚠ Lệnh không được biết: ${request.action}`);
    }
});

updateStatus('✓ Sẵn sàng');
logger.success('✅ Content script hoàn toàn sẵn sàng!');
