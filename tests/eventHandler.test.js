import test from 'node:test';
import assert from 'node:assert/strict';

import { createChromeMock } from './helpers/chromeMock.js';
import { createFakeLogger, createFakeStateManager, createFakeTTSService, createSpy } from './helpers/fakes.js';

async function importEventHandler() {
  const modUrl = new URL('../background/EventHandler.js', import.meta.url);
  const mod = await import(`${modUrl.href}?v=${Date.now()}-${Math.random()}`);
  return mod.default;
}

test('EventHandler.handleMessage routes all supported message types', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });

  const routes = new Map([
    ['startReading', 'handleStartReading'],
    ['pauseReading', 'handlePauseReading'],
    ['resumeReading', 'handleResumeReading'],
    ['stopReading', 'handleStopReading'],
    ['nextLine', 'handleNextLine'],
    ['prevLine', 'handlePrevLine'],
    ['updateSettings', 'handleUpdateSettings'],
    ['getState', 'handleGetState'],
    ['extractContent', 'handleExtractContent'],
    ['contentExtracted', 'handleContentExtracted'],
    ['highlightLine', 'handleHighlightLine'],
    ['syncState', 'handleSyncState'],
    ['settingsUpdated', 'handleSettingsUpdated'],
    ['prevChapter', 'handleNavigateChapter'],
    ['nextChapter', 'handleNavigateChapter'],
    ['switchChapter', 'handleSwitchChapter'],
    ['getVoices', 'handleGetVoices'],
    ['log', 'handleLog']
  ]);

  const called = [];
  for (const method of new Set(routes.values())) {
    handler[method] = createSpy(async (...args) => {
      called.push({ method, args });
      return { success: true, method };
    });
  }

  for (const [type, method] of routes.entries()) {
    called.length = 0;
    const resp = await handler.handleMessage({ type, data: { x: 1 } }, { tab: { id: 99 } });
    assert.equal(resp.success, true);
    assert.equal(resp.method, method);
    assert.equal(called[0].method, method);
  }

  const unknown = await handler.handleMessage({ type: 'unknownType' }, { tab: { id: 1 } });
  assert.equal(unknown.success, false);
});

test('EventHandler.init wires chrome.runtime.onMessage and replies via sendResponse', async () => {
  const { chrome } = createChromeMock({
    tabsResponder() {
      return { success: true, ready: true };
    }
  });
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: true });
  handler.setLogger(createFakeLogger());
  handler.setStateManager(createFakeStateManager());
  handler.setTTSService(createFakeTTSService());

  let response;
  const sendResponse = (r) => { response = r; };
  const results = chrome.runtime.onMessage.dispatch({ type: 'getState' }, { tab: { id: 1 } }, sendResponse);

  assert.equal(results.includes(true), true);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(response.success, true);
  assert.ok(response.state);
});

test('EventHandler.sendMessageOnce handles "no receiver" lastError as non-fatal', async () => {
  const { chrome } = createChromeMock({
    tabsResponder() {
      chrome.runtime.lastError = { message: 'Receiving end does not exist.' };
      return undefined;
    }
  });
  globalThis.chrome = chrome;
  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });
  handler.setLogger(createFakeLogger());

  const resp = await handler.sendMessageOnce(1, { type: 'ping' });
  assert.equal(resp.success, false);
  assert.equal(resp.ready, false);
});

test('EventHandler.safeSendMessage pings then retries once when not ready', async () => {
  let pingCount = 0;
  const { chrome } = createChromeMock({
    tabsResponder(_tabId, message) {
      if (message.type === 'ping') {
        pingCount += 1;
        return { success: true, ready: pingCount > 1 };
      }
      return { success: true, ok: true };
    }
  });

  globalThis.chrome = chrome;
  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });
  handler.setLogger(createFakeLogger());

  const resp = await handler.safeSendMessage(1, { type: 'extractContent' }, 1);
  assert.equal(resp.success, true);
  assert.equal(pingCount, 2);
});

test('EventHandler.handleContentExtracted updates state and broadcasts CONTENT_EXTRACTED', async () => {
  const { chrome, calls } = createChromeMock();
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });

  const stateManager = createFakeStateManager();
  handler.setStateManager(stateManager);
  handler.setLogger(createFakeLogger());
  handler.setTTSService(createFakeTTSService());

  const resp = await handler.handleContentExtracted({
    chapterUrl: 'https://metruyencv.com/truyen/x/chuong-1',
    chapterTitle: 'Chương 1',
    storyTitle: 'Truyện X',
    totalLines: 10
  }, 1);
  assert.equal(resp.success, true);

  const updates = stateManager._getUpdateCalls();
  assert.equal(updates.length > 0, true);
  assert.equal(calls.runtimeSendMessage.length > 0, true);
  assert.equal(calls.runtimeSendMessage.at(-1).message.type, 'contentExtracted');
});

test('EventHandler.handleSettingsUpdated normalizes + applies appearance to active tab', async () => {
  const { chrome, calls } = createChromeMock({ activeTabId: 5 });
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });
  handler.setLogger(createFakeLogger());
  handler.setStateManager(createFakeStateManager());
  handler.setTTSService(createFakeTTSService());

  const resp = await handler.handleSettingsUpdated({
    general: { highlight: true },
    appearance: { highlightColor: '#fff000', highlightOpacity: 0.2, fontSize: 16 },
    tts: { engine: 'edge', defaultSpeed: 1.2, volume: 80 }
  });

  assert.equal(resp.success, true);
  const last = calls.tabsSendMessage.at(-1);
  assert.equal(last.tabId, 5);
  assert.equal(last.message.type, 'applyAppearance');
});

test('EventHandler.getAdjacentChapterUrl computes next/prev by url pattern', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });

  assert.equal(
    handler.getAdjacentChapterUrl('https://metruyencv.com/truyen/x/chuong-10', 'next'),
    'https://metruyencv.com/truyen/x/chuong-11'
  );
  assert.equal(
    handler.getAdjacentChapterUrl('https://metruyencv.com/truyen/x/chuong-10', 'prev'),
    'https://metruyencv.com/truyen/x/chuong-9'
  );
});

test('EventHandler.handleStartReading rejects start from another tab while playing', async () => {
  const tabContent = {
    1: {
      success: true,
      lines: ['t1-line1', 't1-line2'],
      metadata: { chapterUrl: 'u1', chapterTitle: 'c1', storyTitle: 's1' }
    },
    2: {
      success: true,
      lines: ['t2-line1'],
      metadata: { chapterUrl: 'u2', chapterTitle: 'c2', storyTitle: 's2' }
    }
  };

  const { chrome, calls } = createChromeMock({
    tabsResponder(tabId, message) {
      if (message.type === 'ping') return { success: true, ready: true };
      if (message.type === 'extractContent') return tabContent[tabId];
      return { success: true };
    }
  });
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });
  handler.setLogger(createFakeLogger());
  const stateManager = createFakeStateManager();
  handler.setStateManager(stateManager);
  handler.setTTSService(createFakeTTSService());

  const r1 = await handler.handleStartReading({ startLine: 0 }, 1);
  assert.equal(r1.success, true);
  assert.equal((await stateManager.getState()).tabId, 1);

  const r2 = await handler.handleStartReading({ startLine: 0 }, 2);
  assert.equal(r2.success, false);
  assert.ok(String(r2.error || '').includes('tab khác'));
  assert.equal((await stateManager.getState()).tabId, 1);

  const extractCalls = calls.tabsSendMessage.filter(c => c.message.type === 'extractContent');
  assert.equal(extractCalls.length, 1);
  assert.equal(extractCalls[0].tabId, 1);
});

test('EventHandler.handleStopReading while paused clears tabId and resets state (idempotent)', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });
  handler.setLogger(createFakeLogger());

  const stateManager = createFakeStateManager({
    status: 'paused',
    tabId: 1,
    currentLine: 5,
    autoContinue: true
  });
  handler.setStateManager(stateManager);

  const ttsService = createFakeTTSService();
  // simulate "already stopped" provider: stop returns false
  ttsService.stop = createSpy(() => false);
  handler.setTTSService(ttsService);

  const resp = await handler.handleStopReading();
  assert.equal(resp.success, true);

  const state = await stateManager.getState();
  assert.equal(state.status, 'stopped');
  assert.equal(state.tabId, null);
  assert.equal(state.currentLine, 0);
  assert.equal(state.autoContinue, false);
});

test('EventHandler.handleStartReading sets state to error when extractContent fails (e.g., canvas needs OCR)', async () => {
  const { chrome } = createChromeMock({
    tabsResponder(_tabId, message) {
      if (message.type === 'ping') return { success: true, ready: true };
      if (message.type === 'extractContent') return { success: false, error: 'OCR pipeline khong kha dung' };
      return { success: true };
    }
  });
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });
  handler.setLogger(createFakeLogger());

  const stateManager = createFakeStateManager();
  handler.setStateManager(stateManager);
  handler.setTTSService(createFakeTTSService());

  const resp = await handler.handleStartReading({ startLine: 0 }, 1);
  assert.equal(resp.success, false);
  assert.ok(String(resp.error || '').includes('Trích xuất'));

  const state = await stateManager.getState();
  assert.equal(state.status, 'error');
  assert.equal(state.tabId, null);
});

test('EventHandler.handleStartReading rejects when active tab url is not a chapter url', async () => {
  const { chrome } = createChromeMock({ tabUrl: 'https://metruyencv.com/truyen/x' });
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });
  handler.setLogger(createFakeLogger());
  handler.setStateManager(createFakeStateManager());
  handler.setTTSService(createFakeTTSService());

  const resp = await handler.handleStartReading({ startLine: 0 }, 1);
  assert.equal(resp.success, false);
  assert.ok(String(resp.error || '').includes('metruyencv.com/truyen/x/chuong-y'));
});

test('EventHandler ignores late onEnd after stop (prevents auto-restart)', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });
  handler.setLogger(createFakeLogger());

  const stateManager = createFakeStateManager({
    status: 'playing',
    tabId: 1,
    content: ['a', 'b', 'c'],
    currentLine: 0,
    totalLines: 3,
    settings: { engine: 'edge', rate: 1, pitch: 1, volume: 1 }
  });
  handler.setStateManager(stateManager);

  let capturedSettings = null;
  let resolveSpeak;
  const speakPromise = new Promise((r) => { resolveSpeak = r; });
  const ttsService = {
    ...createFakeTTSService(),
    speak: createSpy(async (_text, settings) => {
      capturedSettings = settings;
      return speakPromise;
    }),
    stop: createSpy(() => true)
  };
  handler.setTTSService(ttsService);

  const reading = handler.startReadingFromCurrentLine();
  await handler.handleStopReading();

  // Late onEnd callback from provider after user stopped
  capturedSettings.onEnd();
  resolveSpeak();

  await reading;
  await new Promise(r => setTimeout(r, 0));

  const state = await stateManager.getState();
  assert.equal(state.status, 'stopped');
  assert.equal(state.currentLine, 0);
});

test('Rapid pause clicks do not push state into error (idempotent pause)', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });
  handler.setLogger(createFakeLogger());

  const stateManager = createFakeStateManager({ status: 'playing', tabId: 1 });
  handler.setStateManager(stateManager);

  const ttsService = createFakeTTSService();
  // First pause succeeds, second pause returns false (already paused).
  let pauseCount = 0;
  ttsService.pause = createSpy(() => {
    pauseCount += 1;
    return pauseCount === 1;
  });
  handler.setTTSService(ttsService);

  const p1 = await handler.handlePauseReading();
  assert.equal(p1.success, true);
  assert.equal((await stateManager.getState()).status, 'paused');

  const p2 = await handler.handlePauseReading();
  assert.equal(p2.success, true);
  assert.equal((await stateManager.getState()).status, 'paused');
});

test('Rapid resume clicks do not push state into error (idempotent resume)', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;

  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const EventHandler = await importEventHandler();
  const handler = new EventHandler({ autoInit: false });
  handler.setLogger(createFakeLogger());

  const stateManager = createFakeStateManager({ status: 'paused', tabId: 1 });
  handler.setStateManager(stateManager);

  const ttsService = createFakeTTSService();
  let resumeCount = 0;
  ttsService.resume = createSpy(() => {
    resumeCount += 1;
    return resumeCount === 1;
  });
  handler.setTTSService(ttsService);

  const r1 = await handler.handleResumeReading();
  assert.equal(r1.success, true);
  assert.equal((await stateManager.getState()).status, 'playing');

  const r2 = await handler.handleResumeReading();
  assert.equal(r2.success, true);
  assert.equal((await stateManager.getState()).status, 'playing');
});
