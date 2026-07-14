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
  // 対応サービスは既定ONにする（v0.3.9〜）。Prime のみ字幕同期がコンテンツ依存で
  // 不安定なため popup ラベルに「実験的」を残す。
  enableNetflix: true,     // Netflix
  enableHulu: true,        // Hulu (hulu.jp, 画像字幕)
  enableDisneyplus: true,  // Disney+
  enablePrime: true        // Prime Video（実験的: サーバサイド広告挿入で字幕がズレることがある）
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
