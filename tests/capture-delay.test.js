import test from "node:test";
import assert from "node:assert/strict";

test("the screenshot timer holds the capture lock, can be cancelled, and only captures its original tab", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, "performance");
  let clock = 0, timer;
  Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => clock } });
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    timer = { callback, at: clock + delay };
    return timer;
  });
  t.mock.method(globalThis, "clearTimeout", (handle) => {
    if (timer === handle) timer = undefined;
  });
  function advanceTime(ms) {
    clock += ms;
    if (timer && timer.at <= clock) timer.callback();
  }
  const calls = [], badges = [];
  const originalTab = { id: 42, windowId: 7, active: true };
  let activeTab = originalTab;
  let listener, commandListener, status;
  let nextStatus;
  const runtime = {
    id: "pageshot-test",
    getURL: (file) => `chrome-extension://pageshot-test/${file}`,
    getContexts: async () => [],
    onMessage: { addListener: (callback) => { listener = callback; } }
  };
  const api = {
    runtime,
    commands: { onCommand: { addListener: (callback) => { commandListener = callback; } } },
    action: {
      setBadgeText: async ({ text }) => { badges.push(text); },
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {}
    },
    storage: { session: { set: async ({ captureStatus }) => {
      status = captureStatus;
      if (nextStatus?.state === status.state) nextStatus.resolve(status);
    } } },
    tabs: {
      query: async () => [activeTab],
      get: async (id) => ({ ...originalTab, id, active: activeTab.id === id }),
      captureVisibleTab: async (windowId) => { calls.push(["capture", windowId]); return "data:image/png;base64,AA=="; }
    },
    downloads: {
      onChanged: { addListener() {} },
      download: async () => { calls.push(["download"]); return 7; }
    }
  };
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: api });
  t.after(() => {
    Object.defineProperty(globalThis, "performance", originalPerformance);
    if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
    else delete globalThis.chrome;
  });
  await import("../background.js");
  const popup = { id: runtime.id, url: runtime.getURL("popup.html") };
  const send = (message, sender = popup) => new Promise((resolve) => {
    if (listener(message, sender, resolve) !== true) resolve(undefined);
  });
  const waitForStatus = (state) => new Promise((resolve) => { nextStatus = { state, resolve }; });
  const capture = { type: "capture", mode: "viewport", destination: "download" };

  for (const delaySeconds of [-1, 1.5, 61, "3"]) {
    assert.equal((await send({ ...capture, delaySeconds })).ok, false);
  }
  assert.equal((await send({ ...capture, delaySeconds: 60 })).ok, true);
  assert.equal(status.state, "countdown");
  assert.equal(badges.at(-1), "60");
  assert.equal((await send(capture)).ok, false);
  commandListener("capture-viewport", originalTab);
  assert.equal(await send({ type: "capture-cancel" }, { ...popup, url: "https://example.com/" }), undefined);
  assert.equal(status.state, "countdown");
  const cancelled = waitForStatus("cancelled");
  assert.equal((await send({ type: "capture-cancel" })).ok, true);
  await cancelled;
  await new Promise(setImmediate);
  assert.equal(timer, undefined);
  assert.deepEqual(calls, []);

  const switched = waitForStatus("error");
  assert.equal((await send({ ...capture, mode: "fullpage", delaySeconds: 1 })).ok, true);
  activeTab = { ...originalTab, id: 43 };
  advanceTime(1000);
  assert.match((await switched).message, /対象のタブが表示されていない/);
  await new Promise(setImmediate);
  assert.deepEqual(calls, []);

  activeTab = originalTab;
  const saved = waitForStatus("started");
  assert.equal((await send({ ...capture, delaySeconds: 2 })).ok, true);
  advanceTime(1000);
  assert.deepEqual(calls, []);
  advanceTime(1000);
  await saved;
  assert.deepEqual(calls, [["capture", originalTab.windowId], ["download"]]);
  assert.deepEqual(badges.slice(-4), ["2", "1", "…", "↓"]);
});
