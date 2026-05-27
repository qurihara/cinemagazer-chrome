// CinemaGazer - Prime Video adapter
//
// Prime Video は iframe や複数 <video> が出ることがある。
// プレイヤー領域は webPlayer / dv-player-fullscreen / atvwebplayersdk* など。
//
// v0.3.x:
//   - subtitleStrategy: 'texttrack-preferred'
//     Prime はサーバサイド広告挿入 (DAI) によって本編 currentTime が
//     広告分だけ進むので、XHRで取った字幕cue(本編タイムライン基準)が
//     ズレる。<video>.textTracks の cue はブラウザが広告挿入分を考慮した
//     メディア時刻で提供されるため、これを権威ソースとして使う。
//   - isAdPlaying():
//     広告UI（atvwebplayersdk-ad-* / dv-web-player-ad など）が表示されている間は
//     速度変更を停止し、ネイティブ等倍再生に任せる。

(function () {
  if (!window.CinemaGazer) return;

  function findVideo() {
    const sels = [
      '.webPlayerSDKContainer video',
      '.dv-player-fullscreen video',
      '#dv-web-player video',
      '[id^="atvwebplayersdk"] video'
    ];
    for (const s of sels) {
      const v = document.querySelector(s);
      if (v) return v;
    }
    const vids = Array.from(document.querySelectorAll('video'));
    if (vids.length === 0) return null;
    vids.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
    return vids[0];
  }

  // 広告UIが現れている = 広告区間中、と判定する。
  // Prime Video の広告UIには複数バリエーションがある:
  //   - atvwebplayersdk-ad-overlay / atvwebplayersdk-ad-* 系
  //   - dv-web-player-ad-* / .ad-overlay-* (旧プレイヤー)
  //   - data-testid="ad-*" 系
  // 誤検知を避けるため「表示されている要素のみ」をチェック。
  const AD_SELECTORS = [
    '[class*="atvwebplayersdk-ad-overlay"]',
    '[class*="atvwebplayersdk-ad-"]',
    '[class*="dv-web-player-ad"]',
    '[class*="ad-overlay"]',
    '[data-testid^="ad-"]',
    '[data-testid*="-ad-"]'
  ];
  function isElementVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) return false;
    return true;
  }
  function isAdPlaying() {
    try {
      for (const sel of AD_SELECTORS) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (isElementVisible(el)) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  window.CinemaGazer.registerAdapter({
    name: 'prime',
    findVideo,
    subtitleStrategy: 'texttrack-preferred',
    isAdPlaying
  });
})();
