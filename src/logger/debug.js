// Biến toàn cục để lưu logs hiện tại
let currentLogs = [];

// Hiển thị log (realtime)
async function displayLogs() {
    const container = document.getElementById('logContainer');
    const statsContainer = document.getElementById('stats');

    if (currentLogs.length === 0) {
        container.innerHTML = '<div class="empty-message">Chưa có log nào...</div>';
        statsContainer.innerHTML = '';
        return;
    }

    // Thống kê
    const stats = {
        total: currentLogs.length,
        errors: currentLogs.filter(l => l.level === 'error').length,
        warnings: currentLogs.filter(l => l.level === 'warning').length,
        success: currentLogs.filter(l => l.level === 'success').length,
        info: currentLogs.filter(l => l.level === 'info').length
    };

    statsContainer.innerHTML = `
        <div class="stat-item">
            <div class="stat-value">${stats.total}</div>
            <div class="stat-label">Tổng cộng</div>
        </div>
        <div class="stat-item">
            <div class="stat-value" style="color: #ff6b6b;">${stats.errors}</div>
            <div class="stat-label">Lỗi</div>
        </div>
        <div class="stat-item">
            <div class="stat-value" style="color: #ffa94d;">${stats.warnings}</div>
            <div class="stat-label">Cảnh báo</div>
        </div>
        <div class="stat-item">
            <div class="stat-value" style="color: #68d391;">${stats.success}</div>
            <div class="stat-label">Thành công</div>
        </div>
        <div class="stat-item">
            <div class="stat-value" style="color: #4a90e2;">${stats.info}</div>
            <div class="stat-label">Thông tin</div>
        </div>
    `;

    // Hiển thị log (mới nhất ở dưới)
    const logsHTML = currentLogs
        .map(log => {
            let levelClass = log.level;
            let emoji = {
                error: '❌',
                warning: '⚠️',
                success: '✓',
                info: 'ℹ️'
            }[log.level] || 'ℹ️';

            return `
                <div class="log-entry ${levelClass}">
                    <div>
                        <span class="log-time">${emoji} ${log.timestamp}</span>
                    </div>
                    <div class="log-message">${escapeHtml(log.message)}</div>
                </div>
            `;
        })
        .join('');

    container.innerHTML = logsHTML;
    
    // Cuộn xuống dưới cùng
    container.scrollTop = container.scrollHeight;
}

// Tải log khi trang mở (realtime only)
displayLogs();

// Tải lại log mỗi 500ms (realtime)
setInterval(displayLogs, 500);

// Tải log
async function downloadLogs() {
    const content = currentLogs
        .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
        .join('\n');

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', `truyen-noi-log-${new Date().getTime()}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    console.log('📥 Đã tải log');
}

// Copy log vào clipboard
async function copyToClipboard() {
    const content = currentLogs
        .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
        .join('\n');

    try {
        await navigator.clipboard.writeText(content);
        alert('✓ Đã copy log vào clipboard!');
        console.log('📋 Đã copy log');
    } catch (err) {
        console.error('Lỗi copy:', err);
        alert('❌ Lỗi khi copy log');
    }
}

// Xóa tất cả log
async function clearLogs() {
    if (!confirm('Bạn có chắc muốn xóa toàn bộ log?\n\n⚠️ Hành động này không thể hoàn tác!')) {
        return;
    }

    try {
        currentLogs = [];
        displayLogs();
        console.log('🗑️ Đã xóa toàn bộ log');
    } catch (err) {
        console.error('Lỗi xóa log:', err);
        alert('❌ Lỗi khi xóa log');
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Lắng nghe cập nhật log real-time từ content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'logsUpdated') {
        currentLogs = request.logs || [];
        displayLogs();
    }
});
