// CinemaGazer - background service worker
// MV3 service workerは終了するため状態は保持しない。
// 設定の初期化のみ担当。

const DEFAULTS = {
  enabled: true,
  speechRate: 1.5,    // 発話区間（字幕あり）の再生速度
  silentRate: 4.0,    // 非発話区間（字幕なし）の再生速度
  silentMinGap: 0.4,  // この秒数より長い無字幕区間のみ高速化（短いポーズで切り替えると見づらい）
  overlayEnabled: false, // 字幕オーバーレイ（centering+fading）。既定では無効
  overlayFadeMs: 200,
  showHud: true,      // 画面端の現在速度HUD
  subtitleOffset: 0.0, // 字幕の体感ズレを微調整（秒, +で字幕を遅らせる）
  enableNetflix: true, // Netflix で本拡張を有効化
  enablePrime: false   // Prime Video で本拡張を有効化（既定OFF: 字幕同期がコンテンツ依存で不安定なため）
};

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.sync.get(null);
  const merged = { ...DEFAULTS, ...cur };
  await chrome.storage.sync.set(merged);
});

// popupからのリクエストを各タブにブロードキャスト
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'CG_OPEN_POPUP') {
    // HUDクリックから popup を開く（MV3 では service worker からのみ可）
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup().catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === 'CG_SETTINGS_UPDATED') {
    chrome.tabs.query({}, (tabs) => {
      for (const t of tabs) {
        if (!t.id) continue;
        chrome.tabs.sendMessage(t.id, { type: 'CG_SETTINGS_UPDATED', settings: msg.settings })
          .catch(() => { /* noop */ });
      }
    });
    sendResponse({ ok: true });
    return true;
  }
});
