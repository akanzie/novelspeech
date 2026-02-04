/**
 * Main Service Worker - entrypoint of background process (Manifest V3)
 */

import BackgroundService from './BackgroundService.js';

// Khởi tạo background service ngay khi service worker load
const backgroundService = new BackgroundService();

// Đăng ký xử lý install/update
backgroundService.handleInstall();

// Export để test/debug (nếu chạy trong environment có window)
if (typeof window !== 'undefined') {
  window.backgroundService = backgroundService;
}

export default backgroundService;

