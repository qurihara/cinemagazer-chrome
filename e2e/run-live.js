#!/usr/bin/env node
// CinemaGazer E2E: 実サービス ライブテスト
//
// Widevine入りの実Chrome(channel:'chrome')に dev拡張(dist-dev)をロードし、
// 永続プロファイル(ログイン保持)で実サービスの再生を検証する。
// DRMログインが必要なため完全自動ではない:
//   1. このスクリプトがChromeウィンドウを開く（対象サービスのトップへ）
//   2. ユーザーがログインし、字幕ONで任意の作品を再生する
//   3. スクリプトが再生を検知し、約90秒サンプリングして合否と診断を出力
//
// 使い方: node run-live.js disneyplus   (hulu / unext / prime / netflix も可)
// プロファイル: ~/Desktop/claude_work/cg-e2e-profile （ログインは次回以降保持）
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const SERVICES = {
  disneyplus: { url: 'https://www.disneyplus.com/ja-jp/home', enableKey: 'enableDisneyplus', adapter: 'disneyplus' },
  hulu:       { url: 'https://www.hulu.jp/',                  enableKey: 'enableHulu',       adapter: 'hulu' },
  unext:      { url: 'https://video.unext.jp/',               enableKey: 'enableUnext',      adapter: 'unext' },
  prime:      { url: 'https://www.amazon.co.jp/gp/video/storefront', enableKey: 'enablePrime', adapter: 'prime' },
  netflix:    { url: 'https://www.netflix.com/',              enableKey: 'enableNetflix',    adapter: 'netflix' }
};

const svcName = process.argv[2] || 'disneyplus';
const SVC = SERVICES[svcName];
if (!SVC) { console.error(`unknown service: ${svcName} (${Object.keys(SERVICES).join('/')})`); process.exit(1); }

const DIST = path.join(__dirname, 'dist-dev');
const SHOTS = path.join(__dirname, 'shots');
const PROFILE = path.join(os.homedir(), 'Desktop', 'claude_work', 'cg-e2e-profile');
const WAIT_PLAYBACK_MIN = Number(process.env.WAIT_MIN || 15); // 再生開始をこの分数まで待つ
const SAMPLE_SEC = Number(process.env.SAMPLE_SEC || 90);

function now() { return new Date().toISOString().slice(11, 19); }
function say(msg) { console.log(`[${now()}] ${msg}`); }

(async () => {
  if (!fs.existsSync(DIST)) { console.error('dist-dev がありません。先に node build-dev-ext.js'); process.exit(1); }
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(PROFILE, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',            // Widevine CDM入りの実Chrome
    headless: false,              // DRM+ログインのため headed
    viewport: null,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-crash-restore-bubble',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  // 拡張のservice worker経由で対象サービスの有効化フラグを立てる
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null);
  if (sw) {
    await sw.evaluate((key) => chrome.storage.sync.set({ [key]: true, enabled: true }), SVC.enableKey);
    say(`拡張設定: ${SVC.enableKey}=true をセット (service worker経由)`);
  } else {
    // フォールバック: popupページを直接開いて storage をセット。
    // unpacked拡張のIDは絶対パスのSHA-256から決定的に導出できる (a-p文字)。
    const crypto = require('crypto');
    const extId = [...crypto.createHash('sha256').update(DIST).digest('hex').slice(0, 32)]
      .map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
    try {
      const tmp = await context.newPage();
      await tmp.goto(`chrome-extension://${extId}/popup/popup.html`, { timeout: 8000 });
      await tmp.evaluate((key) => new Promise(res =>
        chrome.storage.sync.set({ [key]: true, enabled: true }, res)), SVC.enableKey);
      await tmp.close();
      say(`拡張設定: ${SVC.enableKey}=true をセット (popupページ経由 / ${extId})`);
    } catch (e) {
      say(`⚠️ 設定の自動注入に失敗。拡張アイコン→popupから手動で ${svcName} をONにしてください (${e.message})`);
    }
  }

  const page = context.pages()[0] || await context.newPage();
  const cgLogs = [];
  const errLogs = [];
  page.on('console', m => {
    const t = m.text();
    if (t.includes('[CinemaGazer]')) cgLogs.push(`[${now()}] ${t}`);
    if (m.type() === 'error' && !/net::|favicon|CSP|Content Security/i.test(t)) errLogs.push(t);
  });
  await page.goto(SVC.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => say(`goto: ${e.message}`));

  say(`✋ ブラウザを開きました。${svcName} にログインし、【字幕をONにして】任意の作品を再生してください。`);
  say(`   再生開始を最長${WAIT_PLAYBACK_MIN}分待ちます…`);

  // 再生開始待ち: 大きく可視なvideoが再生中になるまでポーリング
  const probe = () => page.evaluate(() => {
    const vids = Array.from(document.querySelectorAll('video'));
    const vp = (innerWidth || 1) * (innerHeight || 1);
    const v = vids
      .filter(x => x.offsetWidth * x.offsetHeight > vp * 0.15)
      .sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)[0];
    if (!v) return null;
    return { t: v.currentTime, rate: v.playbackRate, paused: v.paused, ready: v.readyState, w: v.offsetWidth, h: v.offsetHeight, url: location.href.slice(0, 120) };
  }).catch(() => null);

  const deadline = Date.now() + WAIT_PLAYBACK_MIN * 60000;
  let started = null;
  while (Date.now() < deadline) {
    const s = await probe();
    if (s && !s.paused && s.ready >= 2 && s.t > 1) { started = s; break; }
    await new Promise(r => setTimeout(r, 1500));
  }
  if (!started) {
    say(`💥 ${WAIT_PLAYBACK_MIN}分以内に再生を検知できませんでした。終了します（ログイン状態はプロファイルに保存済み）`);
    await context.close(); process.exit(1);
  }
  say(`▶ 再生検知: ${started.w}x${started.h} @ ${started.url}`);
  say(`   ${SAMPLE_SEC}秒間サンプリングします…`);

  // サンプリング
  const samples = [];
  const sample = () => page.evaluate(() => {
    const vids = Array.from(document.querySelectorAll('video'));
    const vp = (innerWidth || 1) * (innerHeight || 1);
    const v = vids.filter(x => x.offsetWidth * x.offsetHeight > vp * 0.15)
      .sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)[0];
    const vis = el => { if (!el) return null; const cs = getComputedStyle(el); return (cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0) ? el.textContent.trim() : null; };
    return {
      t: v ? v.currentTime : -1,
      rate: v ? v.playbackRate : -1,
      paused: v ? v.paused : true,
      hud: vis(document.getElementById('cg-hud')),
      overlay: vis(document.getElementById('cg-overlay')),
      // ネイティブ字幕の生存確認（隠していてもtextContentは読める）
      nativeSub: (() => {
        for (const sel of ['.dss-subtitle-renderer-cue-window', '.dss-subtitle-renderer-cue', '.dss-hls-subtitle-overlay', '[class*="subtitle"]', '[class*="caption"]']) {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim()) return { sel, text: el.textContent.trim().slice(0, 60) };
        }
        return null;
      })()
    };
  }).catch(() => null);

  const tEnd = Date.now() + SAMPLE_SEC * 1000;
  let shotN = 0;
  let nextShot = Date.now();
  while (Date.now() < tEnd) {
    const s = await sample();
    if (s) samples.push(s);
    if (Date.now() >= nextShot) {
      await page.screenshot({ path: path.join(SHOTS, `live-${svcName}-${shotN++}.png`) }).catch(() => {});
      nextShot = Date.now() + 20000;
    }
    await new Promise(r => setTimeout(r, 250));
  }

  // 診断: 字幕/キャプションらしき要素のクラス一覧（セレクタ調整用）
  const domDiag = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[class*="subtitle" i], [class*="caption" i], [class*="dss-" i], [class*="timedtext" i]')) {
      const cls = String(el.className).slice(0, 120);
      const txt = (el.textContent || '').trim().slice(0, 40);
      const r = el.getBoundingClientRect();
      out.push({ cls, txt, w: Math.round(r.width), h: Math.round(r.height) });
      if (out.length >= 25) break;
    }
    return out;
  }).catch(() => []);

  await context.close();

  // 判定
  const near = (a, b) => Math.abs(a - b) < 0.01;
  const playing = samples.filter(s => s && !s.paused);
  const ssSeen = new Set(playing.map(s => s.rate.toFixed(2)));
  const checks = {
    'アダプタ登録ログ': cgLogs.some(l => l.includes(`adapter registered: ${SVC.adapter}`)),
    'DOM字幕監視の起動': cgLogs.some(l => l.includes('DOM subtitle observer attached')),
    'HUD表示': playing.some(s => s.hud),
    '速度1.5x(音声)を観測': playing.some(s => near(s.rate, 1.5)),
    '速度4.0x(無音)を観測': playing.some(s => near(s.rate, 4.0)),
    '中央オーバーレイに字幕': playing.some(s => s.overlay),
    'ネイティブ字幕DOMを検出': playing.some(s => s.nativeSub),
    'ページJSエラーなし(CG関連)': !errLogs.some(l => l.includes('cg-') || l.includes('CinemaGazer'))
  };

  console.log(`\n=== ライブテスト結果: ${svcName} (samples=${samples.length}, playing=${playing.length}) ===`);
  let failed = 0;
  for (const [k, ok] of Object.entries(checks)) { console.log(`  ${ok ? '✅' : '❌'} ${k}`); if (!ok) failed++; }
  console.log(`  観測した再生速度: ${[...ssSeen].join(', ')}`);
  console.log('\n--- CinemaGazerログ (最後の25行) ---');
  for (const l of cgLogs.slice(-25)) console.log(' ', l);
  if (errLogs.length) { console.log('\n--- ページエラー ---'); for (const l of errLogs.slice(-10)) console.log(' ', l); }
  console.log('\n--- 字幕系DOM診断 (セレクタ調整用) ---');
  for (const d of domDiag) console.log(`  [${d.w}x${d.h}] .${d.cls} :: "${d.txt}"`);
  const nat = playing.map(s => s.nativeSub).filter(Boolean);
  if (nat.length) console.log(`\n  ネイティブ字幕ヒットセレクタ: ${[...new Set(nat.map(n => n.sel))].join(', ')}`);

  fs.writeFileSync(path.join(SHOTS, `live-${svcName}-report.json`),
    JSON.stringify({ svcName, checks, samplesCount: samples.length, cgLogs, errLogs, domDiag, samples: samples.slice(-120) }, null, 2));
  console.log(`\n${failed === 0 ? '🎉 ALL PASS' : `💥 ${failed} 件失敗`} / 詳細: e2e/shots/live-${svcName}-report.json`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
