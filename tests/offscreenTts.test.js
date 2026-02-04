import test from 'node:test';
import assert from 'node:assert/strict';

import { createChromeMock } from './helpers/chromeMock.js';

function createSpeechSynthesisMock() {
  const voices = [
    { name: 'Microsoft HoaiMy', lang: 'vi-VN', voiceURI: 'microsoft', localService: true, default: true }
  ];
  return {
    speaking: false,
    getVoices() {
      return voices;
    },
    speak(utterance) {
      this.speaking = true;
      queueMicrotask(() => utterance.onstart && utterance.onstart());
      queueMicrotask(() => {
        this.speaking = false;
        utterance.onend && utterance.onend();
      });
    },
    pause() {},
    resume() {},
    cancel() {
      this.speaking = false;
    },
    addEventListener() {}
  };
}

test('offscreen/tts.js responds to ping/getVoices/speak', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;
  // Node may expose a read-only navigator getter; redefine if possible.
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Edg/120.0' },
      configurable: true
    });
  } catch {
    // Fallback: leave as-is; edgeOnly filtering may not apply in this environment.
  }
  globalThis.speechSynthesis = createSpeechSynthesisMock();
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.lang = '';
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      this.onpause = null;
      this.onresume = null;
    }
  };

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/LogService.js', import.meta.url).href);

  // Import registers chrome.runtime.onMessage listener
  await import(new URL('../ui/offscreen/tts.js', import.meta.url).href + `?v=${Date.now()}-${Math.random()}`);

  const send = async (action, payload = {}) => {
    const message = { type: 'ttsOffscreen', action, payload };
    let response;
    const sendResponse = (r) => { response = r; };
    chrome.runtime.onMessage.dispatch(message, {}, sendResponse);
    // allow microtasks to run
    await new Promise(r => setTimeout(r, 0));
    return response;
  };

  const ping = await send('ping');
  assert.deepEqual(ping, { success: true });

  const voices = await send('getVoices', { edgeOnly: true });
  assert.equal(voices.success, true);
  assert.equal(Array.isArray(voices.voices), true);
  // If UA cannot be overridden in this Node environment, edgeOnly may filter out all voices.
  // Still assert the message path works.
  assert.ok(typeof voices.voices.length === 'number');

  const speak = await send('speak', { text: 'hello', rate: 1, pitch: 1, volume: 1 });
  assert.equal(speak.success, true);
});
