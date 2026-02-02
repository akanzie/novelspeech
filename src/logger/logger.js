// Lớp Logger đơn giản - chỉ in-memory, realtime
class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 100;  // Giảm từ 1000 để tiết kiệm RAM
    }

    // Thêm log
    add(level, message) {
        const timestamp = new Date().toLocaleTimeString('vi-VN');
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

        // Notify debug page realtime (không cần lưu storage)
        this.notifyDebugPage();
        
        // In console luôn
        console.log(`[${timestamp}] [${level.toUpperCase()}]`, message);
    }

    log(message) {
        this.add('info', message);
    }

    error(message) {
        this.add('error', message);
    }

    warn(message) {
        this.add('warning', message);
    }

    success(message) {
        this.add('success', message);
    }

    // Thông báo cho debug page (realtime, không cần storage)
    notifyDebugPage() {
        try {
            chrome.runtime.sendMessage({
                action: 'logsUpdated',
                logs: this.logs,
                count: this.logs.length,
                timestamp: Date.now()
            }).catch(() => {
                // Bỏ qua nếu không có debug page mở
            });
        } catch (err) {
            // Bỏ qua
        }
    }

    // Lấy tất cả log
    getAll() {
        return this.logs;
    }

    // Xóa tất cả log
    clear() {
        this.logs = [];
        this.notifyDebugPage();
        console.log('✓ Đã xóa tất cả log');
    }

    // Xuất log thành chuỗi
    toString() {
        return this.logs
            .map(entry => `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`)
            .join('\n');
    }

    // Lấy stats
    getStats() {
        return {
            total: this.logs.length,
            errors: this.logs.filter(l => l.level === 'error').length,
            warnings: this.logs.filter(l => l.level === 'warning').length,
            success: this.logs.filter(l => l.level === 'success').length,
            info: this.logs.filter(l => l.level === 'info').length
        };
    }
}

// Tạo instance logger toàn cục
const logger = new Logger();
window.logger = logger;

logger.log('✅ Logger khởi tạo (realtime only, không lưu storage)');

