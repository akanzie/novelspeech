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
        if (tag === 'img' && settings.useOCRImages) {
          this.log?.('OCR image bat dau', 'info', {
            src: node?.src || node?.getAttribute?.('src') || '',
            naturalWidth: node?.naturalWidth || 0,
            naturalHeight: node?.naturalHeight || 0,
            width: node?.width || 0,
            height: node?.height || 0,
            className: node?.className || '',
            id: node?.id || ''
          });
          const text = await this.ocrImage(node, settings);
          this.log?.('OCR image xong', 'info', {
            textPreview: (text || '').slice(0, 120)
          });
          if (text) {
            blocks.push({
              id: `ocr-${index++}`,
              type: 'ocr',
              content: text
            });
          }
          return;
        }

        if (settings.useOCRImages) {
          const bgUrl = this.getBackgroundImageUrl(node);
          if (bgUrl) {
            this.log?.('OCR background bat dau', 'info', {
              url: bgUrl,
              className: node?.className || '',
              id: node?.id || ''
            });
            const text = await this.ocrImageUrl(bgUrl, settings);
            this.log?.('OCR background xong', 'info', {
              textPreview: (text || '').slice(0, 120)
            });
            if (text) {
              blocks.push({
                id: `ocr-${index++}`,
                type: 'ocr',
                content: text
              });
            }
            return;
          }
        }

        if (tag === 'canvas') {
          const snapshot = this.getCanvasSnapshot(node);
          const dims = this.getCanvasDimensions(node);
          const area = dims.width * dims.height;
          if (area >= settings.minCanvasArea) {
            this.log?.('OCR canvas bat dau', 'info', {
              width: dims.width,
              height: dims.height,
              area,
              minCanvasArea: settings.minCanvasArea,
              hasSourceCanvas: Boolean(node?.__novelSpeechSourceCanvas),
              className: node?.className || '',
              id: node?.id || '',
              snapshotLength: snapshot ? snapshot.length : 0
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

    async ocrImageUrl(url, settings) {
      if (!this.ocr?.recognizeImageUrl) return '';
      return this.ocr.recognizeImageUrl(url, settings);
    }

    getCanvasDimensions(canvas) {
      const width = canvas?.width || canvas?.getBoundingClientRect?.().width || 0;
      const height = canvas?.height || canvas?.getBoundingClientRect?.().height || 0;
      return { width, height };
    }

    getBackgroundImageUrl(node) {
      try {
        if (!node || !window?.getComputedStyle) return '';
        const style = window.getComputedStyle(node);
        const bg = style?.backgroundImage || '';
        if (!bg || bg === 'none') return '';
        const match = bg.match(/url\(["']?([^"')]+)["']?\)/i);
        if (!match || !match[1]) return '';
        return match[1];
      } catch {
        return '';
      }
    }

    getCanvasSnapshot(canvas) {
      if (!canvas) return '';
      this.ensureCanvasSnapshot(canvas);
      const snapshot = canvas.__novelSpeechSnapshot;
      return typeof snapshot === 'string' ? snapshot : '';
    }

    ensureCanvasSnapshot(canvas) {
      if (!canvas || canvas.__novelSpeechSnapshotWatcher) return;
      let lastCapture = 0;
      const capture = () => {
        const now = Date.now();
        if (now - lastCapture >= 800) {
          lastCapture = now;
          try {
            const dataUrl = canvas.toDataURL('image/png');
            if (typeof dataUrl === 'string' && dataUrl.length > 100) {
              canvas.__novelSpeechSnapshot = dataUrl;
              canvas.__novelSpeechSnapshotTime = now;
            }
          } catch {
            // ignore capture errors (tainted canvas, etc.)
          }
        }
        canvas.__novelSpeechSnapshotWatcher = requestAnimationFrame(capture);
      };
      canvas.__novelSpeechSnapshotWatcher = requestAnimationFrame(capture);
    }

    checkCanvasBlank(canvas) {
      try {
        const ctx = canvas?.getContext?.('2d', { willReadFrequently: true });
        if (!ctx) return { isBlank: false, reason: 'no_ctx' };
        const w = canvas.width || 0;
        const h = canvas.height || 0;
        if (!w || !h) return { isBlank: true, reason: 'zero_size' };

        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        if (!data || data.length === 0) return { isBlank: true, reason: 'no_data' };

        const step = Math.max(4, Math.floor(data.length / 4000) & ~3);
        let min = 255;
        let max = 0;
        let alphaMax = 0;

        for (let i = 0; i < data.length; i += step) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          const v = (r + g + b) / 3;
          if (v < min) min = v;
          if (v > max) max = v;
          if (a > alphaMax) alphaMax = a;
          if (min < 10 && max > 245 && alphaMax > 10) {
            return { isBlank: false, reason: 'has_contrast' };
          }
        }

        if (alphaMax === 0) return { isBlank: true, reason: 'transparent' };
        if (max <= 5) return { isBlank: true, reason: 'all_black' };
        if (min >= 250) return { isBlank: true, reason: 'all_white' };
        if (max - min < 5) return { isBlank: true, reason: 'low_contrast' };
        return { isBlank: false, reason: 'unknown' };
      } catch {
        return { isBlank: false, reason: 'tainted_or_error' };
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.OcrPipeline = OcrPipeline;
  }
})();
