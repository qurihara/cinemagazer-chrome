// CinemaGazer - background service worker
// MV3 service workerは終了するため状態は保持しない。
// 設定の初期化のみ担当。

const DEFAULTS = {
  enabled: true,
  speechRate: 1.5,    // 音声区間（字幕あり）の再生速度
  silentRate: 4.0,    // 非音声区間（字幕なし）の再生速度
  silentMinGap: 0.4,  // この秒数より長い無字幕区間のみ高速化（短いポーズで切り替えると見づらい）
  overlayEnabled: true,  // 字幕オーバーレイ（centering+fading）。既定 ON（v0.2.13〜）
  overlayFadeMs: 200,
  showHud: true,      // 画面端の現在速度HUD
  subtitleOffset: 0.0, // 字幕の体感ズレを微調整（秒, +で字幕を遅らせる）
  enableNetflix: true,    // Netflix で本拡張を有効化
  enablePrime: false,     // Prime Video（既定OFF: 字幕同期がコンテンツ依存で不安定なため）
  // v0.3.x: 追加サービス（既定OFF。Disney+は動作確認済み、Huluは実験的）
  enableDisneyplus: false, // Disney+
  enableHulu: false        // Hulu (US/JP)
};

// schemaVersion: マイグレーション一度だけ走らせるためのフラグ
const SCHEMA_VERSION = 2;

chrome.runtime.onInstalled.addListener(async (details) => {
  const cur = await chrome.storage.sync.get(null);
  const merged = { ...DEFAULTS, ...cur };

  // v0.2.13 マイグレーション: 旧バージョンの background.js が overlayEnabled:false を
  // 強制保存してしまっていた問題の修正。schemaVersion 未満のユーザーは DEFAULTS の方を採用。
  if (!cur.schemaVersion || cur.schemaVersion < SCHEMA_VERSION) {
    merged.overlayEnabled = DEFAULTS.overlayEnabled;
  }
  merged.schemaVersion = SCHEMA_VERSION;

  await chrome.storage.sync.set(merged);
});

// popup や HUD クリックからのメッセージを処理
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
