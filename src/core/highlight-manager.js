/**
 * Highlight Module
 * Quản lý việc highlight text khi đọc
 */

class HighlightManager {
    constructor() {
        this.currentHighlight = null;
        this.highlightedElements = [];
        this.setupStyles();
        
        logger.log('🎨 Highlight Manager khởi tạo');
    }

    // Thiết lập CSS cho highlight
    setupStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .tts-highlight {
                background-color: #FFD700 !important;
                padding: 2px 4px;
                border-radius: 3px;
                transition: background-color 0.3s ease;
                box-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
            }
            
            .tts-reading-container {
                border-left: 4px solid #FFD700;
                padding-left: 10px;
                margin: 10px 0;
                background-color: #FFFACD;
            }
            
            .tts-highlight-fading {
                opacity: 0.6;
            }
        `;
        
        if (document.head) {
            document.head.appendChild(style);
            logger.log('✓ CSS styles đã thêm');
        }
    }

    // Highlight element
    highlight(element) {
        try {
            if (this.currentHighlight) {
                this.currentHighlight.classList.remove('tts-highlight');
                this.currentHighlight.classList.remove('tts-highlight-fading');
            }

            if (element) {
                element.classList.add('tts-highlight');
                element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
                
                this.currentHighlight = element;
            }
        } catch (error) {
            logger.warn('⚠️ Lỗi highlight: ' + error.message);
        }
    }

    // Highlight từ
    highlightWord(word) {
        try {
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let node;
            const wordRegex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');

            while (node = walker.nextNode()) {
                if (wordRegex.test(node.textContent)) {
                    const span = document.createElement('span');
                    span.className = 'tts-highlight';
                    node.parentNode.replaceChild(span, node);
                    span.appendChild(node);
                    this.highlightedElements.push(span);
                    wordRegex.lastIndex = 0;
                }
            }
        } catch (error) {
            logger.warn('⚠️ Lỗi highlight word: ' + error.message);
        }
    }

    // Xóa tất cả highlight
    clear() {
        try {
            if (this.currentHighlight) {
                this.currentHighlight.classList.remove('tts-highlight');
                this.currentHighlight.classList.remove('tts-highlight-fading');
            }

            this.highlightedElements.forEach(el => {
                el.classList.remove('tts-highlight');
            });

            this.currentHighlight = null;
            this.highlightedElements = [];
            
            logger.log('✓ Đã xóa highlight');
        } catch (error) {
            logger.warn('⚠️ Lỗi xóa highlight: ' + error.message);
        }
    }

    // Fade current highlight
    fadeHighlight() {
        try {
            if (this.currentHighlight) {
                this.currentHighlight.classList.add('tts-highlight-fading');
            }
        } catch (error) {
            logger.warn('⚠️ Lỗi fade: ' + error.message);
        }
    }

    // Scroll to element
    scrollTo(element) {
        try {
            if (element) {
                element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
                logger.log('📍 Scroll tới vị trí đọc');
            }
        } catch (error) {
            logger.warn('⚠️ Lỗi scroll: ' + error.message);
        }
    }
}

// Tạo instance toàn cục
const highlightManager = new HighlightManager();
window.highlightManager = highlightManager;

logger.log('✅ Highlight Manager khởi tạo xong');
