const { chromium } = require(process.env.HOME + '/Desktop/claude_work/cinemagazer-chrome/e2e/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const REPO = process.env.HOME + '/Desktop/claude_work/cinemagazer-chrome';
const SCRATCH = __dirname;

const DEFAULTS = {
  enabled: true, speechRate: 1.5, silentRate: 4.0, silentMinGap: 0.4, subtitleOffset: 0.0,
  overlayEnabled: true, showHud: true,
  enableNetflix: true, enableHulu: true, enableDisneyplus: true, enablePrime: true
};

(async () => {
  const browser = await chromium.launch({ channel: 'chromium' });
  for (const loc of ['ja', 'en']) {
    const raw = JSON.parse(fs.readFileSync(path.join(REPO, '_locales', loc, 'messages.json'), 'utf8'));
    const MSG = {}; for (const k of Object.keys(raw)) MSG[k] = raw[k].message;
    const ctx = await browser.newContext({ viewport: { width: 360, height: 700 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(({ MSG, DEFAULTS, loc }) => {
      window.chrome = {
        i18n: { getMessage: (k) => MSG[k] || '', getUILanguage: () => loc },
        storage: { sync: { get: async () => DEFAULTS, set: async () => {}, onChanged: { addListener() {} } } },
        runtime: { sendMessage: async () => {}, onMessage: { addListener() {} } },
        tabs: { query: async () => [] }
      };
    }, { MSG, DEFAULTS, loc });
    const page = await ctx.newPage();
    await page.goto('file://' + path.join(REPO, 'popup', 'popup.html'));
    await page.waitForTimeout(400);
    const body = await page.$('body');
    const out = path.join(SCRATCH, 'popup-' + loc + '.png');
    await body.screenshot({ path: out });
    console.log('wrote', out);
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
