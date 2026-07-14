#!/usr/bin/env node
// CinemaGazer E2E: dev用拡張ビルド
//
// 本体(../)を e2e/dist-dev/ にコピーし、manifest に localhost 向けの
// content_script (core.js + test-adapter.js) を追加する。
// ストア用の manifest.json 本体には一切手を入れない。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(__dirname, 'dist-dev');
const TESTBED = path.join(__dirname, 'testbed');

// testbed の動画が無ければ隣の cinemagazer-mobile からコピー
const MOBILE_TESTBED = path.resolve(ROOT, '..', 'cinemagazer-mobile', 'testbed');
for (const f of ['sample.mp4', 'subs.vtt', 'player.html']) {
  const dst = path.join(TESTBED, f);
  if (!fs.existsSync(dst)) {
    const src = path.join(MOBILE_TESTBED, f);
    if (!fs.existsSync(src)) {
      console.error(`missing ${dst} and no source at ${src}`);
      process.exit(1);
    }
    fs.mkdirSync(TESTBED, { recursive: true });
    fs.copyFileSync(src, dst);
    console.log(`copied ${f} from cinemagazer-mobile/testbed`);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const COPY = ['manifest.json', 'background.js', 'content', 'inject', 'popup', 'icons', '_locales'];
for (const entry of COPY) {
  fs.cpSync(path.join(ROOT, entry), path.join(DIST, entry), { recursive: true });
}

// テスト用アダプタ (mobileリポジトリの assets/engine/test-adapter.js と同内容)
const TEST_ADAPTER = `// CinemaGazer - テスト用アダプタ（E2E検証専用 / ストア配布物には含まれない）
// core.js の isSiteEnabled() は既知アダプタ名しか有効化しないため、
// 既定ONの 'netflix' を名乗って速度切替を走らせる（テスト専用ハック）。
(function () {
  if (!window.CinemaGazer) return;
  window.CinemaGazer.registerAdapter({
    name: 'netflix',
    findVideo: function () { return document.querySelector('video'); },
    subtitleStrategy: 'texttrack-preferred'
  });
  console.log('%c[CinemaGazer] TEST adapter registered', 'color:#3a7;font-weight:bold');
})();
`;
fs.writeFileSync(path.join(DIST, 'content', 'test-adapter.js'), TEST_ADAPTER);

// セグメント配信 (Disney+方式) 検証用アダプタ: interceptorのXHR捕捉 + core.jsのマージを通す
const TEST_ADAPTER_SEG = `// CinemaGazer - セグメントVTTテスト用アダプタ（E2E検証専用）
(function () {
  if (!window.CinemaGazer) return;
  window.CinemaGazer.registerAdapter({
    name: 'netflix', // 既定ONを流用（テスト専用ハック）
    findVideo: function () { return document.querySelector('video'); },
    subtitleStrategy: 'xhr-segmented'
  });
  console.log('%c[CinemaGazer] TEST adapter (xhr-segmented) registered', 'color:#3a7;font-weight:bold');
})();
`;
fs.writeFileSync(path.join(DIST, 'content', 'test-adapter-seg.js'), TEST_ADAPTER_SEG);

// 画像字幕 (Hulu/hulu.jp方式) 検証用アダプタ: 字幕<img>のvisibility監視 (image-presence) を通す。
// hulu.js は happyon.jp のホスト名で字幕画像を判定するが、testbed では別ホストのため
// data-cg-testsub マーカー付き<img>を字幕画像とみなす(検出の幾何条件は hulu.js と同じ)。
const TEST_ADAPTER_IMG = `// CinemaGazer - 画像字幕テスト用アダプタ（E2E検証専用）
(function () {
  if (!window.CinemaGazer) return;
  function findVideo() { return document.querySelector('video'); }
  function subtitleImages() {
    try {
      var v = findVideo(); if (!v) return [];
      var vr = v.getBoundingClientRect(); if (!vr.width || !vr.height) return [];
      var out = [];
      var imgs = document.querySelectorAll('img[data-cg-testsub]');
      for (var i = 0; i < imgs.length; i++) {
        var r = imgs[i].getBoundingClientRect();
        if (r.width < vr.width * 0.3) continue;
        if (r.top < vr.top + vr.height * 0.4) continue;
        var cs = getComputedStyle(imgs[i]);
        if (cs.visibility === 'visible' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.1) out.push(imgs[i]);
      }
      return out;
    } catch (e) { return []; }
  }
  function isSubtitleImageVisible() { return subtitleImages().length > 0; }
  function restoreNativeSubtitles() {
    var imgs = document.querySelectorAll('img[data-cg-testsub]');
    for (var i = 0; i < imgs.length; i++) { imgs[i].style.removeProperty('clip-path'); imgs[i].style.removeProperty('-webkit-clip-path'); }
  }
  window.CinemaGazer.registerAdapter({
    name: 'netflix', // 既定ONを流用（テスト専用ハック）
    findVideo: findVideo,
    subtitleStrategy: 'image-presence',
    isSubtitleImageVisible: isSubtitleImageVisible,
    getSubtitleImages: subtitleImages,
    restoreNativeSubtitles: restoreNativeSubtitles
  });
  console.log('%c[CinemaGazer] TEST adapter (image-presence) registered', 'color:#3a7;font-weight:bold');
})();
`;
fs.writeFileSync(path.join(DIST, 'content', 'test-adapter-img.js'), TEST_ADAPTER_IMG);

// ホットリロード用 content script（dev専用）。dev-server.js の /cg-reload を
// ポーリングし、トークン変化で background 経由 chrome.runtime.reload() を起こす。
// これにより chrome://extensions の手動↻が不要になる（dev-server常駐が前提）。
const DEV_PORT = Number(process.env.DEV_PORT || 8124);
const HOTRELOAD = `// CinemaGazer DEV hot-reload（ストア配布物には含まれない）
(function () {
  var URL = 'http://localhost:${DEV_PORT}/cg-reload';
  var last = null;
  setInterval(function () {
    if (!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id)) return; // 旧context
    fetch(URL, { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (v) {
      if (last !== null && v !== last) {
        try { chrome.runtime.sendMessage({ type: 'CG_DEV_RELOAD' }); } catch (e) {}
      }
      last = v;
    }).catch(function () {});
  }, 1500);
})();
`;
fs.writeFileSync(path.join(DIST, 'content', 'dev-hotreload.js'), HOTRELOAD);

// background(service worker)に CG_DEV_RELOAD → chrome.runtime.reload() を追記（dist側のみ）
fs.appendFileSync(path.join(DIST, 'background.js'),
  '\n// --- DEV hot-reload (build-dev-ext.js が付与 / ストア配布物には無い) ---\n' +
  'try { chrome.runtime.onMessage.addListener(function (m) {\n' +
  '  if (m && m.type === "CG_DEV_RELOAD") { console.log("[CinemaGazer DEV] reloading extension"); chrome.runtime.reload(); }\n' +
  '}); } catch (e) {}\n');

const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
manifest.name = 'CinemaGazer DEV (e2e)';
// match pattern はポート非対応（ポートは常に無視される）ので host のみ指定。
// /seg/ 配下はセグメント配信テスト用に別アダプタを注入するため、パスで出し分ける。
// 注: matchパターンのpathはクエリ文字列込みで照合されるため末尾 * が必要
manifest.content_scripts.push({
  matches: ['http://localhost/player.html*', 'http://127.0.0.1/player.html*'],
  js: ['content/core.js', 'content/test-adapter.js'],
  css: ['content/overlay.css'],
  run_at: 'document_start',
  all_frames: false
});
manifest.content_scripts.push({
  matches: ['http://localhost/seg/*', 'http://127.0.0.1/seg/*'],
  js: ['content/core.js', 'content/test-adapter-seg.js'],
  css: ['content/overlay.css'],
  run_at: 'document_start',
  all_frames: false
});
// 画像字幕テスト (/img/ 配下) は image-presence アダプタを注入
manifest.content_scripts.push({
  matches: ['http://localhost/img/*', 'http://127.0.0.1/img/*'],
  js: ['content/core.js', 'content/test-adapter-img.js'],
  css: ['content/overlay.css'],
  run_at: 'document_start',
  all_frames: false
});
// セグメントテストはXHR捕捉が本体なので interceptor をMAIN worldで注入
manifest.content_scripts.push({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  js: ['inject/interceptor.js'],
  run_at: 'document_start',
  all_frames: false,
  world: 'MAIN'
});
// core.js が injectInterceptor() で interceptor.js を挿すため、localhost も許可
// （MAIN worldエントリと二重になるが __cgInterceptorInstalled ガードで冪等）
manifest.web_accessible_resources.push({
  resources: ['inject/interceptor.js'],
  matches: ['http://localhost/*', 'http://127.0.0.1/*']
});
// hot-reload ポーラーを検証対象サイト＋localhostで動かす（生きたタブが1つあればトリガー可）
manifest.content_scripts.push({
  matches: [
    'http://localhost/*', 'http://127.0.0.1/*',
    '*://*.disneyplus.com/*',
    '*://*.netflix.com/*',
    '*://*.primevideo.com/*', '*://*.amazon.co.jp/*', '*://*.amazon.com/*',
    '*://*.hulu.jp/*', '*://*.hulu.com/*',
    '*://*.unext.jp/*'
  ],
  js: ['content/dev-hotreload.js'],
  run_at: 'document_idle',
  all_frames: false
});
// content script から localhost:8124 への fetch 用（CORSはdev-serverが許可）
manifest.host_permissions = (manifest.host_permissions || []).concat([
  'http://localhost/*', 'http://127.0.0.1/*'
]);
fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`dev extension built at ${DIST}`);
