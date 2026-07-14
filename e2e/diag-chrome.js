#!/usr/bin/env node
// 診断: 実Chromeが --load-extension で dist-dev をロードできるか確認
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, 'dist-dev');
const PROFILE = path.join(os.homedir(), 'Desktop', 'claude_work', 'cg-e2e-profile');

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--no-first-run', '--no-default-browser-check', '--hide-crash-restore-bubble'
    ]
  });
  const page = context.pages()[0] || await context.newPage();
  const ver = await page.evaluate(() => navigator.userAgent);
  console.log('UA:', ver);
  await page.goto('chrome://extensions-internals', { timeout: 10000 }).catch(e => console.log('goto err:', e.message));
  const text = await page.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => '(read failed)');
  console.log('=== chrome://extensions-internals (head) ===');
  console.log(text.includes('CinemaGazer') || text.includes('dist-dev') ? '>>> 拡張はロードされている' : '>>> 拡張が見つからない');
  console.log(text.slice(0, 1200));
  await context.close();
})().catch(e => { console.error(e); process.exit(1); });
