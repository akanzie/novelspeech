# ⚡ QUICK START - BẮTĐẦU NHANH

## 5 Bước Để Chạy Extension

### 1️⃣ Reload Extension (30 giây)
```
1. Mở chrome://extensions
2. Tìm "Truyện Nói - Đọc Truyện Tự Động"
3. Click nút Reload (🔄)
4. Done! ✅
```

### 2️⃣ Mở Trang Debug (30 giây)
```
1. chrome://extensions → Tìm "Truyện Nói"
2. Copy ID từ "ID:" field
3. Mở tab mới, paste: chrome-extension://[ID]/debug.html
4. Tab debug sẽ tải lên
```

### 3️⃣ Test Logger (1 phút)
```
1. Mở popup → Điều chỉnh slider (tốc độ/cao độ)
2. Kiểm tra trang debug → Log xuất hiện ✅
3. Stats tăng lên (Total: 1, 2, 3...)
```

### 4️⃣ Test Content Extraction (2 phút)
```
1. Mở trang truyện (metruyencv.com)
2. Click extension → "Bắt đầu"
3. Kiểm tra:
   - ✅ Nội dung được đọc hoặc
   - ❌ Lỗi extraction được ghi log
4. Xem chi tiết trong trang debug
```

### 5️⃣ Full Test (3 phút)
```
1. Bắt đầu → Thay đổi tốc độ → Dừng
2. Mở trang debug → Xem tất cả log
3. Tải xuống log → Kiểm tra file
4. Click "Xóa" → Xác nhận → Stats reset
```

---

## 🔥 Các URL Quan Trọng

| Mục Đích | URL |
|---------|-----|
| **Quản lý Extensions** | `chrome://extensions` |
| **Trang Debug** | `chrome-extension://[ID]/debug.html` |
| **DevTools Console** | F12 → Console tab |

---

## 📌 Debug Tips

### Xem Log Ngay
```
Extension Popup → Click "🐛 Xem Log" → Tab debug mở
```

### Kiểm Tra Error
```
Trang debug → Tìm log màu 🔴 đỏ
- Icon ❌ = Error
- Icon ⚠️ = Warning
- Icon ✓ = Success
```

### Download Log
```
Trang debug → "Tải xuống" → File logs_[date].txt tải về
```

### Xóa Log
```
Trang debug → "Xóa" → Xác nhận OK → Stats reset
```

---

## 📊 Ví Dụ Log

```
⏰ 14:25:30        🎬 Nhấp nút Bắt đầu
⏰ 14:25:31        📤 Gửi tin nhắn đến tab: 1234567890
⏰ 14:25:32        🚀 Content script khởi tạo
⏰ 14:25:33        📖 Trích xuất nội dung...
⏰ 14:25:34        ✓ Nội dung được lấy: Chương 1...
⏰ 14:25:35        🎵 Bắt đầu đọc...
⏰ 14:25:40        ⚡ Tốc độ: 1.5
⏰ 14:25:45        ⏹️ Dừng đọc
```

---

## ✅ Completion Checklist

- [ ] Extension reload
- [ ] Trang debug mở được
- [ ] Logger ghi được log
- [ ] Stats update
- [ ] Download/Copy/Clear hoạt động

---

## 🆘 Nếu Có Lỗi

1. **Trang debug không mở**: Kiểm tra ID extension `chrome://extensions`
2. **Không có log**: Reload extension → Reload trang web
3. **Content script error**: Mở DevTools (F12) → xem Console
4. **Không extract content**: Trang web có thể dùng selector khác

---

## 📚 Tài Liệu Chi Tiết

- 📖 `README.md` - Hướng dẫn đầy đủ
- ✅ `TEST_GUIDE.md` - 8 bước test chi tiết  
- 📋 `CHANGELOG.md` - Tóm tắt thay đổi
- 📊 `SUMMARY.md` - Tổng quan hoàn chỉnh

---

**Bắt đầu ngay! ⚡**
