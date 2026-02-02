/**
 * Navigation Module
 * Quản lý chuyển chương, URL matching
 */

class ChapterNavigator {
    constructor() {
        this.urlPatterns = [
            { regex: /chuong-(\d+)/i, replacer: 'chuong-{number}' },           // metruyencv.com
            { regex: /chapter[_-](\d+)/i, replacer: 'chapter-{number}' },      // english
            { regex: /c(\d+)(\.html)?$/i, replacer: 'c{number}.html' },        // c1.html
            { regex: /p(\d+)(\.html)?$/i, replacer: 'p{number}.html' },        // p1.html
            { regex: /\/(\d+)\//, replacer: '/{number}/' }                     // /123/
        ];

        logger.log('🔗 Chapter Navigator khởi tạo với ' + this.urlPatterns.length + ' URL patterns');
    }

    // Trích xuất số chương từ URL
    getCurrentChapter() {
        const url = window.location.href;
        logger.log(`🔍 Trích xuất chương từ: ${url}`);

        for (const pattern of this.urlPatterns) {
            const match = url.match(pattern.regex);
            if (match && match[1]) {
                const chapterNum = parseInt(match[1]);
                logger.success(`✓ Tìm thấy chương: ${chapterNum} (pattern: ${pattern.regex})`);
                return {
                    number: chapterNum,
                    pattern: pattern,
                    url: url
                };
            }
        }

        logger.warn('⚠️ Không tìm thấy số chương trong URL');
        return null;
    }

    // Tạo URL chương tiếp theo
    getNextChapterUrl() {
        try {
            const current = this.getCurrentChapter();
            if (!current) {
                logger.error('❌ Không thể xác định chương hiện tại');
                return null;
            }

            const nextNum = current.number + 1;
            const nextUrl = current.url.replace(
                current.pattern.regex,
                current.pattern.replacer.replace('{number}', nextNum)
            );

            logger.success(`➡️ Chương tiếp: ${nextNum}`);
            logger.log(`   URL: ${nextUrl}`);
            return nextUrl;

        } catch (error) {
            logger.error(`❌ Lỗi tạo next URL: ${error.message}`);
            return null;
        }
    }

    // Tạo URL chương trước
    getPreviousChapterUrl() {
        try {
            const current = this.getCurrentChapter();
            if (!current) {
                logger.error('❌ Không thể xác định chương hiện tại');
                return null;
            }

            if (current.number <= 1) {
                logger.warn('⚠️ Đây là chương đầu tiên');
                return null;
            }

            const prevNum = current.number - 1;
            const prevUrl = current.url.replace(
                current.pattern.regex,
                current.pattern.replacer.replace('{number}', prevNum)
            );

            logger.success(`⬅️ Chương trước: ${prevNum}`);
            logger.log(`   URL: ${prevUrl}`);
            return prevUrl;

        } catch (error) {
            logger.error(`❌ Lỗi tạo prev URL: ${error.message}`);
            return null;
        }
    }

    // Điều hướng đến chương
    navigateTo(url) {
        if (!url) {
            logger.error('❌ URL trống');
            return;
        }

        logger.log(`🌐 Điều hướng tới: ${url}`);
        try {
            window.location.href = url;
        } catch (error) {
            logger.error(`❌ Lỗi điều hướng: ${error.message}`);
        }
    }

    // Điều hướng chương tiếp theo
    goNext() {
        const nextUrl = this.getNextChapterUrl();
        if (nextUrl) {
            this.navigateTo(nextUrl);
        }
    }

    // Điều hướng chương trước
    goPrevious() {
        const prevUrl = this.getPreviousChapterUrl();
        if (prevUrl) {
            this.navigateTo(prevUrl);
        }
    }

    // Thêm custom URL pattern
    addPattern(regex, replacer) {
        this.urlPatterns.push({ regex, replacer });
        logger.log(`✓ Thêm URL pattern: ${regex}`);
    }

    // Debug: kiểm tra patterns
    debug() {
        logger.log('🔍 DEBUG: Kiểm tra URL patterns');
        const currentUrl = window.location.href;
        this.urlPatterns.forEach((p, i) => {
            const match = currentUrl.match(p.regex);
            logger.log(`  [${i}] ${match ? '✓' : '✗'} ${p.regex}`);
        });
    }
}

// Tạo instance toàn cục
const chapterNavigator = new ChapterNavigator();
window.chapterNavigator = chapterNavigator;

logger.log('✅ Chapter Navigator khởi tạo xong');
