// Lớp Logger để quản lý log
class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
    }

    // Thêm log
    add(level, message) {
        const timestamp = new Date().toLocaleString('vi-VN');
        const logEntry = {
            id: Date.now() + Math.random(),
            timestamp,
            level,
            message
        };

        this.logs.push(logEntry);

        // Giới hạn số log
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Lưu vào storage
        this.saveToStorage();

        // Gửi đến debug page nếu đang mở
        this.notifyDebugPage();
    }

    log(message) {
        this.add('info', message);
        console.log('[INFO]', message);
    }

    error(message) {
        this.add('error', message);
        console.error('[ERROR]', message);
    }

    warn(message) {
        this.add('warning', message);
        console.warn('[WARNING]', message);
    }

    success(message) {
        this.add('success', message);
        console.log('[SUCCESS]', message);
    }

    // Lưu vào chrome storage
    async saveToStorage() {
        try {
            await chrome.storage.local.set({
                logs: this.logs,
                lastUpdated: new Date().toISOString()
            });
        } catch (err) {
            console.error('Lỗi lưu log:', err);
        }
    }

    // Thông báo cho debug page
    notifyDebugPage() {
        chrome.runtime.sendMessage({
            action: 'logsUpdated',
            logs: this.logs
        }).catch(() => {
            // Bỏ qua nếu không có debug page mở
        });
    }

    // Lấy tất cả log
    async getAll() {
        try {
            const result = await chrome.storage.local.get(['logs']);
            return result.logs || [];
        } catch (err) {
            console.error('Lỗi lấy log:', err);
            return [];
        }
    }

    // Xóa tất cả log
    async clear() {
        try {
            await chrome.storage.local.remove(['logs', 'lastUpdated']);
            this.logs = [];
            this.notifyDebugPage();
            console.log('✓ Đã xóa tất cả log');
        } catch (err) {
            console.error('Lỗi xóa log:', err);
        }
    }

    // Xuất log thành chuỗi
    toString() {
        return this.logs
            .map(entry => `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`)
            .join('\n');
    }
}

// Tạo instance logger toàn cục
const logger = new Logger();

// Tải log từ storage khi khởi tạo
chrome.storage.local.get(['logs'], (result) => {
    if (result.logs) {
        logger.logs = result.logs;
    }
});

// Export để sử dụng ở các file khác
window.logger = logger;
