// CinemaGazer - page-context interceptor (improved diagnostics)
(function () {
  if (window.__cgInterceptorInstalled) return;
  window.__cgInterceptorInstalled = true;

  console.log('%c[CinemaGazer] interceptor loaded (page world)', 'color:#c33;font-weight:bold');

  const URL_PATTERNS = [
    /nflxvideo\.net.*\?o=/i,
    /nflxvideo\.net.*subtitle/i,
    /\.ttml2?\b/i,
    /\.dfxp\b/i,
    /\.vtt\b/i,
    /timedtext/i,
    /subtitle/i,
    /caption/i,
    /aiv-cdn/i,
    /atv-ps.*subtitle/i,
    /media-amazon\.com.*\.xml/i,
    /\.xml(\?|$)/i
  ];

  const CT_SUBTITLE_PATTERNS = [/ttml/i, /vtt/i, /dfxp/i, /subrip/i];
  const CT_PROBE_PATTERNS = [
    /text\/xml/i, /application\/xml/i,
    /application\/ttml/i, /application\/dfxp/i,
    /text\/plain/i, /application\/octet-stream/i
  ];

  function shapeIsSubtitle(text) {
    if (!text || typeof text !== 'string' || text.length < 30) return false;
    const head = text.slice(0, 400);
    if (/^WEBVTT/i.test(head.trim())) return true;
    if (/<tt(?:\s|>|\/|:)/i.test(head)) return true;
    if (/<\?xml[^?]*\?>\s*<[^>]*tt[\s>]/i.test(head)) return true;
    if (/<p\s[^>]*begin=["']/.test(text.slice(0, 4000))) return true;
    return false;
  }

  function matchUrl(u) {
    if (!u) return false;
    return URL_PATTERNS.some(r => r.test(u));
  }

  const seen = [];
  function recordSeen(url, kind, ct, captured, bodyHead) {
    seen.push({
      t: new Date().toISOString().split('T')[1].replace('Z',''),
      kind, captured, ct: ct || '',
      url: String(url || '').slice(0, 200),
      head: (bodyHead || '').slice(0, 80)
    });
    if (seen.length > 300) seen.shift();
  }
  window.__cgSeenUrls = seen;

  function postSubtitle(url, body, source) {
    try {
      window.postMessage({ __cg: true, type: 'CG_SUBTITLE', url: String(url || ''), body, source }, '*');
    } catch (e) {
      console.warn('[CinemaGazer] postMessage failed:', e);
    }
  }

  // ---- fetch hook ----
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = (typeof input === 'string') ? input : (input && input.url) || '';
    return origFetch.apply(this, arguments).then(resp => {
      try {
        const ct = ((resp.headers && resp.headers.get && resp.headers.get('content-type')) || '').toLowerCase();
        const mU = matchUrl(url);
        const mC = CT_SUBTITLE_PATTERNS.some(r => r.test(ct));
        const probe = mU || mC || CT_PROBE_PATTERNS.some(r => r.test(ct));
        if (!probe) return resp;
        const cloned = resp.clone();
        cloned.text().then(body => {
          const isSub = mC || shapeIsSubtitle(body);
          recordSeen(url, 'fetch', ct, isSub, body && body.slice(0, 80));
          if (isSub && body) postSubtitle(url, body, 'fetch');
        }).catch(() => {
          recordSeen(url, 'fetch', ct, false, '(text() failed)');
        });
      } catch (e) { /* noop */ }
      return resp;
    });
  };

  // ---- XHR hook ----
  const XOpen = XMLHttpRequest.prototype.open;
  const XSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cgUrl = url;
    return XOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    const xhr = this;
    const url = xhr.__cgUrl || '';
    const mU = matchUrl(url);
    xhr.addEventListener('load', () => {
      try {
        const ct = (xhr.getResponseHeader('content-type') || '').toLowerCase();
        const mC = CT_SUBTITLE_PATTERNS.some(r => r.test(ct));
        const probe = mU || mC || CT_PROBE_PATTERNS.some(r => r.test(ct));
        if (!probe) return;
        let body = '';
        try {
          if (xhr.responseType === '' || xhr.responseType === 'text') {
            body = xhr.responseText || '';
          } else if (xhr.responseType === 'arraybuffer' && xhr.response) {
            body = new TextDecoder('utf-8', { fatal: false }).decode(xhr.response);
          } else if (xhr.responseType === 'document' && xhr.responseXML) {
            body = new XMLSerializer().serializeToString(xhr.responseXML);
          } else if (xhr.response) {
            body = String(xhr.response);
          }
        } catch (e) { /* noop */ }
        const isSub = mC || shapeIsSubtitle(body);
        recordSeen(url, 'xhr', ct, isSub, body && body.slice(0, 80));
        if (isSub && body) postSubtitle(url, body, 'xhr');
      } catch (e) { /* noop */ }
    });
    return XSend.apply(this, arguments);
  };

  // ---- DevTools用ダンプ ----
  window.__cgDump = function () {
    console.group('%c[CinemaGazer] interceptor dump', 'color:#c33;font-weight:bold');
    console.log('total observed (probe matched):', seen.length);
    const captured = seen.filter(s => s.captured);
    console.log('captured (subtitle shape OK):', captured.length);
    if (captured.length) {
      console.table(captured.slice(-20).map(s => ({ time: s.t, kind: s.kind, ct: s.ct, head: s.head, url: s.url })));
    }
    const others = seen.filter(s => !s.captured).slice(-30);
    if (others.length) {
      console.log('--- not captured (last 30 probed URLs) ---');
      console.table(others.map(s => ({ time: s.t, kind: s.kind, ct: s.ct, head: s.head, url: s.url })));
    }
    console.groupEnd();
    return { observed: seen.length, captured: captured.length };
  };

  try {
    window.postMessage({ __cg: true, type: 'CG_INTERCEPTOR_READY' }, '*');
  } catch (e) {}

  // ---- Netflix: 字幕の自動ON ----
  // Netflix のプレイヤー内部APIで字幕トラックを選択する。
  // 既に字幕がONになっていれば何もしない。
  function tryEnableNetflixSubs() {
    try {
      if (!/netflix\.com$/i.test(location.hostname)) return false;
      const w = window;
      if (!w.netflix || !w.netflix.appContext) return false;
      const playerApp = w.netflix.appContext.state && w.netflix.appContext.state.playerApp;
      if (!playerApp || typeof playerApp.getAPI !== 'function') return false;
      const api = playerApp.getAPI();
      if (!api || !api.videoPlayer) return false;
      const ids = api.videoPlayer.getAllPlayerSessionIds();
      if (!ids || !ids.length) return false;
      const sess = api.videoPlayer.getVideoPlayerBySessionId(ids[ids.length - 1]);
      if (!sess || typeof sess.getTimedTextTrackList !== 'function') return false;
      const tracks = sess.getTimedTextTrackList();
      if (!tracks || !tracks.length) return false;
      // 既に有効な字幕があれば何もしない
      try {
        const cur = (typeof sess.getTimedTextTrack === 'function') ? sess.getTimedTextTrack() : null;
        if (cur && (cur.bcp47 || cur.language) && !cur.isNoneTrack) return true;
      } catch (e) {}
      // OFF/None ではないトラックを選ぶ
      const target = tracks.find(function (t) {
        const dn = (t.displayName || '').toLowerCase();
        const bcp = t.bcp47 || t.language;
        return bcp && !t.isNoneTrack && dn.indexOf('off') === -1 && dn.indexOf('オフ') === -1;
      });
      if (!target) return false;
      sess.setTimedTextTrack(target);
      console.log('%c[CinemaGazer] Netflix subtitle auto-enabled:', 'color:#c33', target.displayName || target.bcp47 || target.language);
      return true;
    } catch (e) {
      return false;
    }
  }
  let __cgAutoTries = 0;
  const __cgAutoTimer = setInterval(function () {
    __cgAutoTries++;
    if (tryEnableNetflixSubs() || __cgAutoTries > 60) {
      clearInterval(__cgAutoTimer);
    }
  }, 1000);
})();
