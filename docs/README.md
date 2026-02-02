# 📖 Truyện Nói - Đọc Truyện Tự Động

Chrome extension dùng Web Speech API để đọc nội dung truyện web tự động và chuyển chương tự động.

## 🎯 Tính Năng

- ✅ Đọc nội dung truyện tự động bằng tiếng Việt
- ✅ Khởi đầu từ chương thứ 2 (bỏ qua tiêu đề)
- ✅ Dừng lại tự động khi gặp dấu `-----`
- ✅ Tự động chuyển chương kế tiếp (chuong-1 → chuong-2, v.v.)
- ✅ Điều chỉnh tốc độ đọc (0.5x - 2.0x)
- ✅ Điều chỉnh cao độ giọng (0.5 - 2.0)
- ✅ Điều chỉnh âm lượng (0% - 100%)
- ✅ Chọn giọng nói (nếu có nhiều giọng)
- ✅ 🐛 Xem log lỗi & debug với giao diện web

## 📦 Cài Đặt

1. Tải extension (hoặc clone từ repo)
2. Vào `chrome://extensions`
3. Bật **"Chế độ developer"** (góc trên phải)
4. Click **"Tải extension đã giải nén"**
5. Chọn thư mục chứa extension
6. ✅ Hoàn tất! Extension xuất hiện trong Chrome

## 🚀 Cách Sử Dụng

1. Mở trang truyện trên metruyencv.com hoặc trang web tương tự
2. Click icon extension (🎤) trong toolbar
3. Nhấp **"Bắt đầu"** để bắt đầu đọc
4. Điều chỉnh các slider:
   - **Tốc độ**: Bao lâu để đọc từng câu
   - **Cao độ**: Bao cao/thấp giọng
   - **Âm lượng**: Mức âm lượng
   - **Giọng nói**: Chọn giọng nói khác
5. Nhấp **"Dừng"** để dừng đọc
6. Click **"🐛 Xem Log"** nếu có lỗi để xem chi tiết

## 🐛 Debug & Xem Log

### Cách mở trang debug:
1. Click extension → nhấp nút **"🐛 Xem Log"** trong popup
2. Hoặc mở trực tiếp: `chrome-extension://[EXTENSION_ID]/debug.html`
   - Thay `[EXTENSION_ID]` bằng ID thực tế (xem trong `chrome://extensions`)

### Trang debug hiển thị:
- 📊 **Thống kê**: Tổng log, lỗi, cảnh báo, thành công
- 📝 **Danh sách log**: Tất cả sự kiện với timestamp & mức độ
- 🎨 **Màu sắc**: 
  - 🔴 Đỏ = Lỗi
  - 🟠 Cam = Cảnh báo
  - 🟢 Xanh = Thành công
  - 🔵 Xanh dương = Thông tin
- 💾 **Tải xuống**: Export log thành file .txt
- 📋 **Sao chép**: Copy tất cả log vào clipboard
- 🗑️ **Xóa**: Xóa tất cả log

## 📝 Kiến Trúc

```
My Extension/
├── manifest.json          # Cấu hình extension
├── background.js          # Service worker (xử lý message)
├── content.js             # Script chính (chạy trên trang web)
├── popup.html             # UI popup
├── popup.js               # Logic popup
├── popup.css              # Style popup
├── logger.js              # Hệ thống logging
├── debug.html             # UI trang debug
├── debug.js               # Logic trang debug
└── README.md              # File này
```

## 🔧 Cách Hoạt Động

1. **Content Script** (`content.js`):
   - Trích xuất nội dung từ `#chapter-content` hoặc selector khác
   - Tách nội dung thành các đoạn
   - Bắt đầu từ đoạn thứ 2 (bỏ qua tiêu đề)
   - Dùng Web Speech API để đọc
   - Tự động chuyển chương khi gặp `-----`

2. **Logger** (`logger.js`):
   - Ghi log tất cả sự kiện
   - Lưu vào `chrome.storage.local` (tồn tại lâu dài)
   - Gửi thông báo tới trang debug

3. **Trang Debug** (`debug.html` + `debug.js`):
   - Hiển thị log realtime
   - Cập nhật mỗi 2 giây
   - Cho phép tải xuống/sao chép/xóa log

## ❌ Xử Lý Lỗi

### Lỗi "Không thể kết nối":
- Popup sẽ **tự động inject** content script
- Thử lại hành động

### Content script không tải:
- Mở trang debug xem chi tiết lỗi
- Thử reload extension (`chrome://extensions` → Reload)

### Không trích xuất được nội dung:
- Kiểm tra selector trong debug log
- Trang web có thể dùng cấu trúc HTML khác
- Contact: Cập nhật selector trong `content.js`

### Giọng đọc không có:
- Chrome chỉ có 1 giọng tiếng Việt mặc định
- Có thể chọn giọng Anh/Trung nếu cần
- Tốc độ/cao độ điều chỉnh được toàn bộ

## 📄 License

Dùng miễn phí cho mục đích cá nhân

## 🤝 Liên Hệ

Nếu có lỗi hoặc gợi ý, hãy kiểm tra trang debug trước để xem chi tiết lỗi.
