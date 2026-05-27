// CinemaGazer - U-NEXT adapter (experimental)
//
// U-NEXT (video.unext.jp / unext.jp) のプレイヤーは Shaka Player 系の
// ネイティブ <video> 実装。字幕は textTracks にエクスポーズされるので
// subtitleStrategy: 'texttrack-preferred' で動かす。
//
// 動作条件:
//   - プレイヤー側で字幕表示を ON にしていること
//   - 本編再生ページであること

(function () {
  if (!window.CinemaGazer) return;

  function isWatchPage() {
    // U-NEXT 本編URL: /play/<title_id>/<episode_id> /title/<id> /book/<id>
    return /\/(play|view|watch|title|episode|book)\//i.test(location.pathname);
  }

  function findVideo() {
    if (!isWatchPage()) return null;
    const sels = [
      '[class*="PlayerWrap"] video',
      '[class*="player-wrapper"] video',
      '[class*="VideoPlayer"] video',
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
    name: 'unext',
    findVideo,
    subtitleStrategy: 'texttrack-preferred'
  });
})();
