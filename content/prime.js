// CinemaGazer - Prime Video adapter
//
// Prime Video は iframe や複数 <video> が出ることがある。
// プレイヤー領域は webPlayer / dv-player-fullscreen / atvwebplayersdk* など。

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

  window.CinemaGazer.registerAdapter({
    name: 'prime',
    findVideo
  });
})();
