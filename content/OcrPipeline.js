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
          const dims = this.getCanvasDimensions(node);
          const area = dims.width * dims.height;
          if (area >= settings.minCanvasArea) {
            this.log?.('OCR canvas bat dau', 'info', {
              width: dims.width,
              height: dims.height,
              area,
              minCanvasArea: settings.minCanvasArea
            });
            const text = await this.ocrCanvas(node, settings);
            this.log?.('OCR canvas xong', 'info', {
              width: dims.width,
              height: dims.height,
              area,
              textPreview: (text || '').slice(0, 120)
            });
            if (text) {
              blocks.push({
                id: `ocr-${index++}`,
                type: 'ocr',
                content: text
              });
            }
          } else {
            this.log?.('Bo qua canvas nho', 'info', {
              width: dims.width,
              height: dims.height,
              area,
              minCanvasArea: settings.minCanvasArea
            });
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
      const source = canvas?.__novelSpeechSourceCanvas || canvas;
      return this.ocr.recognizeCanvas(source, settings);
    }

    async ocrImage(img, settings) {
      if (!this.ocr) return '';
      return this.ocr.recognizeImage(img, settings);
    }

    getCanvasDimensions(canvas) {
      const width = canvas?.width || canvas?.getBoundingClientRect?.().width || 0;
      const height = canvas?.height || canvas?.getBoundingClientRect?.().height || 0;
      return { width, height };
    }
  }

  if (typeof window !== 'undefined') {
    window.OcrPipeline = OcrPipeline;
  }
})();
