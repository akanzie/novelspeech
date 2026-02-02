// Tải log từ storage
async function loadLogs() {
    try {
        const result = await chrome.storage.local.get(['logs']);
        return result.logs || [];
    } catch (err) {
        console.error('Lỗi tải log:', err);
        return [];
    }
}

// Hiển thị log
async function displayLogs() {
    const logs = await loadLogs();
    const container = document.getElementById('logContainer');
    const statsContainer = document.getElementById('stats');

    if (logs.length === 0) {
        container.innerHTML = '<div class="empty-message">Chưa có log nào...</div>';
        statsContainer.innerHTML = '';
        return;
    }

    // Thống kê
    const stats = {
        total: logs.length,
        errors: logs.filter(l => l.level === 'error').length,
        warnings: logs.filter(l => l.level === 'warning').length,
        success: logs.filter(l => l.level === 'success').length
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
    `;

    // Hiển thị log (mới nhất ở dưới)
    const logsHTML = logs
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

// Làm mới log
function refreshLogs() {
    displayLogs();
    console.log('🔄 Làm mới log');
}

// Tải log
async function downloadLogs() {
    const logs = await loadLogs();
    const content = logs
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
    const logs = await loadLogs();
    const content = logs
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
        await chrome.storage.local.remove(['logs', 'lastUpdated']);
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

// Lắng nghe cập nhật log real-time
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'logsUpdated') {
        displayLogs();
    }
});

// Tải log khi trang mở
displayLogs();

// Làm mới log mỗi 2 giây
setInterval(refreshLogs, 2000);
