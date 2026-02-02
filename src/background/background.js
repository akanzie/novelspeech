// Biến toàn cục lưu trữ thông điệp trạng thái
let currentStatus = 'Sẵn sàng';

// Nhận cập nhật trạng thái từ content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateStatus') {
        currentStatus = request.status;
        // Gửi cập nhật cho tất cả popup mở
        chrome.runtime.sendMessage({
            action: 'statusUpdated',
            status: currentStatus
        }).catch(() => {
            // Bỏ qua lỗi nếu không có popup mở
        });
    } else if (request.action === 'openDebugPage') {
        // Mở trang debug trong tab mới
        chrome.tabs.create({ url: chrome.runtime.getURL('debug.html') });
        sendResponse({ success: true });
    }
    return true;
});
