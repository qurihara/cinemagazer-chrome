// CinemaGazer - Disney+ adapter (experimental)
//
// Disney+ は BAMTECH/Disney Streaming のプレイヤー (btm-media-client) を使用。
// 字幕はネイティブ <track> として <video> に attach される（textTracks API で
// 読み取り可能）ことを前提に、subtitleStrategy: 'texttrack-preferred' で動かす。
//
// 動作条件:
//   - ユーザがプレイヤー側で字幕(Subtitles/CC)を ON にしていること
//   - URL: https://www.disneyplus.com/*/video/* 等の本編再生ページ
//
// /search, /home, /browse 等のブラウズ画面では予告編が自動再生されることがあるが、
// HUD を出さないように URL ガードを掛ける。

(function () {
  if (!window.CinemaGazer) return;

  function isWatchPage() {
    // Disney+ の本編URLは /video/<id> / /play/<id> / /movies/.../<id> など複数あり、
    // 厳密に判定すると弾きすぎる。プレイヤー要素の存在で代用する。
    return !!document.querySelector(
      '.btm-media-client-element, .btm-media-overlays-container, video[autoplay], video'
    ) && /\/(video|play|movies|series|episode)\//i.test(location.pathname);
  }

  function findVideo() {
    if (!isWatchPage()) return null;
    const sels = [
      '.btm-media-client-element video',
      '.btm-media-overlays-container video',
      'video[autoplay]'
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
    name: 'disneyplus',
    findVideo,
    subtitleStrategy: 'texttrack-preferred'
  });
})();
