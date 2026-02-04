import '../../utils/LogService.js';

const speechSynthesis = globalThis.speechSynthesis;
let currentUtterance = null;
let isSpeaking = false;
let isPaused = false;

function log(message, level = 'INFO', data = {}) {
  if (globalThis.LogService?.log) {
    globalThis.LogService.log('OffscreenTTS', message, level, data);
  }
}

function filterEdgeVoices(voices = [], edgeOnly = false) {
  if (!edgeOnly) return voices;
  const ua = globalThis?.navigator?.userAgent || '';
  const isEdge = ua.includes('Edg/');
  if (!isEdge) return [];
  return voices.filter(v => {
    const name = (v.name || '').toLowerCase();
    const uri = (v.voiceURI || '').toLowerCase();
    return name.includes('microsoft') || name.includes('neural') || uri.includes('microsoft');
  });
}

function pickVietnameseVoice(voices = []) {
  return voices.find(v => v.lang === 'vi-VN' || (v.lang && v.lang.startsWith('vi'))) || null;
}

function getVoicesOnce() {
  if (!speechSynthesis) return [];
  const voices = speechSynthesis.getVoices() || [];
  return voices;
}

function getVoicesWithWait(timeoutMs = 1500) {
  if (!speechSynthesis) return Promise.resolve([]);
  const initial = getVoicesOnce();
  if (initial.length > 0) return Promise.resolve(initial);

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      resolve(getVoicesOnce());
    }, timeoutMs);

    const handler = () => {
      clearTimeout(timer);
      resolve(getVoicesOnce());
    };

    if (typeof speechSynthesis.addEventListener === 'function') {
      speechSynthesis.addEventListener('voiceschanged', handler, { once: true });
    } else {
      const prev = speechSynthesis.onvoiceschanged;
      speechSynthesis.onvoiceschanged = () => {
        if (typeof prev === 'function') prev();
        handler();
      };
    }
  });
}

function stopSpeak() {
  if (!speechSynthesis) return;
  speechSynthesis.cancel();
  currentUtterance = null;
  isSpeaking = false;
  isPaused = false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'ttsOffscreen') return;
  const { action, payload } = message;

  if (!speechSynthesis) {
    sendResponse({ success: false, error: 'speechSynthesis is not available' });
    return;
  }

  if (action === 'getVoices') {
    getVoicesWithWait().then(all => {
      const voices = filterEdgeVoices(all, payload?.edgeOnly);
      sendResponse({ success: true, voices });
    });
    return true;
  }

  if (action === 'ping') {
    sendResponse({ success: true });
    return;
  }

  if (action === 'speak') {
    try {
      stopSpeak();
      const utterance = new SpeechSynthesisUtterance(payload?.text || '');
      const allVoices = getVoicesOnce();
      const voices = filterEdgeVoices(allVoices, true);
      const resolved = payload?.voiceName
        ? voices.find(v => v.name === payload.voiceName)
        : null;
      const vietnamese = pickVietnameseVoice(voices);

      utterance.rate = payload?.rate ?? 1.0;
      utterance.pitch = payload?.pitch ?? 1.0;
      utterance.volume = payload?.volume ?? 1.0;
      utterance.lang = 'vi-VN';
      utterance.voice = resolved || vietnamese || voices[0] || null;

      currentUtterance = utterance;
      utterance.onstart = () => {
        isSpeaking = true;
        isPaused = false;
      };
      utterance.onend = () => {
        isSpeaking = false;
        isPaused = false;
        sendResponse({ success: true });
      };
      utterance.onerror = (event) => {
        isSpeaking = false;
        isPaused = false;
        sendResponse({ success: false, error: event?.error || 'speech error' });
      };
      utterance.onpause = () => {
        isPaused = true;
      };
      utterance.onresume = () => {
        isPaused = false;
      };

      speechSynthesis.speak(utterance);
    } catch (error) {
      sendResponse({ success: false, error: error?.message || String(error) });
    }
    return true;
  }

  if (action === 'pause') {
    if (isSpeaking && !isPaused) {
      speechSynthesis.pause();
      isPaused = true;
    }
    sendResponse({ success: true });
    return;
  }

  if (action === 'resume') {
    if (isSpeaking && isPaused) {
      speechSynthesis.resume();
      isPaused = false;
    }
    sendResponse({ success: true });
    return;
  }

  if (action === 'stop') {
    stopSpeak();
    sendResponse({ success: true });
    return;
  }
});

log('Offscreen TTS ready');
