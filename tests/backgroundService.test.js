import test from 'node:test';
import assert from 'node:assert/strict';

import { createChromeMock } from './helpers/chromeMock.js';
import { createFakeLogger, createFakeStateManager, createFakeTTSService, createSpy } from './helpers/fakes.js';

async function importBackgroundService() {
  const modUrl = new URL('../background/BackgroundService.js', import.meta.url);
  const mod = await import(`${modUrl.href}?v=${Date.now()}-${Math.random()}`);
  return mod.BackgroundService;
}

test('BackgroundService.isTargetChapterUrl matches metruyencv.com/truyen/x/chuong-y', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;
  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const BackgroundService = await importBackgroundService();
  const svc = new BackgroundService({ autoInit: false });

  assert.equal(svc.isTargetChapterUrl('https://metruyencv.com/truyen/x/chuong-1'), true);
  assert.equal(svc.isTargetChapterUrl('https://metruyencv.com/truyen/x/chuong-1/'), true);
  assert.equal(svc.isTargetChapterUrl('https://metruyencv.com/truyen/x'), false);
  assert.equal(svc.isTargetChapterUrl('https://metruyencv.com/'), false);
  assert.equal(svc.isTargetChapterUrl('https://example.com/truyen/x/chuong-1'), false);
});

test('BackgroundService.handleAlarm routes to auto-save / cleanup', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;
  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const BackgroundService = await importBackgroundService();
  const svc = new BackgroundService({ autoInit: false });

  svc.runAutoSave = createSpy(async () => {});
  svc.runCleanupCache = createSpy(async () => {});

  await svc.handleAlarm({ name: 'auto-save-state' });
  await svc.handleAlarm({ name: 'cleanup-ocr-cache' });
  await svc.handleAlarm({ name: 'unknown' });

  assert.equal(svc.runAutoSave.calls.length, 1);
  assert.equal(svc.runCleanupCache.calls.length, 1);
});

test('BackgroundService.setupLifecycleListeners wires chrome events to handlers', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;
  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const BackgroundService = await importBackgroundService();
  const svc = new BackgroundService({ autoInit: false });
  svc.setups = [];
  svc.logger = createFakeLogger();

  svc.clearOcrCacheOnShutdown = createSpy(async () => {});
  svc.handleStartup = createSpy(async () => {});
  svc.handleTabUpdated = createSpy(async () => {});
  svc.handleTabRemoved = createSpy(async () => {});
  svc.handleWebNavigationCompleted = createSpy(async () => {});
  svc.startFromBeginning = createSpy(async () => {});

  svc.setupLifecycleListeners();

  chrome.runtime.onSuspend.dispatch();
  await Promise.resolve();
  assert.equal(svc.clearOcrCacheOnShutdown.calls.length, 1);

  chrome.runtime.onStartup.dispatch();
  await Promise.resolve();
  assert.equal(svc.handleStartup.calls.length, 1);

  chrome.action.onClicked.dispatch({ id: 1, url: 'https://metruyencv.com/truyen/x/chuong-1' });
  await Promise.resolve();
  assert.equal(svc.startFromBeginning.calls.length, 1);

  chrome.tabs.onUpdated.dispatch(10, { status: 'complete' }, { url: 'https://metruyencv.com/truyen/x/chuong-1' });
  await Promise.resolve();
  assert.equal(svc.handleTabUpdated.calls.length, 1);

  chrome.tabs.onUpdated.dispatch(11, { status: 'loading' }, { url: 'https://metruyencv.com/truyen/x/chuong-1' });
  await Promise.resolve();
  assert.equal(svc.handleTabUpdated.calls.length, 1);

  chrome.tabs.onRemoved.dispatch(12);
  await Promise.resolve();
  assert.equal(svc.handleTabRemoved.calls.length, 1);

  chrome.webNavigation.onCompleted.dispatch({ url: 'https://metruyencv.com/truyen/x/chuong-1', tabId: 99 });
  await Promise.resolve();
  assert.equal(svc.handleWebNavigationCompleted.calls.length, 1);
});

test('BackgroundService.handleInstall calls setupDefaultSettings on install', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;
  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const BackgroundService = await importBackgroundService();
  const svc = new BackgroundService({ autoInit: false });
  svc.logger = createFakeLogger();
  svc.setupDefaultSettings = createSpy(async () => {});
  svc.migrateSettings = createSpy(async () => {});

  svc.handleInstall();
  chrome.runtime.onInstalled.dispatch({ reason: 'install' });
  chrome.runtime.onInstalled.dispatch({ reason: 'update' });
  await Promise.resolve();

  assert.equal(svc.setupDefaultSettings.calls.length, 1);
  assert.equal(svc.migrateSettings.calls.length, 1);
});

test('BackgroundService.handleTabUpdated refreshes state content and resumes reading when playing', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;
  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const BackgroundService = await importBackgroundService();
  const stateManager = createFakeStateManager({
    status: 'playing',
    chapterUrl: 'https://metruyencv.com/truyen/x/chuong-1',
    currentLine: 3,
    totalLines: 5,
    content: ['a', 'b', 'c', 'd', 'e']
  });

  const eventHandler = {
    extractContentFromTab: createSpy(async () => ({
      success: true,
      lines: ['x', 'y'],
      metadata: { chapterUrl: 'u', chapterTitle: 't', storyTitle: 's' }
    })),
    handleStartReading: createSpy(async () => ({ success: true }))
  };

  const svc = new BackgroundService({
    autoInit: false,
    logger: createFakeLogger(),
    stateManager,
    eventHandler,
    ttsService: createFakeTTSService()
  });

  await svc.handleTabUpdated(1);
  assert.equal(eventHandler.extractContentFromTab.calls.length, 1);
  assert.equal(eventHandler.handleStartReading.calls.length, 1);
});

test('BackgroundService.setupStateListeners broadcasts and saves history on stopped/finished', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;
  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const BackgroundService = await importBackgroundService();

  const stateManager = createFakeStateManager({ status: 'playing' });
  stateManager.saveReadingHistory = createSpy(async () => {});

  const svc = new BackgroundService({
    autoInit: false,
    stateManager,
    eventHandler: {},
    ttsService: createFakeTTSService(),
    logger: createFakeLogger()
  });
  svc.broadcastStateUpdate = createSpy(async () => {});

  svc.setupStateListeners();
  await stateManager.updateState({ status: 'finished' });

  assert.equal(svc.broadcastStateUpdate.calls.length, 1);
  assert.equal(stateManager.saveReadingHistory.calls.length, 1);
});

test('BackgroundService.handleTabUpdated ignores updates from other tabs while playing', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;
  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const BackgroundService = await importBackgroundService();

  const stateManager = createFakeStateManager({
    status: 'playing',
    tabId: 1,
    chapterUrl: 'https://metruyencv.com/truyen/x/chuong-1',
    currentLine: 0,
    totalLines: 2,
    content: ['a', 'b']
  });

  const eventHandler = {
    extractContentFromTab: createSpy(async () => ({ success: true, lines: ['x'], metadata: {} })),
    handleStartReading: createSpy(async () => ({ success: true }))
  };

  const svc = new BackgroundService({
    autoInit: false,
    logger: createFakeLogger(),
    stateManager,
    eventHandler,
    ttsService: createFakeTTSService()
  });

  await svc.handleTabUpdated(2);
  assert.equal(eventHandler.extractContentFromTab.calls.length, 0);

  await svc.handleTabUpdated(1);
  assert.equal(eventHandler.extractContentFromTab.calls.length, 1);
});

test('BackgroundService.handleTabRemoved ignores removal from other tabs', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;
  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const BackgroundService = await importBackgroundService();
  const stateManager = createFakeStateManager({
    status: 'playing',
    tabId: 1,
    chapterUrl: 'https://metruyencv.com/chuong-1'
  });
  const ttsService = createFakeTTSService();

  const svc = new BackgroundService({
    autoInit: false,
    logger: createFakeLogger(),
    stateManager,
    eventHandler: {},
    ttsService
  });

  await svc.handleTabRemoved(2);
  assert.equal(ttsService.stop.calls.length, 0);
  assert.equal(stateManager._getUpdateCalls().length, 0);

  await svc.handleTabRemoved(1);
  assert.equal(ttsService.stop.calls.length, 1);
  assert.equal(stateManager._getUpdateCalls().length > 0, true);
});

test('BackgroundService.handleWebNavigationCompleted ignores other tabs', async () => {
  const { chrome } = createChromeMock();
  globalThis.chrome = chrome;
  await import(new URL('../utils/constants.js', import.meta.url).href);
  await import(new URL('../utils/StorageService.js', import.meta.url).href);

  const BackgroundService = await importBackgroundService();
  const stateManager = createFakeStateManager({
    status: 'playing',
    tabId: 1,
    autoContinue: true
  });

  const eventHandler = {
    handleStartReading: createSpy(async () => ({ success: true }))
  };

  const svc = new BackgroundService({
    autoInit: false,
    logger: createFakeLogger(),
    stateManager,
    eventHandler,
    ttsService: createFakeTTSService()
  });

  await svc.handleWebNavigationCompleted(2);
  assert.equal(eventHandler.handleStartReading.calls.length, 0);

  await svc.handleWebNavigationCompleted(1);
  assert.equal(eventHandler.handleStartReading.calls.length, 1);
});
