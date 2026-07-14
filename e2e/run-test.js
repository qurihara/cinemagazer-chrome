#!/usr/bin/env node
// CinemaGazer E2E: 自動動作テスト
//
// dev拡張(dist-dev)をChromiumにロードし、ローカルtestbed(DRM不要のHTML5動画+
// WebVTT字幕)で エンジン全段: 注入 → アダプタ登録 → video検出 → cue取得 →
// 速度切替(音声1.5x/無音4.0x) → HUD/中央オーバーレイ表示 を検証する。
//
// 使い方: npm test   (build-dev-ext.js 実行後に本スクリプト)
// 環境変数: HEADED=1 でウィンドウ表示 / PORT で待受ポート変更
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = Number(process.env.PORT || 8123);
const DIST = path.join(__dirname, 'dist-dev');
const TESTBED = path.join(__dirname, 'testbed');
const SHOTS = path.join(__dirname, 'shots');
const HEADLESS = process.env.HEADED !== '1';

// ---- 字幕タイムライン (testbed/subs.vtt と一致させること) ----
const SPEECH_WINDOWS = [ [1.0, 3.0], [6.0, 8.0] ];
const SILENCE_WINDOW = [3.0, 6.0];
const MARGIN = 0.35; // 検知ラグ許容

function inWindow(t, [a, b], m) { return t >= a + m && t <= b - m; }
function isSpeechTime(t) { return SPEECH_WINDOWS.some(w => inWindow(t, w, MARGIN)); }
function isSilenceTime(t) { return inWindow(t, SILENCE_WINDOW, MARGIN); }

const MIME = { '.html': 'text/html', '.mp4': 'video/mp4', '.vtt': 'text/vtt' };
function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const file = path.join(TESTBED, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'player.html');
      if (!file.startsWith(TESTBED) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      // 動画のシークに必要な Range 対応(簡易)
      const stat = fs.statSync(file);
      const range = req.headers.range;
      const type = MIME[path.extname(file)] || 'application/octet-stream';
      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range);
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : stat.size - 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': type
        });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(file).pipe(res);
      }
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

async function samplePage(page) {
  return page.evaluate(() => {
    const v = document.querySelector('video');
    const hud = document.getElementById('cg-hud');
    const ov = document.getElementById('cg-overlay');
    // HUD/オーバーレイは position:fixed のため offsetParent は常に null。
    // computedStyle と描画矩形で可視判定する。
    const visible = el => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    return {
      t: v ? v.currentTime : -1,
      rate: v ? v.playbackRate : -1,
      paused: v ? v.paused : true,
      hudText: visible(hud) ? hud.textContent.trim() : null,
      overlayText: (ov && ov.style.display !== 'none') ? ov.textContent.trim() : null
    };
  });
}

async function runScenario(context, name, pagePath, urlParams, expect, extraChecks) {
  const page = await context.newPage();
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(msg.text()));
  await page.goto(`http://localhost:${PORT}${pagePath}${urlParams}`);
  await page.evaluate(() => document.querySelector('video')?.play().catch(() => {}));

  const samples = [];
  const deadline = Date.now() + 26000;
  let shotSpeech = false, shotSilence = false;
  fs.mkdirSync(SHOTS, { recursive: true });
  while (Date.now() < deadline) {
    const s = await samplePage(page);
    samples.push(s);
    if (!shotSpeech && isSpeechTime(s.t) && s.hudText) {
      await page.screenshot({ path: path.join(SHOTS, `${name}-speech.png`) });
      shotSpeech = true;
    }
    if (!shotSilence && isSilenceTime(s.t) && s.hudText) {
      await page.screenshot({ path: path.join(SHOTS, `${name}-silence.png`) });
      shotSilence = true;
    }
    if (shotSpeech && shotSilence && samples.length > 60) break;
    await new Promise(r => setTimeout(r, 150));
  }
  await page.close();

  const near = (a, b) => Math.abs(a - b) < 0.01;
  const speechSamples = samples.filter(s => isSpeechTime(s.t) && !s.paused);
  const silenceSamples = samples.filter(s => isSilenceTime(s.t) && !s.paused);
  const checks = {
    'アダプタ登録ログ': consoleLogs.some(l => l.includes('adapter registered')),
    'cue取得ログ': consoleLogs.some(l => /cues|subtitle/i.test(l)),
    'HUD表示': samples.some(s => s.hudText),
    [`音声区間で ${expect.ss}x`]: speechSamples.some(s => near(s.rate, expect.ss)),
    [`無音区間で ${expect.ns}x`]: silenceSamples.some(s => near(s.rate, expect.ns)),
    '中央オーバーレイに字幕表示': samples.some(s => s.overlayText && s.overlayText.includes('音声区間その1')),
    'HUDに音声バッジ': samples.some(s => s.hudText && s.hudText.includes('音声')),
    'JSエラーなし': !consoleLogs.some(l => /uncaught|TypeError|ReferenceError/i.test(l)),
    ...(extraChecks ? extraChecks(consoleLogs, samples) : {})
  };
  return { name, checks, samples: samples.length, speechSamples: speechSamples.length, silenceSamples: silenceSamples.length, consoleLogs };
}

(async () => {
  if (!fs.existsSync(DIST)) { console.error('dist-dev がありません。先に build-dev-ext.js を実行'); process.exit(1); }
  const server = await startServer();
  const userDataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cg-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: HEADLESS,
    viewport: { width: 1280, height: 720 },
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  const results = [];
  // シナリオ1: デフォルト設定 (ss=1.5 / ns=4.0, texttrack戦略)
  results.push(await runScenario(context, 'default', '/player.html', '', { ss: 1.5, ns: 4.0 }));
  // シナリオ2: URLパラメータ設定共有 (?ss=2.0&ns=8.0)
  results.push(await runScenario(context, 'url-override', '/player.html', '?ss=2.0&ns=8.0', { ss: 2.0, ns: 8.0 }));
  // シナリオ3: セグメント化WebVTT (Disney+方式): XHR捕捉→マージ→cue基準表示
  results.push(await runScenario(context, 'segmented-vtt', '/seg/player.html', '', { ss: 1.5, ns: 4.0 },
    (logs) => ({
      'セグメントマージ×2 (逐次到着)': logs.filter(l => l.includes('subtitle segment merged')).length >= 2,
      'interceptor捕捉 (page world)': logs.some(l => l.includes('interceptor loaded'))
    })));

  await context.close();
  server.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });

  let failed = 0;
  for (const r of results) {
    console.log(`\n=== シナリオ: ${r.name} (samples=${r.samples}, speech=${r.speechSamples}, silence=${r.silenceSamples}) ===`);
    for (const [label, ok] of Object.entries(r.checks)) {
      console.log(`  ${ok ? '✅' : '❌'} ${label}`);
      if (!ok) failed++;
    }
    if (Object.values(r.checks).some(v => !v)) {
      console.log('  --- console (最後の30行) ---');
      for (const l of r.consoleLogs.slice(-30)) console.log('   ', l);
    }
  }
  console.log(`\n${failed === 0 ? '🎉 ALL PASS' : `💥 ${failed} 件失敗`} / スクリーンショット: e2e/shots/`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
