// CinemaGazer - Hulu adapter
//
// 対応: hulu.jp (Japan, HJ Holdings)。実機調査 (2026-07, スパイダーマン字幕版/Chrome150) の結果:
//   - 字幕は s2.happyon.jp から取得するビットマップ画像 (URL 末尾 ?size=1920x188 等) を
//     <img> として動画下部に重ね、visibility で現在の1枚だけ表示する方式（DVD字幕と同様）。
//   - textTracks はダミー (Shaka Player TextTrack, cue なし)。字幕テキストは DOM にも
//     canvas にも存在しない。したがって texttrack/DOM文字列/XHR の各戦略は不発。
//   - 焼き込み (hardsub) ではない（字幕 ON/OFF が再読み込みなしで切り替わる）。
//   → subtitleStrategy: 'image-presence'。字幕画像が可視かどうかで発話区間を検出する。
//     テキストは取得できないため中央オーバーレイのテキスト表示は行わず、
//     ネイティブの画像字幕をそのまま見せる（core.js 側で domSubtitleText は空のまま）。
//
// 注: 字幕版と吹替版は再生 URL が別（/watch/<id> がそれぞれ異なる）。本アダプタは
//     字幕画像を表示する字幕版で機能する。
// 注: hulu.com (US, Disney傘下) は別基盤（ソフト字幕の可能性）で未検証。当面 hulu.jp を対象とする。

(function () {
  if (!window.CinemaGazer) return;

  function isWatchPage() {
    // hulu.jp / hulu.com とも本編再生は /watch/<id>
    return /\/watch(\/|$)/i.test(location.pathname);
  }

  function findVideo() {
    if (!isWatchPage()) return null;
    const sels = [
      '.video-js video',
      '[class*="player" i] video',
      'video[src^="blob:"]'
    ];
    for (const s of sels) {
      const v = document.querySelector(s);
      if (v && v.clientWidth > 0) return v;
    }
    const vids = Array.from(document.querySelectorAll('video'));
    if (vids.length === 0) return null;
    vids.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
    return vids[0];
  }

  // 現在表示されている字幕画像 (happyon.jp のビットマップ) の <img> を列挙する。
  // 動画幅に近い横長・動画下部・visibility:visible の <img> を字幕とみなす。
  // 判定は visibility/opacity/display のみで、clip-path(中央表示時の隠し)には触れない
  // ため、隠しても検出は安定する。
  function subtitleImages() {
    try {
      const v = findVideo();
      if (!v) return [];
      const vr = v.getBoundingClientRect();
      if (!vr.width || !vr.height) return [];
      const out = [];
      const imgs = document.querySelectorAll('img');
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        const src = img.currentSrc || img.src || '';
        if (!/happyon\.jp/i.test(src)) continue;           // hulu.jp の字幕画像CDN
        const r = img.getBoundingClientRect();
        if (r.width < vr.width * 0.3) continue;             // 小さいアイコン等を除外
        if (r.top < vr.top + vr.height * 0.4) continue;     // 動画下部に位置するもののみ
        if (r.bottom > vr.bottom + 80) continue;            // 動画外の要素を除外
        const cs = getComputedStyle(img);
        if (cs.visibility === 'visible' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.1) {
          out.push(img);
        }
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  function isSubtitleImageVisible() {
    return subtitleImages().length > 0;
  }

  // 中央表示OFF時に、clip-path で隠したネイティブ字幕画像を元に戻す。
  function restoreNativeSubtitles() {
    try {
      const imgs = document.querySelectorAll('img');
      for (let i = 0; i < imgs.length; i++) {
        const src = imgs[i].currentSrc || imgs[i].src || '';
        if (/happyon\.jp/i.test(src)) {
          imgs[i].style.removeProperty('clip-path');
          imgs[i].style.removeProperty('-webkit-clip-path');
        }
      }
    } catch (e) {}
  }

  window.CinemaGazer.registerAdapter({
    name: 'hulu',
    findVideo,
    subtitleStrategy: 'image-presence',
    isSubtitleImageVisible,
    getSubtitleImages: subtitleImages,
    restoreNativeSubtitles
  });
})();
