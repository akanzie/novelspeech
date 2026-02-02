# Project Structure Guide

## New Directory Layout

```
My Extension/
│
├── 📋 Configuration
│   └── manifest.json              v1.0.3 - Extension metadata & permissions
│
├── 📁 src/                        Source code (organized by function)
│   │
│   ├── 📁 core/                   Core TTS & content logic
│   │   └── content.js             Main engine - 398 lines
│   │                              • extractContent() - Get text from page
│   │                              • speak() - TTS engine with highlight
│   │                              • goToNextChapter() - Auto-navigate
│   │                              • goToPreviousChapter() - Go back
│   │                              • updateVoiceList() - Find Vietnamese voice
│   │                              • clearHighlight() - Remove text highlight
│   │
│   ├── 📁 ui/                     User interface
│   │   ├── popup.html             ~57 lines - UI layout & controls
│   │   │                          • Start/Stop buttons
│   │   │                          • Previous/Next chapter buttons
│   │   │                          • Speed/Pitch/Volume sliders
│   │   │                          • Voice selector dropdown
│   │   │
│   │   ├── popup.js               ~147 lines - Event handlers & messaging
│   │   │                          • sendToContentScript() - Message bridge
│   │   │                          • Button click handlers
│   │   │                          • Slider input handlers
│   │   │                          • Auto-inject fallback
│   │   │
│   │   └── popup.css              ~131 lines - Styling
│   │                              • Purple gradient theme
│   │                              • Button styles (primary, danger, secondary)
│   │                              • Control group layout
│   │                              • Slider & select styling
│   │
│   ├── 📁 logger/                 Logging & debugging system
│   │   ├── logger.js              ~117 lines - Logger class
│   │   │                          • add() - Add log entry
│   │   │                          • log/error/warn/success() - Convenience methods
│   │   │                          • saveToStorage() - Persist to chrome.storage.local
│   │   │                          • notifyDebugPage() - Send updates to UI
│   │   │
│   │   ├── debug.html             ~140 lines - Debug interface
│   │   │                          • Real-time log display
│   │   │                          • Stats counters (total, errors, warnings)
│   │   │                          • Control buttons (refresh, download, copy, clear)
│   │   │                          • Auto-updating log list
│   │   │
│   │   └── debug.js               ~130 lines - Debug controller
│   │                              • loadLogs() - Retrieve from storage
│   │                              • displayLogs() - Render HTML
│   │                              • downloadLogs() - Export to .txt
│   │                              • copyToClipboard() - Copy formatted logs
│   │                              • clearLogs() - Delete all logs
│   │
│   └── 📁 background/             Service worker
│       └── background.js          ~20 lines - Message relay
│                                  • chrome.runtime.onMessage listener
│                                  • updateStatus relay
│                                  • openDebugPage handler
│
├── 📁 docs/                       Documentation
│   ├── README.md                  Main guide
│   ├── QUICKSTART.md              5-minute setup
│   ├── TEST_GUIDE.md              Comprehensive testing (8 steps)
│   ├── CHANGELOG.md               Version history & changes
│   ├── SUMMARY.md                 Complete project overview
│   ├── PROJECT_STRUCTURE.md       Detailed file descriptions
│   ├── COMPLETION.md              Completion status
│   └── INDEX.md                   Documentation index
│
└── 📄 Root Files
    ├── README.md                  Main documentation (root)
    ├── .gitignore                 Git exclusions
    └── STRUCTURE.md               This file
```

## File Organization Principles

### src/core/
- **Purpose**: Core extension logic
- **Responsibility**: TTS engine, content extraction, navigation
- **No UI code**: Pure logic only
- **Loaded by**: Content script injection (manifest)

### src/ui/
- **Purpose**: User interface
- **Responsibility**: Popup HTML/CSS/JS for user interaction
- **Event handling**: Button clicks, slider changes
- **Messaging**: Bridge to content script
- **CSS localized**: All styling in popup.css

### src/logger/
- **Purpose**: Debugging & monitoring
- **Responsibility**: Log persistence, debug UI
- **Storage**: chrome.storage.local (survives reload)
- **Debug Page**: Accessible via chrome-extension://[ID]/src/logger/debug.html

### src/background/
- **Purpose**: Service worker
- **Responsibility**: Message relay, background tasks
- **Minimal**: Only necessary handlers

### docs/
- **Purpose**: User and developer documentation
- **Kept separate**: Easy to maintain and update
- **Multiple views**: Quick start, comprehensive guide, API docs

## Path References in Code

### manifest.json
```json
{
  "action": {
    "default_popup": "src/ui/popup.html"
  },
  "background": {
    "service_worker": "src/background/background.js"
  },
  "content_scripts": [
    {
      "js": ["src/logger/logger.js", "src/core/content.js"]
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["src/logger/debug.html", "src/logger/debug.js"]
    }
  ]
}
```

### popup.html
```html
<script src="../logger/logger.js"></script>
<script src="popup.js"></script>
```

### popup.js (inject files)
```javascript
files: ['src/logger/logger.js', 'src/core/content.js']
```

## Dependencies Flow

```
popup.html
    ↓ loads
popup.js ← requires → logger.js
    ↓ sends message
content.js ← requires → logger.js
    ↓ uses
chrome.storage.local
    ↑ reads from
debug.html → debug.js
```

## Adding New Features

### New UI Element
1. Add HTML to `src/ui/popup.html`
2. Add CSS to `src/ui/popup.css`
3. Add JS handler in `src/ui/popup.js`
4. Send message to content script

### New Core Function
1. Add function to `src/core/content.js`
2. Add message listener in message handler
3. Call logger for events
4. Add button/trigger in popup

### New Logger Method
1. Add method to `Logger` class in `src/logger/logger.js`
2. Update debug display if needed in `src/logger/debug.js`
3. Call logger.newMethod() in code

## File Sizes

| File | Size | Lines |
|------|------|-------|
| content.js | 14KB | 398 |
| popup.js | 5KB | 147 |
| popup.html | 2KB | 57 |
| popup.css | 4KB | 131 |
| logger.js | 4KB | 117 |
| debug.html | 5KB | 140 |
| debug.js | 4KB | 130 |
| background.js | 1KB | 23 |
| **Total Code** | **~39KB** | **~1,143** |

## Maintenance Notes

- **Keep separation**: Don't mix UI and core logic
- **Logger everywhere**: Use logger.log/error/warn/success
- **Path consistency**: Always use correct relative paths
- **Documentation**: Update README when adding features
- **Testing**: Test in debug page before deploying

## Version History

- **v1.0.0**: Initial release
- **v1.0.1**: Fixed content script injection
- **v1.0.2**: Added logger system
- **v1.0.3**: Refactored structure, added highlight & navigation

---

**Last Updated**: February 2026
