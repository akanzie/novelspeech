let currentTab = null;

// Hàm gửi tin nhắn đến content script
async function sendToContentScript(message) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            logger.error('❌ Không tìm thấy tab hiện tại');
            updateStatusDisplay('❌ Không tìm thấy tab');
            return;
        }
        
        currentTab = tab;
        logger.log('📤 Gửi tin nhắn đến tab: ' + tab.id);
        
        try {
            const response = await chrome.tabs.sendMessage(tab.id, message);
            logger.success('✓ Nhận phản hồi');
            return response;
        } catch (error) {
            logger.error('❌ Lỗi kết nối: ' + error.message);
            
            if (error.message.includes('Could not establish connection') || 
                error.message.includes('Receiving end does not exist')) {
                logger.warn('⚠️ Content script chưa được inject, đang inject...');
                updateStatusDisplay('⏳ Đang khởi tạo...');
                
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['src/logger/logger.js', 'src/core/content.js']
                    });
                    
                    logger.success('✓ Content script đã được inject');
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const retryResponse = await chrome.tabs.sendMessage(tab.id, message);
                    logger.success('✓ Nhận phản hồi sau inject');
                    return retryResponse;
                } catch (injectionError) {
                    logger.error('❌ Lỗi khi inject: ' + injectionError.message);
                    updateStatusDisplay('❌ Không thể khởi tạo extension');
                    throw injectionError;
                }
            }
            throw error;
        }
    } catch (error) {
        logger.error('❌ Lỗi: ' + error.message);
        updateStatusDisplay('❌ Lỗi: ' + error.message);
    }
}

// Cập nhật giao diện trạng thái
function updateStatusDisplay(message) {
    logger.log('🎯 Cập nhật UI: ' + message);
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// Sự kiện cho nút Bắt đầu
document.getElementById('startBtn').addEventListener('click', async () => {
    logger.log('🎬 Nhấp nút Bắt đầu');
    updateStatusDisplay('⏳ Đang khởi động...');
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
    updateStatusDisplay('⏹️  Đã dừng');
});

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
});

// Sự kiện cho cao độ
document.getElementById('pitchSlider').addEventListener('input', (e) => {
    const pitch = parseFloat(e.target.value);
    document.getElementById('pitchValue').textContent = pitch.toFixed(1);
    logger.log('🎵 Cao độ: ' + pitch);
    sendToContentScript({ action: 'updatePitch', value: pitch });
});

// Sự kiện cho âm lượng
document.getElementById('volumeSlider').addEventListener('input', (e) => {
    const volume = parseFloat(e.target.value) / 100;
    document.getElementById('volumeValue').textContent = e.target.value + '%';
    logger.log('🔊 Âm lượng: ' + e.target.value + '%');
    sendToContentScript({ action: 'updateVolume', value: volume });
});

// Sự kiện cho chọn giọng nói
document.getElementById('voiceSelect').addEventListener('change', (e) => {
    logger.log('🎤 Giọng nói: ' + e.target.value);
    sendToContentScript({ action: 'updateVoice', value: e.target.value });
});

// Thêm button xem log
const debugBtn = document.createElement('button');
debugBtn.id = 'debugBtn';
debugBtn.textContent = '🐛 Xem Log';
debugBtn.style.position = 'fixed';
debugBtn.style.bottom = '12px';
debugBtn.style.right = '12px';
debugBtn.style.padding = '8px 12px';
debugBtn.style.background = '#667eea';
debugBtn.style.color = 'white';
debugBtn.style.border = 'none';
debugBtn.style.borderRadius = '4px';
debugBtn.style.cursor = 'pointer';
debugBtn.style.zIndex = '9999';
debugBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
        action: 'openDebugPage'
    }).catch(() => {
        alert('Không thể mở trang debug');
    });
});
document.body.appendChild(debugBtn);

// Lắng nghe cập nhật trạng thái
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'statusUpdated') {
        console.log('📨 Nhận cập nhật trạng thái:', request.status);
        updateStatusDisplay(request.status);
    }
});

// Khởi tạo giao diện khi popup mở
document.addEventListener('DOMContentLoaded', () => {
    console.log('📖 Popup đã tải xong');
    updateStatusDisplay('✓ Sẵn sàng');
});
