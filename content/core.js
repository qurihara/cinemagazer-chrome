// CinemaGazer - core (Netflix / Prime共通の制御ロジック)
(function () {
  if (window.CinemaGazer) return;

  const STATE = {
    settings: {
      enabled: true,
      speechRate: 1.5,
      silentRate: 4.0,
      silentMinGap: 0.4,
      overlayEnabled: false,
      overlayFadeMs: 200,
      showHud: true,
      // 字幕の体感ズレを微調整 (秒, 正値=字幕を遅らせる, 負値=字幕を早める)
      subtitleOffset: 0.0,
      // サイト別の有効化トグル
      enableNetflix: true,
      enablePrime: false
    },
    subtitleStores: new Map(),
    currentIntervals: [],
    currentIntervalIdx: -1,
    video: null,
    adapter: null,
    rafId: null,
    rateGuardTimer: null,
    desiredRate: 1.0,
    overlayEl: null,
    hudEl: null,
    lastShownText: '',
    lastShownAt: 0,
    interceptorReady: false,
    compressionCache: { duration: 0, cueCount: 0, settingsHash: '', ratio: null }
  };

  const log  = (...a) => console.log('%c[CinemaGazer]', 'color:#c33;font-weight:bold', ...a);
  const warn = (...a) => console.warn('[CinemaGazer]', ...a);

  // i18n: chrome.i18n.getMessage のラッパー（取得できなければフォールバック文字列を返す）
  function t(key, fallback, sub) {
    try {
      const m = chrome.i18n.getMessage(key, sub != null ? [String(sub)] : undefined);
      if (m) return m;
    } catch (e) {}
    return fallback;
  }

  // 現在の cue 集合と速度設定で、動画全体の総長が何倍に圧縮されるかを計算
  function computeCompressionRatio() {
    const v = STATE.video;
    const arr = STATE.currentIntervals;
    if (!v || !v.duration || !isFinite(v.duration) || arr.length === 0) return null;
    const D = v.duration;
    const sr = STATE.settings.speechRate;
    const slr = STATE.settings.silentRate;
    const minGap = STATE.settings.silentMinGap;
    const hash = sr + '|' + slr + '|' + minGap;
    const c = STATE.compressionCache;
    if (c.duration === D && c.cueCount === arr.length && c.settingsHash === hash) return c.ratio;

    let compressed = 0;
    let prev = 0;
    for (const item of arr) {
      const s = item[0], e = item[1];
      const gap = s - prev;
      if (gap > 0) compressed += (gap >= minGap) ? (gap / slr) : (gap / sr);
      compressed += Math.max(0, e - s) / sr;
      if (e > prev) prev = e;
    }
    const tail = D - prev;
    if (tail > 0) compressed += (tail >= minGap) ? (tail / slr) : (tail / sr);
    const ratio = compressed / D;
    c.duration = D; c.cueCount = arr.length; c.settingsHash = hash; c.ratio = ratio;
    return ratio;
  }

  async function loadSettings() {
    try {
      const s = await chrome.storage.sync.get(null);
      Object.assign(STATE.settings, s);
    } catch (e) { warn('settings load failed', e); }
  }
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k of Object.keys(changes)) {
      const nv = changes[k].newValue;
      if (nv !== undefined) STATE.settings[k] = nv;
    }
    applySettingsImmediate();
  });
  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg && msg.type === 'CG_SETTINGS_UPDATED' && msg.settings) {
      Object.assign(STATE.settings, msg.settings);
      applySettingsImmediate();
    }
  });
  function applySettingsImmediate() {
    if (STATE.hudEl) STATE.hudEl.style.display = STATE.settings.showHud ? 'block' : 'none';
    if (STATE.overlayEl) STATE.overlayEl.style.display = STATE.settings.overlayEnabled ? 'block' : 'none';
    // ネイティブ字幕の非表示制御（CSSの html.cg-overlay-active セレクタが効く）
    document.documentElement.classList.toggle('cg-overlay-active', !!STATE.settings.overlayEnabled);
    // 設定変更で圧縮率キャッシュを無効化
    STATE.compressionCache.settingsHash = '';
  }

  function injectInterceptor() {
    try {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('inject/interceptor.js');
      s.async = false;
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
    } catch (e) { warn('inject failed', e); }
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__cg !== true) return;
    if (d.type === 'CG_SUBTITLE') {
      handleSubtitle(d.url, d.body);
    } else if (d.type === 'CG_INTERCEPTOR_READY') {
      STATE.interceptorReady = true;
      log('interceptor ready');
    }
  });

  function handleSubtitle(url, body) {
    if (!body) return;
    let intervals = null;
    const head = body.slice(0, 200).trim();
    try {
      if (/^WEBVTT/i.test(head)) {
        intervals = parseVTT(body);
      } else if (/<tt[\s:>]/i.test(head)) {
        intervals = parseTTML(body);
      } else if (/<\?xml/i.test(head) && body.includes('<tt')) {
        intervals = parseTTML(body);
      } else if (body.includes('<p ') && body.includes('begin=')) {
        intervals = parseTTML(body);
      }
    } catch (e) {
      warn('subtitle parse failed', url, e);
    }
    if (!intervals || intervals.length === 0) {
      log('parsed but 0 cues', url.slice(0, 80));
      return;
    }
    STATE.subtitleStores.set(url, { intervals, parsedAt: Date.now() });
    const f = intervals[0], l = intervals[intervals.length - 1];
    log('subtitle parsed: ' + intervals.length + ' cues  '
        + 'first=' + f[0].toFixed(2) + 's last_end=' + l[1].toFixed(2) + 's  '
        + 'url=' + url.slice(0, 80));
    // 動画 duration が取れていれば、字幕の最終 cue が動画長を超えていないかチェック
    const v = STATE.video;
    if (v && isFinite(v.duration) && l[1] > v.duration * 1.5) {
      warn('subtitle last_end (' + l[1].toFixed(1) + 's) >> video.duration ('
           + v.duration.toFixed(1) + 's). tickRate/frameRate 解釈ミスの可能性。');
    }
    STATE.currentIntervals = intervals;
    STATE.currentIntervalIdx = -1;
    STATE.compressionCache.cueCount = -1; // invalidate
  }

  // TTML2 のパラメータ名前空間
  const TTP_NS = 'http://www.w3.org/ns/ttml#parameter';
  // TTML 既定パラメータ
  const DEFAULT_TTML_PARAMS = { tickRate: 10000000, frameRate: 30, subFrameRate: 1 };

  // <tt> ルートから ttp:tickRate / ttp:frameRate / ttp:subFrameRate を読む。
  // namespace-aware と prefix 付き属性名の両方にフォールバックする。
  function readTTMLParams(doc) {
    const root = doc && doc.documentElement;
    if (!root) return Object.assign({}, DEFAULT_TTML_PARAMS);
    const getParam = (name) => {
      let v = null;
      try { v = root.getAttributeNS && root.getAttributeNS(TTP_NS, name); } catch (e) {}
      if (v) return v;
      v = root.getAttribute('ttp:' + name);
      if (v) return v;
      v = root.getAttribute(name);
      return v;
    };
    const tr = parseFloat(getParam('tickRate'));
    const fr = parseFloat(getParam('frameRate'));
    const sfr = parseFloat(getParam('subFrameRate'));
    let tickRate;
    if (!Number.isNaN(tr) && tr > 0) {
      tickRate = tr;
    } else if (!Number.isNaN(fr) && fr > 0) {
      // TTML の既定: tickRate 未指定なら frameRate * subFrameRate
      tickRate = fr * (Number.isNaN(sfr) || sfr <= 0 ? 1 : sfr);
    } else {
      // Netflix/Prime の DFXP では 10000000 (10MHz) が一般的
      tickRate = DEFAULT_TTML_PARAMS.tickRate;
    }
    return {
      tickRate,
      frameRate: !Number.isNaN(fr) && fr > 0 ? fr : DEFAULT_TTML_PARAMS.frameRate,
      subFrameRate: !Number.isNaN(sfr) && sfr > 0 ? sfr : DEFAULT_TTML_PARAMS.subFrameRate
    };
  }

  function parseTTML(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      const stripped = xml.replace(/<\/?([a-zA-Z]+):/g, function (_, p) {
        return '<' + (p === 'tt' ? '' : p + '_');
      }).replace(/xmlns:[^=]+="[^"]*"/g, '');
      const doc2 = new DOMParser().parseFromString(stripped, 'text/xml');
      return collectCues(doc2);
    }
    return collectCues(doc);
  }

  // TTML ツリーを再帰的に走査して cue を収集する。
  // <body> / <div> / <p> の begin 値は親の begin に対する相対値なので、親側を累積する必要がある。
  // (現実のNetflix/PrimeのDFXPでは <div begin="..."> ラッパーが普通に使われる)
  function collectCues(doc) {
    const params = readTTMLParams(doc);
    const out = [];
    const body = doc.getElementsByTagName('body')[0] || doc.documentElement;
    walkTTML(body, 0, out, params);
    out.sort((a, b) => a[0] - b[0]);
    return out;
  }

  function elementChildren(node) {
    if (node.children && node.children.length !== undefined) return node.children;
    const cs = node.childNodes || [];
    const arr = [];
    for (let i = 0; i < cs.length; i++) if (cs[i].nodeType === 1) arr.push(cs[i]);
    return arr;
  }

  function walkTTML(node, parentBegin, out, params) {
    if (!node || node.nodeType !== 1) return;
    const tag = (node.localName || node.tagName || '').toLowerCase();

    const beginAttr = node.getAttribute && node.getAttribute('begin');
    const endAttr   = node.getAttribute && node.getAttribute('end');
    const durAttr   = node.getAttribute && node.getAttribute('dur');

    // TTML2: begin/end は親の begin に対する相対時刻
    let nodeBegin = parentBegin;
    if (beginAttr) {
      const b = parseTTMLTime(beginAttr, params);
      if (!Number.isNaN(b)) nodeBegin = parentBegin + b;
    }

    if (tag === 'p') {
      let nodeEnd = NaN;
      if (endAttr) {
        const e = parseTTMLTime(endAttr, params);
        if (!Number.isNaN(e)) nodeEnd = parentBegin + e; // end も親 begin に対する相対
      } else if (durAttr) {
        const d = parseTTMLTime(durAttr, params);
        if (!Number.isNaN(d)) nodeEnd = nodeBegin + d;
      }
      if (!Number.isNaN(nodeBegin) && !Number.isNaN(nodeEnd) && nodeEnd > nodeBegin) {
        // <br/> を改行として扱い、テキスト整形
        let text = '';
        const collect = (n) => {
          for (const c of (n.childNodes || [])) {
            if (c.nodeType === 3) text += c.nodeValue || '';
            else if (c.nodeType === 1) {
              const lname = (c.localName || c.tagName || '').toLowerCase();
              if (lname === 'br') text += '\n';
              else collect(c);
            }
          }
        };
        collect(node);
        text = text.replace(/[ \t]+/g, ' ').replace(/\n[ \t]*/g, '\n').trim();
        out.push([nodeBegin, nodeEnd, text]);
      }
      return; // <p> 内のさらなる cue は想定しない
    }

    for (const child of elementChildren(node)) {
      walkTTML(child, nodeBegin, out, params);
    }
  }

  function parseVTT(text) {
    const out = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)/);
      if (m) {
        const start = parseClockTime(m[1]);
        const stop = parseClockTime(m[2]);
        const buf = [];
        i++;
        while (i < lines.length && lines[i].trim() !== '') {
          buf.push(lines[i].replace(/<[^>]+>/g, ''));
          i++;
        }
        if (!Number.isNaN(start) && !Number.isNaN(stop) && stop > start) {
          out.push([start, stop, buf.join(' ').trim()]);
        }
      }
    }
    out.sort((a, b) => a[0] - b[0]);
    return out;
  }

  // VTT / 簡易の HH:MM:SS[.fff] / MM:SS[.fff] パース (フレーム/tick は使わない)
  function parseClockTime(v) {
    if (!v) return NaN;
    const s = String(v).trim();
    let m = s.match(/^(\d+):(\d+):(\d+)(?:[.,](\d+))?$/);
    if (m) {
      const h = parseInt(m[1], 10), mm = parseInt(m[2], 10), ss = parseInt(m[3], 10);
      const ms = m[4] ? parseInt(m[4].padEnd(3, '0').slice(0, 3), 10) : 0;
      return h * 3600 + mm * 60 + ss + ms / 1000;
    }
    m = s.match(/^(\d+):(\d+)(?:[.,](\d+))?$/);
    if (m) {
      const mm = parseInt(m[1], 10), ss = parseInt(m[2], 10);
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      return mm * 60 + ss + ms / 1000;
    }
    return NaN;
  }

  // TTML2 の time expression をパース。params は readTTMLParams() の結果。
  //   - 10s / 10.5s            (秒)
  //   - 12345t                 (tick;  tickRate で除算)
  //   - 30f                    (frame; frameRate で除算)
  //   - HH:MM:SS:FF[.SUB]      (clock with frame)
  //   - HH:MM:SS[.fff]         (clock)
  //   - MM:SS[.fff]            (clock 短縮)
  function parseTTMLTime(v, params) {
    if (!v) return NaN;
    const s = String(v).trim();
    const p = params || DEFAULT_TTML_PARAMS;
    if (/^[\d.]+s$/i.test(s)) return parseFloat(s);
    if (/^\d+t$/i.test(s)) return parseInt(s.slice(0, -1), 10) / p.tickRate;
    if (/^\d+f$/i.test(s)) return parseInt(s.slice(0, -1), 10) / p.frameRate;

    // HH:MM:SS:FF[.SUB] (frame 付き clock)
    let m = s.match(/^(\d+):(\d+):(\d+):(\d+)(?:\.(\d+))?$/);
    if (m) {
      const h = parseInt(m[1], 10), mm = parseInt(m[2], 10), ss = parseInt(m[3], 10);
      const ff = parseInt(m[4], 10);
      const sf = m[5] ? parseInt(m[5], 10) : 0;
      return h * 3600 + mm * 60 + ss
           + (ff + sf / Math.max(1, p.subFrameRate)) / Math.max(1, p.frameRate);
    }
    // HH:MM:SS[.fff] / MM:SS[.fff]
    return parseClockTime(s);
  }

  function findCueAt(t) {
    const arr = STATE.currentIntervals;
    if (!arr.length) return -1;
    let i = STATE.currentIntervalIdx;
    if (i < 0 || i >= arr.length) i = 0;
    if (arr[i][0] > t) {
      i = bsearch(arr, t);
    } else {
      while (i + 1 < arr.length && arr[i + 1][0] <= t) i++;
    }
    STATE.currentIntervalIdx = i;
    if (i >= 0 && i < arr.length && arr[i][0] <= t && t < arr[i][1]) return i;
    return -1;
  }
  function bsearch(arr, t) {
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (arr[m][0] <= t) lo = m; else hi = m - 1;
    }
    return lo;
  }
  function inSilentGapLongEnough(t) {
    const arr = STATE.currentIntervals;
    if (!arr.length) return false;
    const i = bsearch(arr, t);
    const prevEnd = (i >= 0 && arr[i][1] <= t) ? arr[i][1] : 0;
    const next = arr.find(c => c[0] > t);
    const nextStart = next ? next[0] : Number.POSITIVE_INFINITY;
    return (nextStart - Math.max(prevEnd, t)) >= STATE.settings.silentMinGap;
  }

  function tick() {
    STATE.rafId = null;
    const v = STATE.video;
    if (!v || v.readyState < 1) {
      STATE.rafId = requestAnimationFrame(tick);
      return;
    }
    // 全体OFF / サイト別OFF の場合は何もしない（HUD/Overlayも隠す）
    const adapterName = STATE.adapter && STATE.adapter.name;
    const siteEnabled =
      (adapterName === 'netflix' && STATE.settings.enableNetflix !== false) ||
      (adapterName === 'prime'   && STATE.settings.enablePrime   === true);
    if (!STATE.settings.enabled || !siteEnabled) {
      if (STATE.hudEl) STATE.hudEl.style.display = 'none';
      if (STATE.overlayEl) STATE.overlayEl.style.display = 'none';
      document.documentElement.classList.remove('cg-overlay-active');
      STATE.rafId = requestAnimationFrame(tick);
      return;
    } else {
      // サイト有効時はユーザ設定に従って表示
      if (STATE.hudEl) STATE.hudEl.style.display = STATE.settings.showHud ? 'block' : 'none';
      if (STATE.overlayEl) STATE.overlayEl.style.display = STATE.settings.overlayEnabled ? 'block' : 'none';
    }

    // 体感ズレ補正: t (動画時刻) を字幕時刻軸に揃える
    //   subtitleOffset > 0 なら字幕を遅らせて表示 → 動画時刻から差し引いた値で cue 検索
    const off = Number(STATE.settings.subtitleOffset) || 0;
    const t = v.currentTime;
    const tCue = t - off;
    let inSpeech = false;
    if (STATE.currentIntervals.length) {
      const idx = findCueAt(tCue);
      inSpeech = (idx >= 0);
    } else {
      inSpeech = true;
    }

    let target;
    if (inSpeech) {
      target = STATE.settings.speechRate;
    } else if (inSilentGapLongEnough(tCue)) {
      target = STATE.settings.silentRate;
    } else {
      target = STATE.settings.speechRate;
    }
    setRate(target);

    if (STATE.settings.overlayEnabled && STATE.currentIntervals.length) {
      const idx = STATE.currentIntervalIdx;
      const cue = (idx >= 0 && STATE.currentIntervals[idx]) || null;
      if (cue && cue[0] <= tCue && tCue < cue[1]) showOverlay(cue[2]);
      else hideOverlay();
    } else if (STATE.overlayEl) {
      hideOverlay();
    }

    if (STATE.hudEl) {
      const cueCount = STATE.currentIntervals.length;
      const label = (cueCount === 0) ? '—' : (inSpeech ? t('hudSpeech', '発話') : t('hudSilent', '無音'));
      const ratio = computeCompressionRatio();
      let tail;
      if (ratio != null) {
        const pct = Math.round((1 - ratio) * 100);
        tail = t('hudCompression', pct + '% 圧縮', pct);
      } else if (STATE.interceptorReady) {
        tail = t('hudNotCaptured', '字幕未取得');
      } else {
        tail = t('hudInit', 'init…');
      }
      STATE.hudEl.textContent = label + '  ' + target.toFixed(2) + '×  ' + tail;
      let bg;
      if (cueCount === 0) bg = 'rgba(120,120,120,.85)';
      else if (inSpeech)  bg = 'rgba(60,120,200,.85)';
      else                bg = 'rgba(200,60,60,.85)';
      STATE.hudEl.style.background = bg;
    }

    STATE.rafId = requestAnimationFrame(tick);
  }

  function setRate(r) {
    STATE.desiredRate = r;
    const v = STATE.video;
    if (!v) return;
    if (Math.abs(v.playbackRate - r) > 0.01) {
      try { v.playbackRate = r; } catch (e) {}
    }
  }
  function startRateGuard() {
    stopRateGuard();
    STATE.rateGuardTimer = setInterval(() => {
      const v = STATE.video;
      if (!v) return;
      if (!STATE.settings.enabled) return;
      if (Math.abs(v.playbackRate - STATE.desiredRate) > 0.01) {
        try { v.playbackRate = STATE.desiredRate; } catch (e) {}
      }
    }, 500);
  }
  function stopRateGuard() {
    if (STATE.rateGuardTimer) clearInterval(STATE.rateGuardTimer);
    STATE.rateGuardTimer = null;
  }

  function attachVideo(v) {
    if (!v || STATE.video === v) return;
    STATE.video = v;
    log('attached video', v);
    ensureHud();
    ensureOverlay();
    if (!STATE.rafId) STATE.rafId = requestAnimationFrame(tick);
    startRateGuard();
  }
  function detachVideo() {
    STATE.video = null;
    if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
    STATE.rafId = null;
    stopRateGuard();
  }

  function findVideoDefault() {
    return document.querySelector('video');
  }
  function watchForVideo() {
    const tryAttach = () => {
      const v = (STATE.adapter && STATE.adapter.findVideo && STATE.adapter.findVideo()) || findVideoDefault();
      if (v && v !== STATE.video) attachVideo(v);
      else if (!v && STATE.video && !document.contains(STATE.video)) detachVideo();
    };
    tryAttach();
    const mo = new MutationObserver(() => tryAttach());
    mo.observe(document.documentElement, { subtree: true, childList: true });
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        log('url change', lastUrl);
        STATE.subtitleStores.clear();
        STATE.currentIntervals = [];
        STATE.currentIntervalIdx = -1;
        STATE.compressionCache = { duration: 0, cueCount: 0, settingsHash: '', ratio: null };
        tryAttach();
      }
    }, 500);
  }

  function ensureHud() {
    if (!STATE.settings.showHud) return;
    if (STATE.hudEl && document.contains(STATE.hudEl)) return;
    const el = document.createElement('div');
    el.id = 'cg-hud';
    el.className = 'cg-hud';
    el.title = t('hudClickHint', 'クリックでCinemaGazer設定を開く');
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        chrome.runtime.sendMessage({ type: 'CG_OPEN_POPUP' }).catch(() => {});
      } catch (e) {}
    });
    document.documentElement.appendChild(el);
    STATE.hudEl = el;
  }
  function overlayHost() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.documentElement;
  }
  function ensureOverlay() {
    const desiredHost = overlayHost();
    if (STATE.overlayEl && STATE.overlayEl.parentNode === desiredHost) return;
    if (!STATE.overlayEl) {
      const el = document.createElement('div');
      el.id = 'cg-overlay';
      el.className = 'cg-overlay';
      el.style.opacity = '0';
      el.style.display = STATE.settings.overlayEnabled ? 'block' : 'none';
      STATE.overlayEl = el;
    }
    desiredHost.appendChild(STATE.overlayEl);
  }
  function positionOverlayAtVideoCenter() {
    const v = STATE.video;
    const el = STATE.overlayEl;
    if (!v || !el) return;
    const r = v.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    el.style.transform = 'translate(-50%, -50%)';
  }
  function showOverlay(text) {
    if (!STATE.overlayEl) return;
    ensureOverlay();
    positionOverlayAtVideoCenter();
    if (text !== STATE.lastShownText) {
      STATE.overlayEl.textContent = text;
      STATE.lastShownText = text;
      STATE.lastShownAt = performance.now();
    }
    STATE.overlayEl.style.transition = 'opacity ' + STATE.settings.overlayFadeMs + 'ms linear';
    STATE.overlayEl.style.opacity = '1';
  }
  function hideOverlay() {
    if (!STATE.overlayEl) return;
    STATE.overlayEl.style.transition = 'opacity ' + STATE.settings.overlayFadeMs + 'ms linear';
    STATE.overlayEl.style.opacity = '0';
    STATE.lastShownText = '';
  }
  document.addEventListener('fullscreenchange', () => ensureOverlay());
  document.addEventListener('webkitfullscreenchange', () => ensureOverlay());

  window.CinemaGazer = {
    registerAdapter(adapter) {
      STATE.adapter = adapter;
      log('adapter registered:', adapter.name);
      start();
    },
    info() {
      const cur = STATE.currentIntervals;
      const stores = [...STATE.subtitleStores.entries()].map(([url, v]) => ({
        url: url.slice(0, 100),
        cues: v.intervals.length,
        first: v.intervals[0],
        last: v.intervals[v.intervals.length - 1]
      }));
      const out = {
        interceptorReady: STATE.interceptorReady,
        adapter: STATE.adapter && STATE.adapter.name,
        videoFound: !!STATE.video,
        videoCurrentTime: STATE.video && STATE.video.currentTime,
        videoPlaybackRate: STATE.video && STATE.video.playbackRate,
        videoDuration: STATE.video && STATE.video.duration,
        desiredRate: STATE.desiredRate,
        currentCueCount: cur.length,
        firstCue: cur[0],
        lastCue: cur[cur.length - 1],
        compressionRatio: computeCompressionRatio(),
        stores,
        settings: STATE.settings
      };
      console.group('%c[CinemaGazer] info', 'color:#c33;font-weight:bold');
      console.log(out);
      console.groupEnd();
      return out;
    }
  };

  async function start() {
    await loadSettings();
    applySettingsImmediate();
    injectInterceptor();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', watchForVideo, { once: true });
    } else {
      watchForVideo();
    }
  }
})();
