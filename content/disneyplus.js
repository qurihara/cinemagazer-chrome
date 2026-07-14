// CinemaGazer - Disney+ adapter
//
// Disney+ は Disney Streaming の hive プレイヤー (playback-service /
// btm-media-client) を使用。実機調査 (2026-07, アバターWoW続編/Chrome150) の結果:
//   - 再生ページには <video> が2つ: 0x0 の休眠ダミーと、実プレイヤー
//     (クラスは再生状態で hive-video ⇔ btm-media-client-element font* と変わる)
//   - video.textTracks は空 (TextTrack 戦略は不発)
//   - ネイティブ字幕は closed shadow DOM (disney-web-player-ui 等の custom
//     element) 内に描画され、DOM 監視も CSS 非表示も届かない
//   - 字幕データは XHR で text/vtt (セグメント化 WebVTT, cue は絶対時刻,
//     vod-*.media.dssott.com) を取得している → interceptor の content-type
//     マッチで捕捉できる
// よって戦略は 'xhr-segmented': interceptor が捕捉した VTT 断片を core.js が
// currentIntervals にマージし、cue 基準で速度切替・中央オーバーレイを行う。
// 制約: ネイティブ字幕は隠せないため、中央オーバーレイと二重表示になる
// (overlayEnabled OFF でネイティブのみにできる)。
//
// 動作条件:
//   - ユーザがプレイヤー側で字幕(Subtitles/CC)を ON にしていること
//   - URL: https://www.disneyplus.com/ja-jp/play/<id> 等の本編再生ページ
//
// /search, /home, /browse 等のブラウズ画面では予告編が自動再生されることがあるが、
// HUD を出さないように URL ガードを掛ける。

(function () {
  if (!window.CinemaGazer) return;

  function isWatchPage() {
    // Disney+ の本編URLは /play/<id> / /video/<id> など複数あり、
    // 厳密に判定すると弾きすぎる。プレイヤー要素の存在で代用する。
    return !!document.querySelector(
      '.btm-media-client-element, .btm-media-overlays-container, video[autoplay], video'
    ) && /\/(video|play|movies|series|episode)\//i.test(location.pathname);
  }

  function findVideo() {
    if (!isWatchPage()) return null;
    // hive プレイヤーは 0x0 の休眠ダミー <video> を残す (クラス名は実プレイヤーと
    // 同系統で区別不能) ため、セレクタでなく「可視 → 再生中優先 → 面積最大」で選ぶ。
    const vids = Array.from(document.querySelectorAll('video'))
      .filter(v => v.offsetWidth * v.offsetHeight > 0);
    if (vids.length === 0) return null;
    vids.sort((a, b) =>
      ((a.paused ? 1 : 0) - (b.paused ? 1 : 0)) ||
      ((b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight)));
    return vids[0];
  }

  window.CinemaGazer.registerAdapter({
    name: 'disneyplus',
    findVideo,
    subtitleStrategy: 'xhr-segmented'
  });
})();
