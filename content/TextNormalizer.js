/**
 * TextNormalizer - xu ly va chuan hoa van ban truyen
 */

(() => {
  class TextNormalizer {
    processText(rawText) {
      if (!rawText || !rawText.trim()) return '';

      let lines = rawText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      lines = this.filterJunkLines(lines);
      lines = this.removeDuplicates(lines);
      return this.groupIntoParagraphs(lines);
    }

    filterJunkLines(lines) {
      const junkRegex = [
        /trang chu|muc luc|dang nhap|chuong truoc|chuong sau|bao loi|quang cao|ads|copyright|ban quyen|facebook|twitter|share|like/i,
        /^chuong\s*\d+\s*$/i,
        /^\d+$/,
        /^[.!?]{3,}$/,
        /^[-_=*]{5,}$/
      ];

      return lines.filter(line => {
        if (line.length < 5) return false;
        if (junkRegex.some(r => r.test(line))) return false;
        return true;
      });
    }

    removeDuplicates(lines) {
      const seen = new Set();
      return lines.filter(line => {
        const norm = line.toLowerCase().replace(/\s+/g, ' ');
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
      });
    }

    groupIntoParagraphs(lines) {
      const paragraphs = [];
      let current = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        current.push(line);

        const isEndOfParagraph =
          /[.!?…]"?$/.test(line) ||
          line.length > 150 ||
          (lines[i + 1] && lines[i + 1].length < 30) ||
          !lines[i + 1];

        if (isEndOfParagraph) {
          paragraphs.push(current.join(' ').trim());
          current = [];
        }
      }

      if (current.length) {
        paragraphs.push(current.join(' ').trim());
      }

      return paragraphs.filter(p => p.length > 10).join('\n\n');
    }
  }

  if (typeof window !== 'undefined') {
    window.TextNormalizer = TextNormalizer;
  }
})();
