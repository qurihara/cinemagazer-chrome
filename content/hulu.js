// CinemaGazer - Hulu adapter (experimental)
//
// 対応: hulu.com (US, Disney傘下) と hulu.jp (Japan, HJ Holdings)
// 両プレイヤーともネイティブ <video> + textTracks ベースで字幕を提供しているため
// subtitleStrategy: 'texttrack-preferred' を利用する。
//
// 動作条件:
//   - プレイヤー側で字幕(Subtitles/CC)を ON にしていること
//   - 本編再生ページ（/watch/<id>）であること
//
// 注: hulu.com は広告挿入(DAI)モデル。textTracks 経由なら広告ズレが自動的に
// オフセットされる。

(function () {
  if (!window.CinemaGazer) return;

  function isWatchPage() {
    // hulu.com:    /watch/<uuid>
    // hulu.jp:     /watch/<id> もしくは /share-list 経由
    return /\/watch(\/|$)/i.test(location.pathname);
  }

  function findVideo() {
    if (!isWatchPage()) return null;
    const sels = [
      '.PlayerContainer video',
      '.controls__player-container video',
      '[data-testid="player-container"] video',
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
    name: 'hulu',
    findVideo,
    subtitleStrategy: 'texttrack-preferred'
  });
})();
