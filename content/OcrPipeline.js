/**
 * OcrPipeline - xu ly OCR va build blocks tu DOM
 */

(() => {
  class OcrPipeline {
    constructor(options = {}) {
      this.ocr = options.ocr || null;
      this.log = typeof options.log === 'function' ? options.log : null;
    }

    setOcr(ocr) {
      this.ocr = ocr;
    }

    async ensureReady(settings) {
      if (!this.ocr) return false;
      return this.ocr.ensureReady(settings);
    }

    async buildBlocksWithOCR(container, settings) {
      if (!(await this.ensureReady(settings))) {
        throw new Error('OCR khong kha dung');
      }

      const blocks = [];
      let index = 0;

      const walk = async (node) => {
        if (!node) return;

        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) {
            blocks.push({
              id: `text-${index++}`,
              type: 'text',
              content: text
            });
          }
          return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const tag = node.tagName?.toLowerCase();
        if (tag === 'canvas') {
          const area = node.width * node.height;
          if (area >= settings.minCanvasArea) {
            const text = await this.ocrCanvas(node, settings);
            if (text) {
              blocks.push({
                id: `ocr-${index++}`,
                type: 'ocr',
                content: text
              });
            }
          }
          return;
        }

        if (tag === 'img' && settings.useOCRImages) {
          const text = await this.ocrImage(node, settings);
          if (text) {
            blocks.push({
              id: `ocr-${index++}`,
              type: 'ocr',
              content: text
            });
          }
          return;
        }

        const children = Array.from(node.childNodes);
        for (const child of children) {
          await walk(child);
        }
      };

      await walk(container);

      return blocks;
    }

    buildTextBlocks(container) {
      const blocks = [];
      let index = 0;
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent.trim();
        if (text) {
          blocks.push({
            id: `text-${index++}`,
            type: 'text',
            content: text
          });
        }
      }
      return blocks;
    }

    async ocrCanvas(canvas, settings) {
      if (!this.ocr) return '';
      return this.ocr.recognizeCanvas(canvas, settings);
    }

    async ocrImage(img, settings) {
      if (!this.ocr) return '';
      return this.ocr.recognizeImage(img, settings);
    }
  }

  if (typeof window !== 'undefined') {
    window.OcrPipeline = OcrPipeline;
  }
})();
