/**
 * Content Extraction Module - Optimized Version
 */

class ContentExtractor {
    constructor() {
        this.defaultSelectors = [
            '#chapter-content',
            '.chapter-content',
            '.break-words', // Selector phổ biến cho truyện convert
            'article',
            'main',
            '.post-content'
        ];
        logger.log('📖 Content Extractor khởi tạo');
    }

    // --- PHẦN QUAN TRỌNG NHẤT: TRÍCH XUẤT TỪ DIV CHỈ ĐỊNH ---
    extractFromTargetDiv() {
        try {
            logger.log('🔍 Trích xuất từ #chapter-content...');
            
            // Tìm container chính xác
            const container = document.querySelector('#chapter-content.break-words') || 
                             document.querySelector('#chapter-content');
            
            if (!container) {
                logger.warn('⚠️ Không tìm thấy container #chapter-content');
                return null;
            }

            // Clone để không làm hỏng trải nghiệm người dùng trên web
            const clone = container.cloneNode(true);

            // 1. Xóa bỏ các thành phần rác được chèn vào giữa nội dung
            const junkSelectors = [
                'canvas',                // Xóa ảnh canvas chống copy
                '[id^="middle-content"]', // Xóa div quảng cáo (one, two, three...)
                'script', 'style', 'iframe', 'ins',
                '.ads', '.adsbygoogle'
            ];

            junkSelectors.forEach(sel => {
                clone.querySelectorAll(sel).forEach(el => el.remove());
            });

            // 2. Lấy nội dung bằng cách lặp qua tất cả child nodes
            // Điều này hiệu quả hơn innerText khi có <br> tags
            const lines = [];
            const extractText = (node) => {
                if (node.nodeType === 3) { // Text node
                    const text = node.textContent.trim();
                    if (text.length > 0) {
                        lines.push(text);
                    }
                } else if (node.nodeType === 1) { // Element node
                    if (node.tagName === 'BR') {
                        // <br> là dấu ngắt dòng
                        lines.push('\n');
                    } else {
                        // Lặp qua children
                        for (let child of node.childNodes) {
                            extractText(child);
                        }
                    }
                }
            };

            for (let child of clone.childNodes) {
                extractText(child);
            }

            // 3. Nối lại text và lọc dòng trống
            let text = lines.join('');
            const finalLines = text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            if (finalLines.length > 0) {
                logger.success(`✓ Lấy được ${finalLines.length} dòng từ #chapter-content`);
                logger.log(`   Dòng đầu: ${finalLines[0].substring(0, 60)}...`);
                return finalLines.join('\n\n');
            } else {
                logger.warn('⚠️ Không tìm thấy text trong container');
            }
        } catch (e) {
            logger.error('❌ Lỗi xử lý target div: ' + e.message);
        }
        return null;
    }

    // --- CẬP NHẬT HÀM EXTRACT CHÍNH ---
    extract(options = {}) {
        try {
            logger.log('� Bắt đầu trích xuất nội dung...');
            const startLine = options.startLine || 0;
            const stopPatterns = options.stopPatterns || ['---', '***', '____'];

            let text = '';
            let source = '';

            // Bước 1: Thử lấy dữ liệu từ ChapterData (nếu có - nhanh & sạch nhất)
            if (window.chapterData?.content) {
                text = window.chapterData.content;
                source = 'chapterData';
                logger.log('📊 Tìm thấy window.chapterData.content');
                
                // Thử decode base64 nếu cần
                if (text.length > 100 && /^[A-Za-z0-9+/=]+$/.test(text.substring(0, 50))) {
                    logger.log('🔐 Nội dung có vẻ encoded, cố decode...');
                    try {
                        text = atob(text);
                        logger.success('✓ Decode base64 thành công');
                    } catch (e) {
                        logger.warn('⚠️ Decode fail, dùng nội dung gốc');
                    }
                }
            } 
            // Bước 2: Trích xuất trực tiếp từ Div mục tiêu (từ <br> tags)
            else {
                logger.log('🔄 ChapterData không có, thử #chapter-content...');
                text = this.extractFromTargetDiv();
                source = '#chapter-content';
            }

            // Bước 3: Fallback nếu 2 cách trên thất bại
            if (!text || text.length < 50) {
                logger.warn('⚠️ Cách ưu tiên thất bại, thử fallback...');
                const el = this.findContentElement();
                if (el) {
                    text = this.getTextFromElement(el);
                    source = 'fallback-dom';
                    logger.log('📝 Fallback lấy từ DOM element');
                } else {
                    logger.error('❌ Không tìm thấy DOM element');
                }
            }

            if (!text || text.trim().length < 50) {
                const msg = 'Không tìm thấy nội dung truyện (< 50 ký tự)';
                logger.error('❌ ' + msg);
                throw new Error(msg);
            }

            logger.log(`📊 Có nội dung từ: ${source} (${text.length} ký tự)`);

            // Xử lý cắt dòng & lọc nội dung rác (menu, links...)
            let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            logger.log(`📈 Tổng dòng ban đầu: ${lines.length}`);

            // Lọc các dòng menu/author nếu cần
            text = this.removeMenuItems(lines.join('\n'));
            lines = text.split('\n').filter(l => l.length > 0);
            logger.log(`🧹 Sau lọc menu: ${lines.length} dòng`);

            // Xác định vùng cần lấy
            const contentStart = Math.min(startLine, lines.length);
            const subLines = lines.slice(contentStart);
            const stopIndex = this.findStopIndex(subLines, stopPatterns);
            const finalLines = subLines.slice(0, stopIndex);

            if (finalLines.length === 0) {
                throw new Error('Nội dung rỗng sau xử lý');
            }

            logger.success(`✅ Trích xuất thành công: ${finalLines.length} dòng (${finalLines.join(' ').length} ký tự)`);
            logger.log(`   Preview: ${finalLines[0].substring(0, 80)}...`);

            return {
                content: finalLines.join('\n\n'),
                count: finalLines.length,
                source: source
            };

        } catch (error) {
            logger.error(`❌ Trích xuất thất bại: ${error.message}`);
            return null;
        }
    }

    // (Giữ lại các hàm hỗ trợ: findStopIndex, removeMenuItems, findContentElement... của bạn)
    findStopIndex(lines, patterns) {
        for (let i = 0; i < lines.length; i++) {
            if (patterns.some(p => lines[i].includes(p))) return i;
        }
        return lines.length;
    }

    removeMenuItems(text) {
        const keywords = ['trang chủ', 'mục lục', 'đăng nhập', 'bình luận', 'chương tiếp'];
        return text.split('\n')
            .filter(line => !keywords.some(kw => line.toLowerCase().includes(kw)))
            .join('\n');
    }

    // Tìm element nội dung từ các selector mặc định
    findContentElement() {
        logger.log('🔍 Tìm element nội dung...');
        for (const selector of this.defaultSelectors) {
            try {
                const element = document.querySelector(selector);
                if (element && this._isValidContent(element)) {
                    logger.success(`✓ Tìm thấy: "${selector}"`);
                    return element;
                }
            } catch (e) {
                // Bỏ qua selector không hợp lệ
            }
        }
        logger.warn('⚠️ Không tìm thấy selector chuẩn');
        return null;
    }

    // Kiểm tra content hợp lệ
    _isValidContent(element) {
        const text = element.innerText || element.textContent;
        return text && text.trim().length > 50;
    }

    // Lấy text từ element (loại script/style)
    getTextFromElement(element) {
        if (!element) return '';

        // Sao chép element để không ảnh hưởng DOM gốc
        const clone = element.cloneNode(true);

        // Xóa các tag không cần thiết
        const toRemove = clone.querySelectorAll(
            'script, style, iframe, noscript, ' +
            '[style*="display:none"], ' +
            'nav, footer, .sidebar, .ads, [class*="menu"], [class*="advertisement"], ' +
            '.comment, .rating, .related, canvas'
        );
        toRemove.forEach(el => el.remove());

        let text = clone.innerText || clone.textContent;
        return text.trim();
    }
}

const contentExtractor = new ContentExtractor();
window.contentExtractor = contentExtractor;
logger.log('✅ Content Extractor khởi tạo xong');
