export async function focusClipboardTab(api, tab) {
  // Use the current window ID in case the tab moved while capturing.
  const activeTab = await api.tabs.update(tab.id, { active: true });
  await api.windows.update(activeTab.windowId, { focused: true });
}

export async function copyPngToClipboard(dataUrl, dependencies = {}) {
  try {
    const fetcher = dependencies.fetcher ?? globalThis.fetch;
    const clipboard = dependencies.clipboard ?? globalThis.navigator?.clipboard;
    const ClipboardItemCtor = dependencies.ClipboardItemCtor ?? globalThis.ClipboardItem;
    if (!clipboard?.write || !ClipboardItemCtor || !fetcher) {
      throw new Error("クリップボードAPIを利用できません。");
    }

    const response = await fetcher(dataUrl);
    const blob = await response.blob();
    if (blob.type !== "image/png") throw new Error("撮影結果がPNGではありません。");

    // Keep this function self-contained: executeScript serializes it alone.
    // Activating the tab/window may leave focus in browser UI (e.g. the address bar).
    const pageDocument = dependencies.document ?? globalThis.document;
    const pageWindow = dependencies.window ?? globalThis.window;
    if (!dependencies.skipFocusCheck && pageDocument) {
      if (!pageDocument.hasFocus()) pageWindow.focus();
      for (let attempt = 0; attempt < 20 && !pageDocument.hasFocus(); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!pageDocument.hasFocus()) throw new Error("クリップボードへのコピーに必要なフォーカスを取得できませんでした。対象ページをクリックして再試行してください。");
    }

    await clipboard.write([new ClipboardItemCtor({ "image/png": blob })]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function copyDocumentTitleToClipboard(dependencies = {}) {
  try {
    const pageDocument = dependencies.document ?? globalThis.document;
    const clipboard = dependencies.clipboard ?? globalThis.navigator?.clipboard;
    const title = pageDocument?.title ?? "";
    if (!title) throw new Error("このページにはタイトルがありません。");
    if (!clipboard?.writeText) throw new Error("クリップボードAPIを利用できません。");

    if (!dependencies.skipFocusCheck) {
      const pageWindow = dependencies.window ?? globalThis.window;
      if (!pageDocument.hasFocus()) pageWindow.focus();
      for (let attempt = 0; attempt < 20 && !pageDocument.hasFocus(); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!pageDocument.hasFocus()) throw new Error("クリップボードへのコピーに必要なフォーカスを取得できませんでした。対象ページをクリックして再試行してください。");
    }

    await clipboard.writeText(title);
    return { ok: true, title };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}
