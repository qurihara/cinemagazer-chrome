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
    compressionCache: { duration: 0, cueCount: 0, settingsHash: '', ratio: null },
    // DOM観察ベースのフォールバック（XHRで字幕が取れなかった時用）
    domObserverActive: false,
    domSubtitleText: '',
    domSubtitleInSpeech: false,
    domSilenceStartedAtVideoTime: -1,  // 字幕が消えた瞬間の video.currentTime
    lastSubtitleHandledAt: 0,
    // 次エピソード先読み対策: 現在の字幕がある状態で新しい字幕が届いたら pending として保留し、
    // URL変化（=エピソード切替）のタイミングで current に昇格させる。
    pendingIntervals: null,
    pendingIntervalsUrl: ''
  };

  const log  = (...a) => console.log('%c[CinemaGazer]', 'color:#c33;font-weight:bold', ...a);
  const warn = (...a) => console.warn('[CinemaGazer]', ...a);

  // i18n: chrome.i18n.getMessage のラッパー（取得できなければフォールバック文字列を返す）
  // 関数名は tick() 内の `const t = v.currentTime` と衝突するため 'i18n' とする
  function i18n(key, fallback) {
    try {
      if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
        const m = chrome.i18n.getMessage(key);
        if (m) return m;
      }
    } catch (e) {}
    return fallback;
  }

  // 秒数を H:MM:SS / M:SS にフォーマット
  function formatHMS(sec) {
    if (sec == null || !isFinite(sec) || sec < 0) return null;
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return h > 0 ? (h + ':' + pad(m) + ':' + pad(s)) : (m + ':' + pad(s));
  }

  // 残り視聴時間を、現在の圧縮率で見続けた場合の見積もりとして算出。
  // XHRモード（全体の圧縮率が計算可能）でのみ意味のある値を返す。
  // DOMフォールバック時は cue 配列が無く、瞬間 playbackRate での外挿は精度が悪い（速度がピョコピョコ切り替わるため）ので null を返して非表示にする。
  function computeRemainingViewingTime() {
    const v = STATE.video;
    if (!v || !isFinite(v.duration) || v.duration <= 0) return null;
    const ratio = computeCompressionRatio();
    if (ratio == null || ratio <= 0) return null;
    const remaining = Math.max(0, v.duration - v.currentTime);
    return remaining * ratio;
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
    const v = STATE.video;
    if (v && isFinite(v.duration) && l[1] > v.duration * 1.5) {
      warn('subtitle last_end (' + l[1].toFixed(1) + 's) >> video.duration ('
           + v.duration.toFixed(1) + 's). tickRate/frameRate 解釈ミスの可能性。');
    }
    // 既に current がある = 視聴中のエピソードに字幕が付いている。
    // この状態で新しい字幕が届くのは「次エピソードのプリロード」のケースが多い（Netflix特有）。
    // そのまま上書きすると視聴中エピソードに次エピソードの cue が混入してしまうので、
    // pending に保留して URL変化（エピソード切替）のタイミングで current に昇格させる。
    if (STATE.currentIntervals.length > 0) {
      STATE.pendingIntervals = intervals;
      STATE.pendingIntervalsUrl = url;
      log('subtitle queued (pending, will swap on URL change): ' + intervals.length + ' cues  '
          + 'first=' + f[0].toFixed(2) + 's last_end=' + l[1].toFixed(2) + 's  '
          + 'url=' + url.slice(0, 80));
    } else {
      STATE.currentIntervals = intervals;
      STATE.currentIntervalIdx = -1;
      STATE.compressionCache.cueCount = -1;
      STATE.lastSubtitleHandledAt = Date.now();
      log('subtitle parsed: ' + intervals.length + ' cues  '
          + 'first=' + f[0].toFixed(2) + 's last_end=' + l[1].toFixed(2) + 's  '
          + 'url=' + url.slice(0, 80));
    }
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
    let usedDomFallback = false;
    if (STATE.currentIntervals.length) {
      const idx = findCueAt(tCue);
      inSpeech = (idx >= 0);
    } else if (STATE.domObserverActive) {
      // フォールバック: ネイティブ字幕DOMの観察結果を使う
      inSpeech = STATE.domSubtitleInSpeech;
      usedDomFallback = true;
    } else {
      inSpeech = true;
    }

    let target;
    if (usedDomFallback) {
      // DOMフォールバック時は cue 配列が無いので gap 長さを正確に測れない。
      // video.currentTime ベースで「直近の音声終了からどれだけ経ったか」を計測し、
      // silentMinGap 秒以上沈黙していれば silentRate に切り替える。
      if (inSpeech) {
        STATE.domSilenceStartedAtVideoTime = -1;
        target = STATE.settings.speechRate;
      } else {
        if (STATE.domSilenceStartedAtVideoTime < 0) {
          STATE.domSilenceStartedAtVideoTime = t;
        }
        const silenceDur = t - STATE.domSilenceStartedAtVideoTime;
        target = (silenceDur >= STATE.settings.silentMinGap)
          ? STATE.settings.silentRate
          : STATE.settings.speechRate;
      }
    } else if (inSpeech) {
      target = STATE.settings.speechRate;
    } else if (inSilentGapLongEnough(tCue)) {
      target = STATE.settings.silentRate;
    } else {
      target = STATE.settings.speechRate;
    }
    setRate(target);

    if (STATE.settings.overlayEnabled) {
      if (STATE.currentIntervals.length) {
        const idx = STATE.currentIntervalIdx;
        const cue = (idx >= 0 && STATE.currentIntervals[idx]) || null;
        if (cue && cue[0] <= tCue && tCue < cue[1]) showOverlay(cue[2]);
        else hideOverlay();
      } else if (usedDomFallback && STATE.domSubtitleText) {
        // DOMフォールバック時は観察したテキストをそのまま中央表示
        showOverlay(STATE.domSubtitleText);
      } else {
        hideOverlay();
      }
    } else if (STATE.overlayEl) {
      hideOverlay();
    }

    if (STATE.hudEl) {
      const cueCount = STATE.currentIntervals.length;
      // ラベル: cue配列モード or DOMフォールバックモード or 未捕捉
      let label;
      if (cueCount > 0 || usedDomFallback) {
        label = inSpeech ? i18n('hudSpeech', '音声') : i18n('hudSilent', '非音声');
      } else {
        label = '—';
      }
      const ratio = computeCompressionRatio();
      // tail: 圧縮率（XHRモード時のみ計算可）/ 状態（DOMモードは省略 = 動作中で表示なし）
      let tail = '';
      if (ratio != null) {
        const pct = Math.round((1 - ratio) * 100);
        tail = pct + i18n('hudCompressedSuffix', '% 圧縮');
      } else if (!usedDomFallback) {
        if (STATE.interceptorReady) {
          tail = i18n('hudNotCaptured', '字幕未取得');
        } else {
          tail = i18n('hudInit', 'init…');
        }
      }
      // 残り視聴時間（このペースで見続けた場合の見積もり）
      const remSec = computeRemainingViewingTime();
      const remStr = formatHMS(remSec);
      let remPart = '';
      if (remStr) {
        const tpl = i18n('hudRemainingFormat', '残り {time}');
        remPart = tpl.replace('{time}', remStr);
      }
      const parts = [label, target.toFixed(2) + '×'];
      if (tail) parts.push(tail);
      if (remPart) parts.push(remPart);
      STATE.hudEl.textContent = parts.join('  ');
      // tooltip にモード説明を表示
      const modeHint = usedDomFallback
        ? '字幕情報をプレイヤー画面から直接観察中。動作は正常ですが、全体の圧縮率は表示できません。'
        : (cueCount > 0 ? '字幕タイミング情報を取得し動作中。' : '字幕の取得を待機中。');
      STATE.hudEl.title = modeHint + '\n' + i18n('hudClickHint', 'クリックでCinemaGazer設定を開く');
      let bg;
      if (cueCount === 0 && !usedDomFallback) bg = 'rgba(120,120,120,.85)';
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

  // DOM観察によるフォールバック字幕検出。
  // Netflix/Prime が画面に描画している字幕テキストを MutationObserver で監視し、
  // 「字幕が表示されている＝音声中」「消えている＝非音声中」として inSpeech を判定する。
  // 利点: XHRフックが届かない場合（service worker経由配信、内部キャッシュ、URLパターン変更）でも動く。
  // 欠点: 先読みできないため compression ratio は概算しか出せない。
  const NATIVE_SUBTITLE_SELECTORS = [
    '.player-timedtext',
    '[data-uia="player-timedtext"]',
    '.player-timedtext-text-container',
    '.atvwebplayersdk-captions-overlay',
    '.atvwebplayersdk-captions-text',
    '[class*="captions-overlay"]',
    '[class*="captionsOverlay"]'
  ];
  function readNativeSubtitleText() {
    for (const sel of NATIVE_SUBTITLE_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) {
        const t = (el.textContent || '').trim();
        if (t) return t;
      }
    }
    return '';
  }
  function startSubtitleDOMObserver() {
    if (STATE.domObserverActive) return;
    STATE.domObserverActive = true;
    const update = () => {
      const text = readNativeSubtitleText();
      if (text !== STATE.domSubtitleText) {
        STATE.domSubtitleText = text;
        STATE.domSubtitleInSpeech = !!text;
      }
    };
    // プレイヤーコンテナを subtree 監視。childList/characterData ともに見て字幕の更新を逃さない。
    const playerSel = '[data-uia="player"], .NFPlayer, .webPlayerSDKContainer, [id^="atvwebplayersdk"]';
    const attachObserver = () => {
      const player = document.querySelector(playerSel) || document.body;
      const mo = new MutationObserver(update);
      mo.observe(player, { childList: true, subtree: true, characterData: true });
      log('DOM subtitle observer attached');
    };
    if (document.querySelector(playerSel)) {
      attachObserver();
    } else {
      // player要素出現待ち
      const wait = new MutationObserver(() => {
        if (document.querySelector(playerSel)) {
          wait.disconnect();
          attachObserver();
        }
      });
      wait.observe(document.documentElement, { childList: true, subtree: true });
    }
    // MutationObserverが characterData の取りこぼすケースに備え、200msの低頻度ポーリングも併用
    setInterval(update, 200);
  }

  function attachVideo(v) {
    if (!v || STATE.video === v) return;
    STATE.video = v;
    log('attached video', v);
    ensureHud();
    ensureOverlay();
    startSubtitleDOMObserver();
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
    // SPA遷移（タイトル切替/次エピソード）監視。
    //
    // 重要: Netflix は次エピソードの字幕XHRを URL変化の **直前** に先打ちすることがある。
    // そのため URL変化を検知した瞬間に無条件で currentIntervals をクリアすると、
    // 直前に届いた新エピソードの字幕まで消してしまう。
    // → URL変化の直近2秒以内に handleSubtitle が呼ばれていれば（=新字幕受信済み）、クリアしない。
    let lastUrl = location.href;
    let lastUrlChangeAt = 0;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastUrlChangeAt = Date.now();
        log('url change', lastUrl);
        if (STATE.pendingIntervals) {
          // プリロード済みの次エピソード字幕を昇格
          log('  → swap pending → current (' + STATE.pendingIntervals.length + ' cues)');
          STATE.currentIntervals = STATE.pendingIntervals;
          STATE.currentIntervalIdx = -1;
          STATE.compressionCache = { duration: 0, cueCount: 0, settingsHash: '', ratio: null };
          STATE.pendingIntervals = null;
          STATE.pendingIntervalsUrl = '';
          STATE.lastSubtitleHandledAt = Date.now();
        } else {
          log('  → no pending. clear currentIntervals; wait for new XHR / force-refresh');
          STATE.currentIntervals = [];
          STATE.currentIntervalIdx = -1;
          STATE.compressionCache = { duration: 0, cueCount: 0, settingsHash: '', ratio: null };
        }
        tryAttach();
      }
      // URL変化後3秒以内に字幕が来ていなければ警告ログ（デバッグ用）
      if (lastUrlChangeAt && Date.now() - lastUrlChangeAt > 3000 && STATE.currentIntervals.length === 0) {
        if (STATE.video && STATE.video.readyState >= 2 && STATE.video.currentTime > 1) {
          warn('URL変化後3秒経っても字幕が捕捉できていません。Netflix側で字幕がOFFのまま、または字幕XHRのURLパターンに変更があった可能性。');
          lastUrlChangeAt = 0; // 一度警告したら抑止
        }
      }
    }, 500);
  }

  function ensureHud() {
    if (!STATE.settings.showHud) return;
    if (STATE.hudEl && document.contains(STATE.hudEl)) return;
    const el = document.createElement('div');
    el.id = 'cg-hud';
    el.className = 'cg-hud';
    el.title = i18n('hudClickHint', 'クリックでCinemaGazer設定を開く');
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
        remainingViewingSec: computeRemainingViewingTime(),
        domObserverActive: STATE.domObserverActive,
        domSubtitleInSpeech: STATE.domSubtitleInSpeech,
        domSubtitleText: STATE.domSubtitleText,
        pendingIntervalsCount: STATE.pendingIntervals ? STATE.pendingIntervals.length : 0,
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
