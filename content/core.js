// CinemaGazer - core (Netflix / Prime共通の制御ロジック)
(function () {
  if (window.CinemaGazer) return;

  const STATE = {
    settings: {
      enabled: true,
      speechRate: 1.5,
      silentRate: 4.0,
      silentMinGap: 0.4,
      overlayEnabled: true,
      overlayFadeMs: 200,
      showHud: true,
      // 字幕の体感ズレを微調整 (秒, 正値=字幕を遅らせる, 負値=字幕を早める)
      subtitleOffset: 0.0,
      // サイト別の有効化トグル
      enableNetflix: true,
      enablePrime: false,
      // v0.3.x: 追加サービス（Disney+は動作確認済み、Huluは実験的）
      enableDisneyplus: false,
      enableHulu: false
    },
    subtitleStores: new Map(),
    currentIntervals: [],
    currentIntervalIdx: -1,
    // currentIntervals の出処（'xhr' | 'texttrack' | 'dom' | null）
    intervalSource: null,
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
    // 次エピソード先読み対策
    pendingIntervals: null,
    pendingIntervalsUrl: '',
    // TextTrack 観察ハンドル
    textTrackObserverAttached: false,
    textTrackRef: null,
    // 広告再生中フラグ（adapter.isAdPlaying() を tick() のキャッシュとして保持）
    adActive: false,
    // DAI(動的広告挿入)対策: 広告で進んだ currentTime 量(本編外)を積算し cue照合で差し引く
    adTimeOffset: 0,
    adLastTime: -1,
    // xhr-segmented(Disney+等)のレジューム再生対策:
    // 続きから再生では video.currentTime がレジューム地点=0 の相対時刻になるが、
    // 字幕cueは作品先頭=0 の絶対時刻。両者の差(=segOffset秒)を、メディアセグメントURLの
    // pts(90kHz絶対時刻) と video.buffered 末尾(currentTime空間)の対応から推定する。
    //   cue絶対時刻 = video.currentTime + segOffset
    segOffset: 0,
    sawTso: false,          // MSE timestampOffset を一度でも観測したか(=MSE再生中か)
    segOffsetLocked: false,
    segFirstPlayAt: 0
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

  // HUDの幅を安定させるためのユーティリティ。U+2007 (FIGURE SPACE) は
  // 等幅数字と同じ幅を持つので、CSS の font-variant-numeric: tabular-nums と
  // 組み合わせると、桁数が変わっても表示幅がブレない。
  const FIGSP = ' ';
  function padLeftFig(s, w) {
    s = String(s);
    return s.length >= w ? s : FIGSP.repeat(w - s.length) + s;
  }
  function padRightFig(s, w) {
    s = String(s);
    return s.length >= w ? s : s + FIGSP.repeat(w - s.length);
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
    // xhr-segmented (Disney+等) は再生位置周辺のcueしか手元に無く、全編の圧縮率は
    // 計算できない(部分cueで計算すると大幅に過大評価する)ため表示しない。
    if (STATE.adapter && STATE.adapter.subtitleStrategy === 'xhr-segmented') return null;
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

  // URLクエリ/ハッシュから「シェア用パラメータ」を読んで設定をオーバーライド。
  // 例: https://www.netflix.com/watch/82047157?ss=1.4&ns=3.0&ov=1
  // 保存設定（chrome.storage）は変更せず、当該ページ上のメモリのみ書き換える。
  const URL_PARAM_MAP = {
    ss: { key: 'speechRate',     type: 'float', lo: 0.5, hi: 8.0 },
    ns: { key: 'silentRate',     type: 'float', lo: 0.5, hi: 16.0 },
    mg: { key: 'silentMinGap',   type: 'float', lo: 0,   hi: 2.0 },
    to: { key: 'subtitleOffset', type: 'float', lo: -5,  hi: 5 },
    ov: { key: 'overlayEnabled', type: 'bool' },
    hud:{ key: 'showHud',        type: 'bool' },
    cg: { key: 'enabled',        type: 'bool' }
  };
  function parseUrlOverrides() {
    const overrides = {};
    let sp, hp;
    try { sp = new URLSearchParams(location.search); } catch (e) { sp = new URLSearchParams(); }
    try { hp = new URLSearchParams((location.hash || '').replace(/^#/, '')); } catch (e) { hp = new URLSearchParams(); }
    for (const [pname, spec] of Object.entries(URL_PARAM_MAP)) {
      let raw = sp.get(pname);
      if (raw == null) raw = hp.get(pname);
      if (raw == null) continue;
      if (spec.type === 'float') {
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) continue;
        overrides[spec.key] = Math.min(spec.hi, Math.max(spec.lo, n));
      } else if (spec.type === 'bool') {
        overrides[spec.key] = /^(1|true|on|yes)$/i.test(raw);
      }
    }
    return overrides;
  }

  // アダプタ名 → 設定キーの対応。Netflix のみ既定ON、他は明示的にtrueで有効。
  const SITE_ENABLE_KEY = {
    netflix:    'enableNetflix',
    prime:      'enablePrime',
    disneyplus: 'enableDisneyplus',
    hulu:       'enableHulu'
  };
  function isSiteEnabled(name) {
    if (!name) return false;
    const key = SITE_ENABLE_KEY[name];
    if (!key) return false;
    const v = STATE.settings[key];
    if (name === 'netflix') return v !== false; // Netflix のみ既定 ON
    return v === true;
  }

  async function loadSettings() {
    try {
      const s = await chrome.storage.sync.get(null);
      Object.assign(STATE.settings, s);
    } catch (e) { warn('settings load failed', e); }
    // URL overrides をメモリ上で適用（保存はしない）
    const ov = parseUrlOverrides();
    if (Object.keys(ov).length) {
      Object.assign(STATE.settings, ov);
      STATE.urlOverrides = ov;
      log('URL overrides applied (session-only):', ov);
    } else {
      STATE.urlOverrides = null;
    }
  }
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k of Object.keys(changes)) {
      const nv = changes[k].newValue;
      if (nv !== undefined) STATE.settings[k] = nv;
    }
    applySettingsImmediate();
  });
  chrome.runtime?.onMessage?.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'CG_SETTINGS_UPDATED' && msg.settings) {
      Object.assign(STATE.settings, msg.settings);
      applySettingsImmediate();
    } else if (msg && msg.type === 'CG_GET_SHARE_URL') {
      try {
        sendResponse({ url: makeShareUrl() });
      } catch (e) {
        sendResponse({ url: null, error: String(e) });
      }
      return true; // sync response, but explicit return true to keep channel open
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
    } else if (d.type === 'CG_MEDIA_TSO') {
      recordTimestampOffset(d.tso);
    } else if (d.type === 'CG_INTERCEPTOR_READY') {
      STATE.interceptorReady = true;
      log('interceptor ready');
    }
  });

  function handleSubtitle(url, body) {
    if (!body) return;
    // texttrack-preferred のアダプタで TextTrack 由来 cue が入っている場合は
    // XHR 由来データで上書きしない（DAI 広告ズレ問題を避ける）。
    if (STATE.intervalSource === 'texttrack' && STATE.currentIntervals.length > 0
        && STATE.adapter && STATE.adapter.subtitleStrategy === 'texttrack-preferred') {
      return;
    }
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
    // セグメント配信サイト (Disney+ 等): HLS の WebVTT を再生位置周辺の範囲単位で
    // 配信してくる。cue 時刻は絶対時刻 (X-TIMESTAMP-MAP なし) なので、断片を
    // currentIntervals へ逐次マージする。pending 保留 (Netflix の次エピソード
    // 先読み対策) はセグメント配信では誤動作するため通さない。
    // 制約: プレイヤー内で字幕言語を切り替えると新旧言語の cue が混在しうる
    // (シーク or リロードで解消)。
    if (STATE.adapter && STATE.adapter.subtitleStrategy === 'xhr-segmented') {
      mergeSegmentedIntervals(intervals, url);
      return;
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
      STATE.intervalSource = 'xhr';
      STATE.lastSubtitleHandledAt = Date.now();
      log('subtitle parsed: ' + intervals.length + ' cues  '
          + 'first=' + f[0].toFixed(2) + 's last_end=' + l[1].toFixed(2) + 's  '
          + 'url=' + url.slice(0, 80));
    }
  }

  // セグメント化 WebVTT の断片を currentIntervals へマージする (xhr-segmented 用)。
  // (start, end, text) が一致する cue は重複として捨てる。
  function mergeSegmentedIntervals(intervals, url) {
    const existing = STATE.currentIntervals;
    const keyOf = (iv) => iv[0].toFixed(3) + '|' + iv[1].toFixed(3) + '|' + iv[2];
    const seen = new Set(existing.map(keyOf));
    let added = 0;
    for (const iv of intervals) {
      const k = keyOf(iv);
      if (!seen.has(k)) { existing.push(iv); seen.add(k); added++; }
    }
    if (added === 0) return;
    existing.sort((a, b) => a[0] - b[0]);
    STATE.currentIntervalIdx = -1;
    STATE.intervalSource = 'xhr';
    STATE.compressionCache.cueCount = -1;
    STATE.compressionCache.settingsHash = '';
    STATE.lastSubtitleHandledAt = Date.now();
    log('subtitle segment merged: +' + added + ' cues (total ' + existing.length + ')  url=' + url.slice(0, 80));
  }

  // MSE の timestampOffset から segOffset を確定する(推定でなく厳密)。
  //   presentation(currentTime) = internal(cue絶対時刻) + timestampOffset
  //   ⇒ cue絶対時刻 = currentTime - timestampOffset,  segOffset = -timestampOffset
  // xhr-segmented のレジューム再生でcueがズレる問題の本命補正。cue範囲との整合で検証。
  function recordTimestampOffset(tso) {
    if (!(STATE.adapter && STATE.adapter.subtitleStrategy === 'xhr-segmented')) return;
    if (typeof tso !== 'number' || !isFinite(tso)) return;
    STATE.sawTso = true; // MSE再生中と確定 → offset=0フォールバックには落とさない
    const offset = -tso;
    if (STATE.segOffsetLocked && Math.abs(offset - STATE.segOffset) < 0.5) return; // 変化なし
    if (!isSegOffsetPlausible(offset)) return; // cueと整合しない値は弾く(念のため)
    const changed = !STATE.segOffsetLocked || Math.abs(offset - STATE.segOffset) >= 0.5;
    STATE.segOffset = offset;
    STATE.segOffsetLocked = true;
    if (changed) {
      STATE.currentIntervalIdx = -1; // オフセット変化 → cue探索位置をリセット
      log('segOffset locked: ' + offset.toFixed(1) + 's (from MSE timestampOffset, resume-aware)');
    }
  }

  // 補正後の再生位置が読み込み済みcue範囲の近傍に入るか(=timestampOffset解釈の妥当性)。
  // cue未取得時は検証不能だが厳密値なので暫定的に受理する。
  function isSegOffsetPlausible(offset) {
    const v = STATE.video;
    const arr = STATE.currentIntervals;
    if (!v || !arr.length) return true;
    const now = v.currentTime + offset;
    return now >= arr[0][0] - 600 && now <= arr[arr.length - 1][1] + 600;
  }

  // MSE timestampOffset が観測できないケース(currentTimeが絶対時刻のHTML5プログレッシブ
  // 動画・非MSEサイト・e2eモック等)のフォールバック: 再生開始から一定時間 timestampOffset が
  // 一度も来なければ offset=0 で確定する(=currentTimeが絶対時刻とみなす)。
  // Disney+のレジューム再生では最初のappendBufferで速やかに届くため、この分岐には落ちない。
  function maybeFallbackLockSegOffset(t) {
    if (STATE.segOffsetLocked) return;
    if (!(t > 0)) return; // 再生開始前
    if (!STATE.segFirstPlayAt) STATE.segFirstPlayAt = performance.now();
    if (STATE.sawTso) return; // MSE再生中 → timestampOffset確定に委ねる(0に倒さない)
    if (performance.now() - STATE.segFirstPlayAt > 6000) {
      STATE.segOffset = 0;
      STATE.segOffsetLocked = true;
      log('segOffset fallback lock: 0s (no MSE timestampOffset observed; assuming absolute currentTime)');
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

  // 自動プレビュー(トレーラー)判定。動画詳細ページ等では本編でない自動プレビューが
  // 0x0 / 微小 / 画面外の video 要素として再生される。そこへ高速化やHUDを出すのは
  // 無意味なので、エンジン制御の対象外にする。muted では判定しない（ミュートで字幕だけ
  // 追う実鑑賞もあるため）。実寸・可視性で「実プレイヤーか否か」を見る。実プレイヤー
  // （全画面・ビューポートの大部分を占有）は対象のまま＝通常再生には影響しない。
  function isLikelyPreviewVideo(v) {
    if (!v) return false;
    if (document.fullscreenElement || document.webkitFullscreenElement) return false;
    const w = v.offsetWidth, h = v.offsetHeight;
    if (w === 0 || h === 0) return true; // 非表示/0サイズ = プレビュー
    const vpArea = (window.innerWidth || 1) * (window.innerHeight || 1);
    if (w * h < vpArea * 0.15) return true; // ビューポートの15%未満 = 実プレイヤーでない
    const r = v.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= (window.innerHeight || 0)) return true; // 画面外
    return false;
  }

  function tick() {
    STATE.rafId = null;
    const v = STATE.video;
    if (!v || v.readyState < 1) {
      STATE.rafId = requestAnimationFrame(tick);
      return;
    }
    // 詳細ページの自動プレビュー等はエンジン制御せず、本来の再生に任せる
    // （速度は等倍へ戻し、HUD/オーバーレイは出さない）。
    if (isLikelyPreviewVideo(v)) {
      setRate(1.0);
      if (STATE.hudEl) STATE.hudEl.style.display = 'none';
      if (STATE.overlayEl) STATE.overlayEl.style.display = 'none';
      document.documentElement.classList.remove('cg-overlay-active');
      STATE.rafId = requestAnimationFrame(tick);
      return;
    }
    // 全体OFF / サイト別OFF の場合は何もしない（HUD/Overlayも隠す）
    const adapterName = STATE.adapter && STATE.adapter.name;
    const siteEnabled = isSiteEnabled(adapterName);
    // adapter.isAdPlaying は Prime 等で広告区間検出に使う任意フック。
    // 広告中は速度切替を行わず（ネイティブ再生に任せ）、字幕オフセット累積を避ける。
    let adActive = false;
    try {
      if (STATE.adapter && typeof STATE.adapter.isAdPlaying === 'function') {
        adActive = !!STATE.adapter.isAdPlaying();
      }
    } catch (e) { adActive = false; }
    STATE.adActive = adActive;
    // DAI対策: 広告中は currentTime が進むが XHR字幕cueは本編タイムライン基準。
    // 広告中の currentTime 進行量を adTimeOffset に積算し、cue照合時に差し引く。
    if (adActive) {
      if (STATE.adLastTime >= 0) {
        const _d = v.currentTime - STATE.adLastTime;
        if (_d > 0 && _d < 2.0) STATE.adTimeOffset += _d; // シーク等の飛びは無視
      }
      STATE.adLastTime = v.currentTime;
    } else {
      STATE.adLastTime = -1;
    }
    if (!STATE.settings.enabled || !siteEnabled || adActive) {
      if (adActive) setRate(1.0); // 広告中は等倍
      if (STATE.hudEl) {
        if (adActive && STATE.settings.showHud && siteEnabled && STATE.settings.enabled) {
          STATE.hudEl.style.display = 'block';
          STATE.hudEl.textContent = 'AD  1.00×';
          STATE.hudEl.style.background = 'rgba(120,120,120,.7)';
        } else {
          STATE.hudEl.style.display = 'none';
        }
      }
      if (STATE.overlayEl) STATE.overlayEl.style.display = 'none';
      document.documentElement.classList.remove('cg-overlay-active');
      STATE.rafId = requestAnimationFrame(tick);
      return;
    } else {
      // サイト有効時はユーザ設定に従って表示
      if (STATE.hudEl) STATE.hudEl.style.display = STATE.settings.showHud ? 'block' : 'none';
      if (STATE.overlayEl) STATE.overlayEl.style.display = STATE.settings.overlayEnabled ? 'block' : 'none';
      // 広告中ブランチで外した cg-overlay-active を再付与する。これが無いと広告後に
      // ネイティブ字幕の非表示CSSが効かなくなり、中央字幕と二重表示になる。
      document.documentElement.classList.toggle('cg-overlay-active', !!STATE.settings.overlayEnabled);
    }

    // 体感ズレ補正: t (動画時刻) を字幕時刻軸に揃える
    //   subtitleOffset > 0 なら字幕を遅らせて表示 → 動画時刻から差し引いた値で cue 検索
    const off = Number(STATE.settings.subtitleOffset) || 0;
    // XHR由来cueは本編時刻基準なので DAI広告分(adTimeOffset)を差し引く。
    // texttrack由来はブラウザがメディア時刻(広告込み)で提供するので差し引かない。
    const adOff = (STATE.intervalSource === 'xhr') ? STATE.adTimeOffset : 0;
    const t = v.currentTime;
    const isSegmented = STATE.adapter && STATE.adapter.subtitleStrategy === 'xhr-segmented';
    // xhr-segmented はレジューム再生でcue(絶対時刻)とcurrentTime(相対)がズレるため
    // segOffsetで補正する。確定前のフォールバック処理もここで行う。
    if (isSegmented) maybeFallbackLockSegOffset(t);
    const segOff = (isSegmented && STATE.segOffsetLocked) ? STATE.segOffset : 0;
    const tCue = t + segOff - off - adOff;
    let inSpeech = false;
    let usedDomFallback = false;
    if (STATE.currentIntervals.length) {
      if (isSegmented && !STATE.segOffsetLocked) {
        // オフセット未確定中は等速側(安全)。誤ったcue照合で4x暴走させない。
        inSpeech = true;
      } else {
        const idx = findCueAt(tCue);
        inSpeech = (idx >= 0);
        // xhr-segmented (Disney+等): cue はマージ済み範囲しか無い。範囲外(未取得区間)を
        // 「無音」と断定すると 4x で字幕バッファを追い越して暴走する(会話も高速再生・
        // エピソードを走り切る)ため、カバレッジ外は音声扱い(speechRate)に倒す。
        if (!inSpeech && isSegmented) {
          const first = STATE.currentIntervals[0];
          const last = STATE.currentIntervals[STATE.currentIntervals.length - 1];
          if (tCue > last[1] || tCue < first[0] - 30) inSpeech = true;
        }
      }
    } else if (STATE.domObserverActive && !isSegmented) {
      // フォールバック: ネイティブ字幕DOMの観察結果を使う。
      // xhr-segmented はネイティブ字幕が closed shadow DOM 内で観察不能(常に「無音」に
      // 見える)ため対象外 → 下の else で音声扱いに落ちる(cue が届くまで安全側)。
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
      // Prime等(非Netflix)は DAI広告offsetの残差で XHR cue の照合時刻がズレることがある。
      // ネイティブ字幕DOMは常に正しい時刻なので、中央表示はそれに合わせる
      // (ネイティブはCSSで隠し、同じテキストを中央に出す＝二重表示も防ぐ)。
      // 速度判定・圧縮率は引き続き XHR cue を使う。
      // 例外: xhr-segmented (Disney+等) はネイティブ字幕が closed shadow DOM 内で
      // DOM監視が届かない (domSubtitleText が常に空) ため、cue 基準の表示に落とす。
      const preferNativeText =
        STATE.adapter && STATE.adapter.name !== 'netflix' && STATE.domObserverActive
        && STATE.adapter.subtitleStrategy !== 'xhr-segmented';
      if (preferNativeText) {
        if (STATE.domSubtitleText) showOverlay(STATE.domSubtitleText);
        else hideOverlay();
      } else if (STATE.currentIntervals.length) {
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
        // 「音声」と「非音声」で幅が異なってHUDがチラつくのを防ぐため、
        // 「音声」の前に「非」と同じ全角スペース(U+3000) を1つ入れて幅を揃える
        label = inSpeech ? i18n('hudSpeech', '　音声') : i18n('hudSilent', '非音声');
      } else {
        label = '—';
      }
      const ratio = computeCompressionRatio();
      // tail: 圧縮率（XHRモード時のみ計算可）/ 状態（DOMモードは省略 = 動作中で表示なし）
      let tail = '';
      // xhr-segmented のレジューム同期状態を優先表示(A: 安全ガードの可視化)
      if (isSegmented && cueCount > 0 && !STATE.segOffsetLocked) {
        // 再生開始直後の短い同期待ち / 長引く場合は同期不可(=最初から再生を促す)
        const playedMs = STATE.segFirstPlayAt ? (performance.now() - STATE.segFirstPlayAt) : 0;
        tail = (playedMs > 25000)
          ? i18n('hudSyncFailed', '同期不可(最初から再生)')
          : i18n('hudSyncing', '同期中…');
      } else if (ratio != null) {
        const pct = Math.round((1 - ratio) * 100);
        // 圧縮率は0–99% (時に100%超もありうるが稀)。3桁分の幅で固定。
        tail = padLeftFig(pct, 3) + i18n('hudCompressedSuffix', '% 圧縮');
      } else if (!usedDomFallback && cueCount === 0) {
        // cue がある場合は ratio が出せなくても「字幕未取得」とは表示しない
        // (xhr-segmented は cue があっても ratio 非表示のため)
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
        // 「H:MM:SS」(7) を最大幅と仮定して左パディング
        remPart = tpl.replace('{time}', padLeftFig(remStr, 7));
      }
      // 速度: 0.50–16.00 までを5文字幅 (XX.XX) で固定
      const rateStr = padLeftFig(target.toFixed(2), 5) + '×';
      const parts = [label, rateStr];
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
    // Netflix
    '.player-timedtext',
    '[data-uia="player-timedtext"]',
    '.player-timedtext-text-container',
    // Prime Video
    '.atvwebplayersdk-captions-overlay',
    '.atvwebplayersdk-captions-text',
    // Disney+ (実DOM: div.dss-hls-subtitle-overlay > span.dss-subtitle-renderer-cue
    //  bugzilla.mozilla.org/1766273 で確認。cue-window があれば複数行を一括で拾える)
    '.dss-subtitle-renderer-cue-window',
    '.dss-subtitle-renderer-cue',
    '.dss-hls-subtitle-overlay',
    '.dss-subtitle-overlay',
    '.dss-captions-renderer',
    '.dss-subtitle-renderer-line',
    '.btm-media-overlays-container [class*="caption"]',
    '.btm-media-overlays-container [class*="subtitle"]',
    // Hulu (US/JP)
    '.CaptionBox',
    '.caption-text-box',
    '[data-automationid*="captions"]',
    '[data-automationid*="subtitle"]',
    // 汎用フォールバック
    '[class*="captions-overlay"]',
    '[class*="captionsOverlay"]',
    '[class*="captionContainer"]',
    '[class*="captioncontainer"]'
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
    const playerSel = [
      // Netflix
      '[data-uia="player"]', '.NFPlayer',
      // Prime Video
      '.webPlayerSDKContainer', '[id^="atvwebplayersdk"]',
      // Disney+
      '.btm-media-client-element', '.btm-media-overlays-container',
      // Hulu
      '.PlayerContainer', '.controls__player-container', '[data-testid="player-container"]'
    ].join(', ');
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

  // Disney+(hive)のネイティブ字幕は open shadow DOM(<timed-text-override-region>)内に
  // 描画されるため、コンテンツスクリプトのCSS(html.cg-overlay-active ...)が届かない。
  // shadowRoot内に直接 hiding style を注入して中央オーバーレイと二重表示にならないようにする。
  // overlayEnabled=false(中央表示OFF)のときは注入を外してネイティブを表示に戻す。
  let cgNativeShadowRoot = null;
  function findNativeSubtitleShadowRoot() {
    if (cgNativeShadowRoot && cgNativeShadowRoot.host && cgNativeShadowRoot.host.isConnected) {
      return cgNativeShadowRoot;
    }
    cgNativeShadowRoot = null;
    // 主経路: hiveのカスタム要素タグから(安価)
    const host = document.querySelector('timed-text-override-region');
    if (host && host.shadowRoot &&
        host.shadowRoot.querySelector('.hive-subtitle-renderer-wrapper, .hive-subtitle-renderer-cue-window')) {
      cgNativeShadowRoot = host.shadowRoot;
      return cgNativeShadowRoot;
    }
    // フォールバック: 全要素走査(タグ名変更に備える)
    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const sr = all[i].shadowRoot;
      if (sr && sr.querySelector('.hive-subtitle-renderer-wrapper, .hive-subtitle-renderer-cue-window')) {
        cgNativeShadowRoot = sr;
        return sr;
      }
    }
    return null;
  }
  function applyNativeShadowSubtitleHiding() {
    // hiveネイティブ字幕を隠すのは中央オーバーレイを出す非Netflix(Disney等)のみ
    if (!STATE.adapter || STATE.adapter.name === 'netflix') return;
    const sr = findNativeSubtitleShadowRoot();
    if (!sr) return;
    const want = !!STATE.settings.overlayEnabled;
    let st = sr.getElementById('cg-hide-native');
    if (want && !st) {
      st = document.createElement('style');
      st.id = 'cg-hide-native';
      st.textContent = '.hive-subtitle-renderer-wrapper,.hive-subtitle-renderer-cue-window,.hive-subtitle-renderer-cue{display:none!important;visibility:hidden!important}';
      sr.appendChild(st);
    } else if (!want && st) {
      st.remove();
    }
  }

  // ====================================================================
  // TextTrack 観察: <video>.textTracks の cue を currentIntervals に流し込む。
  //
  // 利点:
  //   - cue が「メディア時刻」で得られる（ブラウザが DAI 広告挿入分をオフセット済み）
  //   - XHR で字幕URLを捕まえなくても動く → Disney+/Hulu に有効
  //   - Prime Video の広告ズレ問題への根本解決策
  //
  // 採用条件:
  //   - adapter.subtitleStrategy === 'texttrack-preferred' のとき有効化
  //   - ユーザがサイト側で字幕(captions/subtitles)を ON にしている必要あり
  //   - cue が無ければ何もしない（XHR/DOM フォールバックに譲る）
  // ====================================================================
  function startTextTrackObserver(video) {
    if (!video || STATE.textTrackObserverAttached) return;
    if (!video.textTracks) return;
    STATE.textTrackObserverAttached = true;
    const tracks = video.textTracks;

    function findActiveTrack() {
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        const kind = (t.kind || '').toLowerCase();
        if ((kind === 'subtitles' || kind === 'captions') && t.mode === 'showing') {
          return t;
        }
      }
      return null;
    }

    function populateFromTrack(t) {
      if (!t || !t.cues) return false;
      const cues = t.cues;
      if (!cues.length) return false;
      const arr = [];
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        if (c == null) continue;
        const s = c.startTime, e = c.endTime;
        if (!isFinite(s) || !isFinite(e) || e <= s) continue;
        const txt = (c.text || '').replace(/<[^>]+>/g, '').trim();
        arr.push([s, e, txt]);
      }
      if (!arr.length) return false;
      arr.sort((a, b) => a[0] - b[0]);
      STATE.currentIntervals = arr;
      STATE.currentIntervalIdx = -1;
      STATE.compressionCache = { duration: 0, cueCount: 0, settingsHash: '', ratio: null };
      STATE.intervalSource = 'texttrack';
      STATE.lastSubtitleHandledAt = Date.now();
      log('TextTrack cues populated: ' + arr.length + ' cues (source=texttrack)');
      return true;
    }

    function onCueChange() {
      if (STATE.textTrackRef && STATE.textTrackRef.cues
          && STATE.textTrackRef.cues.length !== STATE.currentIntervals.length) {
        populateFromTrack(STATE.textTrackRef);
      }
    }

    function syncTrack() {
      const t = findActiveTrack();
      if (t === STATE.textTrackRef) {
        if (t && t.cues && t.cues.length !== STATE.currentIntervals.length) populateFromTrack(t);
        return;
      }
      if (STATE.textTrackRef) {
        try { STATE.textTrackRef.removeEventListener('cuechange', onCueChange); } catch (e) {}
      }
      STATE.textTrackRef = t;
      if (t) {
        try { t.addEventListener('cuechange', onCueChange); } catch (e) {}
        populateFromTrack(t);
      } else {
        if (STATE.intervalSource === 'texttrack') {
          STATE.currentIntervals = [];
          STATE.currentIntervalIdx = -1;
          STATE.intervalSource = null;
          log('TextTrack: no showing track, cleared currentIntervals');
        }
      }
    }

    try { tracks.addEventListener && tracks.addEventListener('change', syncTrack); } catch (e) {}
    setInterval(syncTrack, 1000);
    syncTrack();
    log('TextTrack observer attached');
  }

  function attachVideo(v) {
    if (!v || STATE.video === v) return;
    STATE.video = v;
    // メディア切替/終了時のリセット
    //   - 広告オフセット(adTimeOffset): 全アダプタでリセット
    //   - 字幕状態(currentIntervals等): Netflix は preload+URL-swap で次エピソードへ
    //     引き継ぐので触らない。Prime等(preload非対応)は新作品/再生終了で前作品の
    //     古いcueが残って無関係字幕が流れるのを防ぐためクリア(pendingがあれば昇格)。
    STATE.adTimeOffset = 0;
    STATE.adLastTime = -1;
    try {
      const _resetAdOff = function () { STATE.adTimeOffset = 0; STATE.adLastTime = -1; };
      const _resetSubs = function () {
        if (STATE.adapter && STATE.adapter.name === 'netflix') return; // Netflixはpreload/URL-swapに任せる
        if (STATE.pendingIntervals && STATE.pendingIntervals.length) {
          STATE.currentIntervals = STATE.pendingIntervals; // 新作品用に先着していれば昇格
          STATE.intervalSource = 'xhr';
        } else {
          STATE.currentIntervals = [];
          STATE.intervalSource = null;
        }
        STATE.pendingIntervals = null;
        STATE.pendingIntervalsUrl = '';
        STATE.currentIntervalIdx = -1;
        STATE.compressionCache = { duration: 0, cueCount: 0, settingsHash: '', ratio: null };
        // 新エピソード/メディアはタイムラインが別 → segOffsetを再確定させる
        STATE.segOffset = 0;
        STATE.sawTso = false;
        STATE.segOffsetLocked = false;
        STATE.segFirstPlayAt = 0;
        hideOverlay();
      };
      const _onMedia = function () { _resetAdOff(); _resetSubs(); };
      v.addEventListener('loadstart', _onMedia);
      v.addEventListener('emptied', _onMedia);
      v.addEventListener('ended', _onMedia);
      _resetSubs(); // 新しいvideo要素にattachした瞬間も前作品のcueをクリア(非Netflix)
    } catch (e) {}
    STATE.textTrackObserverAttached = false;
    STATE.textTrackRef = null;
    log('attached video', v);
    ensureHud();
    ensureOverlay();
    startSubtitleDOMObserver();
    if (STATE.adapter && STATE.adapter.subtitleStrategy === 'xhr-segmented') {
      // Disney+(hive)のネイティブ字幕を shadow DOM 内で隠す(500ms間隔で再アサート)
      if (!STATE.nativeHideTimer) STATE.nativeHideTimer = setInterval(applyNativeShadowSubtitleHiding, 500);
    }
    if (STATE.adapter && STATE.adapter.subtitleStrategy === 'texttrack-preferred') {
      startTextTrackObserver(v);
    }
    if (!STATE.rafId) STATE.rafId = requestAnimationFrame(tick);
    startRateGuard();
  }
  function detachVideo() {
    STATE.video = null;
    if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
    STATE.rafId = null;
    stopRateGuard();
    // HUD と オーバーレイを隠す（対象外ページに遷移したケース等）
    if (STATE.hudEl) STATE.hudEl.style.display = 'none';
    if (STATE.overlayEl) STATE.overlayEl.style.display = 'none';
    document.documentElement.classList.remove('cg-overlay-active');
  }

  function findVideoDefault() {
    return document.querySelector('video');
  }
  function watchForVideo() {
    const tryAttach = () => {
      // adapter があれば adapter.findVideo() を信頼する（fallback には頼らない）。
      // これにより、Netflix の /browse など「対象外URL」で adapter が null を返したら
      // ブラウザ画面の予告編 video には反応しない。
      const v = (STATE.adapter && STATE.adapter.findVideo)
        ? STATE.adapter.findVideo()
        : findVideoDefault();
      if (v && v !== STATE.video) attachVideo(v);
      else if (!v && STATE.video) detachVideo();
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
      // 拡張の再読込で孤児化した旧content scriptは chrome.runtime.id が消える。
      // その状態で chrome.* を呼ぶと "Extension context invalidated" エラーになるので黙って停止。
      if (typeof chrome !== 'undefined' && chrome.runtime && !chrome.runtime.id) return;
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastUrlChangeAt = Date.now();
        log('url change', lastUrl);
        STATE.adTimeOffset = 0; STATE.adLastTime = -1; // 新エピソードで広告オフセットをリセット
        // URL overrides を新URLに対して再適用（無ければ保存設定に戻す）
        try {
          chrome.storage.sync.get(null).then(s => {
            Object.assign(STATE.settings, s);
            const ov = parseUrlOverrides();
            if (Object.keys(ov).length) {
              Object.assign(STATE.settings, ov);
              STATE.urlOverrides = ov;
              log('URL overrides re-applied after URL change:', ov);
            } else {
              STATE.urlOverrides = null;
            }
            applySettingsImmediate();
          }).catch(() => {});
        } catch (e) {}
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
          warn('URL変化後3秒経っても字幕が捕捉できていません。プレイヤー側で字幕がOFFのまま（字幕をONにしてください）、または字幕XHRのURLパターンに変更があった可能性。');
          lastUrlChangeAt = 0; // 一度警告したら抑止
        }
      }
    }, 500);
  }

  function hudHost() {
    // フルスクリーン中は fullscreenElement の子でないと描画されない
    return document.fullscreenElement || document.webkitFullscreenElement || document.documentElement;
  }
  function ensureHud() {
    if (!STATE.settings.showHud) return;
    const desiredHost = hudHost();
    // 既に作成済みで、かつ正しい親にいるなら何もしない
    if (STATE.hudEl && STATE.hudEl.parentNode === desiredHost) return;
    if (STATE.hudEl) {
      // 既存要素を新しいホストに再ペアレント
      desiredHost.appendChild(STATE.hudEl);
      return;
    }
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
    desiredHost.appendChild(el);
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
  document.addEventListener('fullscreenchange', () => { ensureOverlay(); ensureHud(); });
  document.addEventListener('webkitfullscreenchange', () => { ensureOverlay(); ensureHud(); });

  // 現在の設定を URL クエリにエンコードしたシェア用URLを生成。
  function makeShareUrl(opts) {
    const s = Object.assign({}, STATE.settings, opts || {});
    const url = new URL(location.href);
    const stripPrefixes = ['trackId', 'tctx', 'ref_', 'ref', 'pf_rd_', 'sr_', 'tag', '_encoding', 'jr_', 'qid', 'sprefix'];
    const sp = url.searchParams;
    for (const k of Array.from(sp.keys())) {
      if (stripPrefixes.some(p => k === p || k.startsWith(p))) sp.delete(k);
    }
    sp.set('ss', s.speechRate);
    sp.set('ns', s.silentRate);
    if (s.silentMinGap !== 0.4) sp.set('mg', s.silentMinGap);
    if (s.subtitleOffset !== 0) sp.set('to', s.subtitleOffset);
    if (s.overlayEnabled) sp.set('ov', '1');
    if (s.showHud === false) sp.set('hud', '0');
    if (s.enabled === false) sp.set('cg', '0');
    url.hash = '';
    return url.toString();
  }

  window.CinemaGazer = {
    registerAdapter(adapter) {
      STATE.adapter = adapter;
      log('adapter registered:', adapter.name);
      start();
    },
    makeShareUrl: makeShareUrl,
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
        urlOverrides: STATE.urlOverrides || null,
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
