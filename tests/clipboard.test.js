import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { copyDocumentTitleToClipboard, copyPngToClipboard, focusClipboardTab } from "../clipboard.js";
import { explainError } from "../capture.js";

test("clipboard focus follows the original tab even if it moved to a new window", async () => {
  const calls = [];
  const api = {
    tabs: { update: async (id, options) => {
      calls.push(["tab", id, options]);
      return { id, windowId: 8 };
    } },
    windows: { update: async (id, options) => { calls.push(["window", id, options]); } }
  };
  await focusClipboardTab(api, { id: 42, windowId: 7 });
  assert.deepEqual(calls, [
    ["tab", 42, { active: true }],
    ["window", 8, { focused: true }]
  ]);
});

test("a closed copy target does not focus an unrelated window", async () => {
  await assert.rejects(focusClipboardTab({
    tabs: { update: async () => { throw new Error("Tab closed"); } },
    windows: { update: async () => assert.fail("must not focus another window") }
  }, { id: 42, windowId: 7 }), /Tab closed/);
});

for (const [name, func, args] of [
  ["PNG", copyPngToClipboard, ["data:image/png;base64,VIEW"]],
  ["title", copyDocumentTitleToClipboard, []]
]) {
  for (const mode of ["focused", "immediate", "delayed", "denied"]) {
    test(`${name} copy handles ${mode} page focus after script serialization`, async () => {
      let focused = mode === "focused", focusRequests = 0, waits = 0, writes = 0;
      const write = async () => {
        assert.equal(focused, true, "never write before focus returns");
        writes += 1;
      };
      // executeScript receives only the function body, without module helpers.
      const injected = runInNewContext(`(${func.toString()})`, {
        document: { title: "Example", hasFocus: () => focused },
        window: { focus: () => {
          focusRequests += 1;
          if (mode === "immediate") focused = true;
        } },
        navigator: { clipboard: { write, writeText: write } },
        ClipboardItem: class {},
        fetch: async () => ({ blob: async () => ({ type: "image/png" }) }),
        setTimeout: (callback) => {
          waits += 1;
          if (mode === "delayed" && waits === 2) focused = true;
          callback();
        }
      });
      const result = await injected(...args);
      assert.equal(focusRequests, mode === "focused" ? 0 : 1);
      assert.equal(result.ok, mode !== "denied");
      assert.equal(writes, mode === "denied" ? 0 : 1);
      if (mode === "denied") {
        assert.equal(waits, 20);
        assert.match(result.error, /対象ページをクリック/);
        assert.doesNotMatch(explainError(new Error(result.error)), /撮影できませんでした|開発者ツール/);
      }
      if (mode === "delayed") assert.equal(waits, 2);
    });
  }
}
