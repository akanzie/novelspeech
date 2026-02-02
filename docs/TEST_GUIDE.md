# ✅ HƯỚNG DẪN KIỂM TRA & TEST

## 🔧 Bước 1: Reload Extension

1. Mở `chrome://extensions`
2. Tìm "Truyện Nói - Đọc Truyện Tự Động"
3. Click nút **Reload** (mũi tên tròn)
4. Xác nhận extension tải lại thành công

## 🧪 Bước 2: Kiểm Tra Trang Debug

1. Vào `chrome://extensions`
2. Tìm "Truyện Nói", note ID extension (VD: `abcdefghijklmnopqrstuvwxyz123456`)
3. Mở tab mới, paste: `chrome-extension://abcdefghijklmnopqrstuvwxyz123456/debug.html`
4. Kiểm tra:
   - ✅ Trang debug tải được
   - ✅ Không có lỗi trong DevTools Console
   - ✅ Nút Refresh/Download/Copy/Clear hiển thị
   - ✅ Stats box trống (chưa có log)

## 🎬 Bước 3: Test Logging System

### 3.1 Test Logger từ Popup
1. Mở trang web bất kỳ (không cần truyện)
2. Click extension icon → popup mở
3. Điều chỉnh 1 slider (tốc độ, cao độ, âm lượng)
4. Mở trang debug → kiểm tra:
   - ✅ Xuất hiện log với timestamp
   - ✅ Icon ⚡/🎵/🔊 tương ứng
   - ✅ Stats "Total" tăng lên
5. Thay đổi giọng nói:
   - ✅ Log xuất hiện "🎤 Giọng nói: ..."

### 3.2 Test Logger từ Content Script
1. Mở trang truyện thực (metruyencv.com hoặc test)
2. Mở popup, nhấp **"Bắt đầu"**
3. Kiểm tra debug page:
   - ✅ Log "🚀 Content script khởi tạo" xuất hiện
   - ✅ Log "📖 Trích xuất nội dung..." xuất hiện
   - ✅ Hoặc log lỗi nếu không extract được
   - ✅ Nếu bắt đầu được: "🎵 Bắt đầu đọc..." xuất hiện
4. Nhấp **"Dừng"**:
   - ✅ Log "⏹️ Dừng đọc" xuất hiện

### 3.3 Test Auto-Inject
1. Mở trang web (không cần reload)
2. Click extension popup
3. Nhấp **"Bắt đầu"** (nếu content script chưa inject)
4. Kiểm tra debug page:
   - ✅ Log "❌ Lỗi kết nối: ..." xuất hiện
   - ✅ Tiếp theo log "⚠️ Content script chưa được inject, đang inject..."
   - ✅ Log "✓ Content script đã được inject" xuất hiện
   - ✅ Cuối cùng log "✓ Nhận phản hồi sau inject" hoặc "🎵 Bắt đầu đọc..."

## 📊 Bước 4: Kiểm Tra Stats

1. Mở debug page
2. Lặp lại các bước trên (điều chỉnh slider, bắt đầu/dừng)
3. Stats box nên hiển thị:
   - 📊 **Total**: Tổng số log (tăng dần)
   - 🔴 **Errors**: Số lỗi (có thể 0 nếu không có lỗi)
   - 🟠 **Warnings**: Số cảnh báo
   - 🟢 **Success**: Số thành công

## 💾 Bước 5: Kiểm Tra Download/Copy/Clear

1. Mở debug page có log
2. Click **"Tải xuống"**:
   - ✅ File `logs_[timestamp].txt` tải về
   - ✅ Kiểm tra nội dung có log
3. Click **"Sao chép"**:
   - ✅ Clipboard có log (dán vào notepad kiểm tra)
4. Click **"Xóa"**:
   - ✅ Confirm dialog hiện lên
   - ✅ Sau xác nhận, stats reset về 0
   - ✅ Log list trống

## 🔴 Bước 6: Kiểm Tra Error Logging

1. Mở trang web (không phải trang truyện)
2. Click extension popup, nhấp **"Bắt đầu"**
3. Kiểm tra debug page:
   - ✅ Có log lỗi extraction (VD: "❌ Lỗi trích xuất nội dung: ...")
   - ✅ Stats "Errors" tăng lên
   - ✅ Log entry màu đỏ

## 📱 Bước 7: Test Button "🐛 Xem Log"

1. Mở popup extension
2. Click nút **"🐛 Xem Log"** góc dưới phải popup
3. Kiểm tra:
   - ✅ Tab mới mở với trang debug
   - ✅ Hoặc nếu đã mở, tab switch sang debug page

## 🎯 Bước 8: Full Workflow Test

1. Reload extension (`chrome://extensions` → Reload)
2. Mở trang truyện thực (metruyencv.com)
3. Mở popup → nhấp **"Bắt đầu"**
   - ✅ Nội dung bắt đầu được đọc (hoặc lỗi được ghi log)
4. Điều chỉnh tốc độ slider
   - ✅ Tốc độ đọc thay đổi
   - ✅ Log xuất hiện trong debug page
5. Nhấp **"Dừng"**
   - ✅ Đọc dừng lại
6. Mở debug page
   - ✅ Tất cả hành động được ghi lại
   - ✅ Có thể xem chi tiết, tải xuống log

## ⚠️ Các Lỗi Có Thể Gặp & Cách Xử Lý

### Lỗi: Trang debug không mở
- **Nguyên nhân**: chrome-extension URL sai hoặc ID không chính xác
- **Cách fix**: Copy đúng ID từ `chrome://extensions` (VD: `abcdefg...xyz`)

### Lỗi: Log không xuất hiện
- **Nguyên nhân**: logger.js không được inject
- **Cách fix**: Reload extension → Reload trang web → Thử lại

### Lỗi: DevTools hiện console error (Uncaught TypeError: logger is not defined)
- **Nguyên nhân**: logger.js inject muộn hơn content.js
- **Cách fix**: Kiểm tra manifest.json - logger.js phải trước content.js trong array
- **Hiện tại**: ✅ Đã đúng vị trí

### Lỗi: Popup không inject content script thành công
- **Nguyên nhân**: Permission hoặc URL restricted
- **Cách fix**: Kiểm tra host_permissions trong manifest (phải có `<all_urls>`)
- **Hiện tại**: ✅ Đã đúng

## 📋 Completion Checklist

- [ ] Extension reload thành công
- [ ] Trang debug tải được
- [ ] Logger ghi được log từ popup
- [ ] Logger ghi được log từ content script
- [ ] Auto-inject hoạt động khi lỗi kết nối
- [ ] Stats update đúng (Total, Errors, Warnings, Success)
- [ ] Download log thành công
- [ ] Copy log thành công
- [ ] Clear log thành công
- [ ] Button "🐛 Xem Log" mở debug page
- [ ] Full workflow: bắt đầu → điều chỉnh → dừng → xem log

## 🎉 Hoàn Tất!

Nếu tất cả các kiểm tra trên ✅ thành công, extension đã sẵn sàng sử dụng!

---

**Ghi chú**: Nếu gặp lỗi, kiểm tra trang debug trước để xem chi tiết lỗi, sau đó reload extension hoặc reload trang web.
