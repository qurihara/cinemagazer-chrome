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
fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`dev extension built at ${DIST}`);
