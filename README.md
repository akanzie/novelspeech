# 📖 Truyện Nói - Chrome Extension v1.1.0

Đọc nội dung truyện web tự động bằng TTS. Hỗ trợ **Web Speech API** & **Microsoft Edge TTS**. Highlight realtime, điều chỉnh tốc độ/cao độ/âm lượng, tự động chuyển chương.

## 🆕 Có Gì Mới trong v1.1.0?

- ✨ **Microsoft Edge TTS** - Auto-detect & fallback
- 🏗️ **Modular Architecture** - 5 modules riêng biệt
- 🔍 **15+ Content Selectors** - Hỗ trợ thêm websites
- 🔗 **7 URL Patterns** - Flexible chapter navigation
- ⚡ **Logger Batch Optimization** - 90% ít messages hơn
- 🔒 **Security Hardening** - Restrict permissions

[→ Xem chi tiết v1.1.0 CHANGELOG](docs/CHANGELOG-v1.1.0.md)

## 📁 Project Structure

```
novelspeech/
├── 📄 manifest.json              # v1.1.0 configuration
├── 📄 README.md                  # This file
│
├── 📁 src/
│   ├── 📁 core/
│   │   ├── tts-engine.js         # TTS + Edge support
│   │   ├── content-extractor.js  # Smart extraction (15+ selectors)
│   │   ├── chapter-navigator.js  # URL navigation (7 patterns)
│   │   ├── highlight-manager.js  # Highlight control
│   │   ├── content-v2.js         # Main controller (modular)
│   │   └── content.js            # [Deprecated] Old version
│   │
│   ├── 📁 ui/
│   │   ├── popup.html            # Extension popup
│   │   ├── popup.js              # Popup logic
│   │   └── popup.css             # Popup styling
│   │
│   ├── 📁 logger/
│   │   ├── logger.js             # Logger (batched + async)
│   │   ├── debug.html            # Debug UI
│   │   └── debug.js              # Debug controller
│   │
│   └── 📁 background/
│       └── background.js         # Service worker
│
└── 📁 docs/
    ├── CHANGELOG-v1.1.0.md       # Detailed v1.1.0 changes
    ├── QUICKSTART.md             # Quick start guide
    ├── TEST_GUIDE.md             # Testing guide
    └── ... (other docs)
```

## 🚀 Quick Start

### Install
1. `chrome://extensions` → Enable Developer Mode
2. Click "Load unpacked"
3. Select this folder
4. Reload extension

### Use
1. Open webpage with content
2. Click extension icon
3. Click "▶️ Bắt Đầu" to start reading
4. Adjust speed/pitch/volume as needed
5. Use chapter navigation buttons

### Debug
- Click "🐛 Xem Log" in popup
- Or open debug page directly: `chrome-extension://[ID]/src/logger/debug.html`
- View real-time logs with batch optimization

## 🎯 Features

✅ **Text-to-Speech (Dual Engine)**
- **Web Speech API** - Standard, widely supported
- **Microsoft Edge TTS** - Better quality on Edge browser
- Auto-detect & fallback mechanism
- Vietnamese voice auto-detection
- Speed: 0.5x - 2.0x
- Pitch: 0.5 - 2.0
- Volume: 0% - 100%

✅ **Smart Content Extraction**
- 15+ selectors for different websites
- Auto-detect chapter content
- Start from paragraph 2 (skip title)
- Stop at "-----" delimiter
- Custom selector support
- Multiple fallback patterns

✅ **Flexible Navigation**
- 7 URL patterns supported
- Previous/Next chapter buttons
- Auto-navigate after completion
- Works with: metruyencv.com, c1.html, p1.html, /123/, etc.

✅ **Advanced Logging & Debug**
- Persistent log storage (chrome.storage.local)
- Batch notifications (200ms debounce)
- Real-time debug UI with stats
- Download/Copy/Clear logs
- Only display 100 latest logs (memory optimization)

✅ **Highlight & Scroll**
- Real-time highlight during reading
- Auto-scroll to reading position
- Smooth animations
- Customizable colors

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
