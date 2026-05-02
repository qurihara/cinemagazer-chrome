// CinemaGazer - Netflix adapter
//
// Netflix のプレイヤーは <video> をDOMに持つ。複数 <video> が混在することがあるので
// data-uia="player" 配下を優先して取得。SPAなのでルーティングごとに変化する。
//
// /watch/... 以外（/browse, /title/... 等）では HUD を出さない。
// Netflixのブラウズ画面で予告編が自動再生されても発火しないようにするため。

(function () {
  if (!window.CinemaGazer) return;

  function isWatchPage() {
    return /^\/watch(\/|$)/.test(location.pathname);
  }

  function findVideo() {
    // /watch/... ページ以外では発火しない（ブラウズ画面の予告編には反応させない）
    if (!isWatchPage()) return null;

    // 優先: 再生領域内の動画（広告 video など除外）
    const playerEl = document.querySelector('[data-uia="player"], .watch-video, .NFPlayer');
    if (playerEl) {
      const v = playerEl.querySelector('video');
      if (v) return v;
    }
    // フォールバック: ページ内最大の video
    const vids = Array.from(document.querySelectorAll('video'));
    if (vids.length === 0) return null;
    vids.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
    return vids[0];
  }

  window.CinemaGazer.registerAdapter({
    name: 'netflix',
    findVideo
  });
})();
