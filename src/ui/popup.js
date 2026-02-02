let currentTab = null;
let lastErrors = [];

// Hàm gửi tin nhắn đến content script
async function sendToContentScript(message) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            const msg = '❌ Không tìm thấy tab hiện tại';
            logger.error(msg);
            updateStatusDisplay(msg);
            addError(msg);
            return;
        }
        
        currentTab = tab;
        logger.log('📤 Gửi tin nhắn: ' + message.action);
        
        try {
            const response = await chrome.tabs.sendMessage(tab.id, message);
            if (response && response.success) {
                logger.success('✓ Thành công');
            }
            return response;
        } catch (error) {
            logger.error('❌ Lỗi kết nối: ' + error.message);
            addError('Lỗi kết nối: ' + error.message);
            
            if (error.message.includes('Could not establish connection') || 
                error.message.includes('Receiving end does not exist')) {
                updateStatusDisplay('⏳ Đang khởi tạo...');
                logger.warn('⚠️ Content script chưa được inject, đang inject...');
                
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['src/logger/logger.js', 'src/core/tts-engine.js', 'src/core/content-extractor.js', 'src/core/chapter-navigator.js', 'src/core/highlight-manager.js', 'src/core/content-v2.js']
                    });
                    
                    logger.success('✓ Content script đã được inject');
                    updateStatusDisplay('⏳ Kết nối...');
                    addError('Đang khởi tạo các module...');
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const retryResponse = await chrome.tabs.sendMessage(tab.id, message);
                    logger.success('✓ Nhận phản hồi sau inject');
                    updateStatusDisplay('✓ Sẵn sàng');
                    clearErrors();
                    return retryResponse;
                } catch (injectionError) {
                    const errMsg = '❌ Lỗi khởi tạo: ' + injectionError.message;
                    logger.error(errMsg);
                    updateStatusDisplay(errMsg);
                    addError(injectionError.message);
                    throw injectionError;
                }
            }
            throw error;
        }
    } catch (error) {
        const errMsg = '❌ Lỗi: ' + error.message;
        logger.error(errMsg);
        updateStatusDisplay(errMsg);
        addError(error.message);
    }
}

// Cập nhật giao diện trạng thái
function updateStatusDisplay(message) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
        // Thêm class để highlight error
        if (message.includes('❌')) {
            statusElement.style.color = '#ff6b6b';
            statusElement.style.fontWeight = 'bold';
        } else if (message.includes('✓')) {
            statusElement.style.color = '#68d391';
            statusElement.style.fontWeight = 'bold';
        } else if (message.includes('⏳')) {
            statusElement.style.color = '#ffc107';
            statusElement.style.fontWeight = 'normal';
        } else {
            statusElement.style.color = '#333';
            statusElement.style.fontWeight = 'normal';
        }
    }
}

// Thêm lỗi vào danh sách
function addError(message) {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    lastErrors.unshift({ message, timestamp });
    if (lastErrors.length > 10) {
        lastErrors.pop();
    }
    displayErrors();
}

// Hiển thị lỗi trong UI
function displayErrors() {
    if (lastErrors.length === 0) {
        clearErrors();
        return;
    }
    
    const errorBox = document.getElementById('errorBox');
    const errorContent = document.getElementById('errorContent');
    
    errorContent.innerHTML = lastErrors.map(err => `
        <div class="error-item">
            <div>${err.message}</div>
            <div class="error-time">${err.timestamp}</div>
        </div>
    `).join('');
    
    errorBox.style.display = 'block';
}

// Xóa tất cả lỗi
function clearErrors() {
    lastErrors = [];
    const errorBox = document.getElementById('errorBox');
    errorBox.style.display = 'none';
}

// Nút đóng lỗi
if (document.getElementById('closeErrorBtn')) {
    document.getElementById('closeErrorBtn').addEventListener('click', clearErrors);
}

// Sự kiện cho nút Bắt đầu
document.getElementById('startBtn').addEventListener('click', async () => {
    logger.log('🎬 Nhấp nút Bắt đầu');
    updateStatusDisplay('⏳ Đang khởi động...');
    clearErrors();
    await sendToContentScript({ action: 'start' });
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
});

// Sự kiện cho nút Dừng
document.getElementById('stopBtn').addEventListener('click', async () => {
    logger.log('⏹️ Nhấp nút Dừng');
    await sendToContentScript({ action: 'stop' });
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    updateStatusDisplay('⏹️ Đã dừng');
});

// Sự kiện cho nút Log (xem debug)
const logBtn = document.getElementById('logBtn');
if (logBtn) {
    logBtn.addEventListener('click', () => {
        logger.log('📋 Mở trang log');
        const debugPageUrl = chrome.runtime.getURL('src/logger/debug.html');
        chrome.tabs.create({ url: debugPageUrl });
    });
}

// Sự kiện cho nút Chương Trước
document.getElementById('prevBtn').addEventListener('click', async () => {
    logger.log('⬅️ Nhấp nút Chương Trước');
    await sendToContentScript({ action: 'previousChapter' });
});

// Sự kiện cho nút Chương Tiếp Theo
document.getElementById('nextBtn').addEventListener('click', async () => {
    logger.log('➡️ Nhấp nút Chương Tiếp Theo');
    await sendToContentScript({ action: 'nextChapter' });
});

// Sự kiện cho tốc độ
document.getElementById('speedSlider').addEventListener('input', (e) => {
    const speed = parseFloat(e.target.value);
    document.getElementById('speedValue').textContent = speed.toFixed(1) + 'x';
    logger.log('⚡ Tốc độ: ' + speed);
    sendToContentScript({ action: 'updateSpeed', value: speed });
    
    // Lưu vào state
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'saveState', 
                updates: { speed } 
            }).catch(() => {});
        }
    });
});

// Sự kiện cho cao độ
document.getElementById('pitchSlider').addEventListener('input', (e) => {
    const pitch = parseFloat(e.target.value);
    document.getElementById('pitchValue').textContent = pitch.toFixed(1);
    logger.log('🎵 Cao độ: ' + pitch);
    sendToContentScript({ action: 'updatePitch', value: pitch });
    
    // Lưu vào state
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'saveState', 
                updates: { pitch } 
            }).catch(() => {});
        }
    });
});

// Sự kiện cho âm lượng
document.getElementById('volumeSlider').addEventListener('input', (e) => {
    const volume = parseFloat(e.target.value) / 100;
    document.getElementById('volumeValue').textContent = e.target.value + '%';
    logger.log('🔊 Âm lượng: ' + e.target.value + '%');
    sendToContentScript({ action: 'updateVolume', value: volume });
    
    // Lưu vào state
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'saveState', 
                updates: { volume } 
            }).catch(() => {});
        }
    });
});

// Sự kiện cho chọn giọng nói
document.getElementById('voiceSelect').addEventListener('change', (e) => {
    logger.log('🎤 Giọng nói: ' + e.target.value);
    sendToContentScript({ action: 'updateVoice', value: e.target.value });
    
    // Lưu vào state
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'saveState', 
                updates: { voice: e.target.value } 
            }).catch(() => {});
        }
    });
});

// Thêm button xem log - REMOVED (dùng nút HTML thay vì tạo dynamic)

// Lắng nghe cập nhật trạng thái từ content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'statusUpdated') {
        console.log('📨 Nhận cập nhật trạng thái:', request.status);
        updateStatusDisplay(request.status);
    }
    if (request.action === 'errorOccurred') {
        console.log('📨 Nhận lỗi:', request.error);
        addError(request.error);
        updateStatusDisplay('❌ ' + request.error);
    }
});

// Khởi tạo giao diện khi popup mở
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📖 Popup đã tải xong');
    updateStatusDisplay('✓ Sẵn sàng');
    
    // Khôi phục trạng thái TTS settings
    chrome.storage.local.get(['novelSpeechState'], (result) => {
        if (result.novelSpeechState) {
            const state = result.novelSpeechState;
            logger.log('📝 Khôi phục cài đặt TTS từ lần trước');
            
            // Khôi phục tốc độ
            if (state.speed) {
                document.getElementById('speedSlider').value = state.speed;
                document.getElementById('speedValue').textContent = state.speed.toFixed(1) + 'x';
            }
            
            // Khôi phục cao độ
            if (state.pitch) {
                document.getElementById('pitchSlider').value = state.pitch;
                document.getElementById('pitchValue').textContent = state.pitch.toFixed(1);
            }
            
            // Khôi phục âm lượng
            if (state.volume) {
                const volumePercent = Math.round(state.volume * 100);
                document.getElementById('volumeSlider').value = volumePercent;
                document.getElementById('volumeValue').textContent = volumePercent + '%';
            }
            
            // Khôi phục giọng nói
            if (state.voice) {
                document.getElementById('voiceSelect').value = state.voice;
            }
            
            logger.success('✓ Cài đặt đã khôi phục');
        }
    });
});
