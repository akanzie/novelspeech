# 📖 Truyện Nói - Chrome Extension

Đọc nội dung truyện web tự động bằng Web Speech API. Hỗ trợ highlight realtime, điều chỉnh tốc độ/cao độ/âm lượng, tự động chuyển chương.

## 📁 Project Structure

```
My Extension/
├── 📄 manifest.json              # Extension configuration
├── 📄 README.md                  # This file
│
├── 📁 src/                       # Source code
│   ├── 📁 core/
│   │   └── content.js            # Main TTS engine & content extraction
│   │
│   ├── 📁 ui/
│   │   ├── popup.html            # Extension popup interface
│   │   ├── popup.js              # Popup logic & messaging
│   │   └── popup.css             # Popup styling
│   │
│   ├── 📁 logger/
│   │   ├── logger.js             # Logger class with persistence
│   │   ├── debug.html            # Debug UI
│   │   └── debug.js              # Debug controller
│   │
│   └── 📁 background/
│       └── background.js         # Service worker
│
└── 📁 docs/                      # Documentation
    ├── QUICKSTART.md             # Quick start guide
    ├── TEST_GUIDE.md             # Testing guide
    ├── CHANGELOG.md              # Version history
    ├── SUMMARY.md                # Project summary
    ├── PROJECT_STRUCTURE.md      # File descriptions
    ├── COMPLETION.md             # Completion status
    └── INDEX.md                  # Documentation index
```

## 🚀 Quick Start

### Install
1. `chrome://extensions` → Enable Developer Mode
2. Click "Load unpacked"
3. Select this folder
4. Done! Extension appears in toolbar

### Use
1. Open any webpage with content
2. Click extension icon
3. Click "▶️ Bắt Đầu" to start reading
4. Adjust speed/pitch/volume as needed
5. Use "⬅️ Chương Trước" / "Chương Tiếp ➡️" to navigate

### Debug
- Open debug page: `chrome-extension://[ID]/src/logger/debug.html`
- Or click "🐛 Xem Log" in popup
- View real-time logs and statistics

## 🎯 Features

✅ **Text-to-Speech**
- Web Speech API (free, no API keys)
- Vietnamese voice auto-detection
- Speed: 0.5x - 2.0x
- Pitch: 0.5 - 2.0
- Volume: 0% - 100%

✅ **Content Extraction**
- Auto-detect chapter content
- Start from paragraph 2 (skip title)
- Stop at "-----" delimiter
- Multiple selector fallbacks

✅ **Navigation**
- Previous/Next chapter buttons
- Auto-navigate after completion
- URL pattern matching (chuong-N)

✅ **Logging & Debug**
- Persistent log storage
- Real-time debug UI
- Download/Copy/Clear logs
- Stats (total, errors, warnings, success)

✅ **UX**
- Yellow highlight for current text
- Auto-scroll to reading position
- Real-time status updates
- Keyboard-friendly controls

## 📝 Documentation

See `docs/` folder for:
- [QUICKSTART.md](docs/QUICKSTART.md) - 5 min setup
- [TEST_GUIDE.md](docs/TEST_GUIDE.md) - 8-step test
- [CHANGELOG.md](docs/CHANGELOG.md) - v1.0.3 changes
- [INDEX.md](docs/INDEX.md) - Doc navigation

## 🔧 Development

### File Organization

**src/core/**
- Content extraction logic
- TTS engine
- Chapter navigation
- Logging integration

**src/ui/**
- Extension popup HTML
- Popup event handlers
- UI styling
- Message sending to content script

**src/logger/**
- Logger class
- Debug UI interface
- Debug data display

**src/background/**
- Service worker
- Message relay
- Debug page opening

### Key Functions

#### content.js
```javascript
extractContent()      // Extract text from webpage
speak(text)          // TTS engine
goToNextChapter()    // Navigate to next chapter
goToPreviousChapter()// Navigate to previous chapter
updateVoiceList()    // Find Vietnamese voice
clearHighlight()     // Remove text highlight
```

#### popup.js
```javascript
sendToContentScript()    // Send message to content
updateStatusDisplay()    // Update popup status
Button event listeners   // Handle UI interactions
```

#### logger.js
```javascript
logger.log(msg)      // Info log
logger.error(msg)    // Error log
logger.warn(msg)     // Warning log
logger.success(msg)  // Success log
```

## 🐛 Troubleshooting

### Extension not loading?
- Reload: `chrome://extensions` → Reload
- Check console: F12 → Console tab

### No Vietnamese voice?
- Extension auto-detects Vietnamese voice
- Falls back to system default
- Check debug page for available voices

### Content not extracting?
- Open debug page
- Check logs for selector info
- Verify content structure
- Try different selector in code

## 📊 Statistics

| Item | Count |
|------|-------|
| Source Files | 8 |
| Documentation | 8 |
| Total Lines | 1000+ |
| Logger Calls | 50+ |
| CSS Classes | 2 |

## 📦 Build Info

- **Manifest Version**: 3 (MV3)
- **Target**: Chrome/Edge
- **No Dependencies**: Pure vanilla JS
- **Size**: ~50KB

## 🎓 Learning Resources

### Chrome Extension APIs Used
- `chrome.tabs.query()` - Get active tab
- `chrome.tabs.sendMessage()` - Send message to content script
- `chrome.scripting.executeScript()` - Inject scripts
- `chrome.storage.local` - Persist logs
- `chrome.runtime.onMessage` - Listen for messages

### Web APIs Used
- `Web Speech API` - Text-to-speech
- `DOM API` - DOM manipulation & querying
- `postMessage API` - Cross-origin messaging

## 📞 Support

For issues or questions:
1. Check `docs/TEST_GUIDE.md`
2. Open debug page for logs
3. Review code comments
4. Check Chrome console (F12)

## 📄 License

MIT License - Free for personal use

---

**Version**: 1.0.3  
**Last Updated**: February 2026  
**Status**: ✅ Ready for use
