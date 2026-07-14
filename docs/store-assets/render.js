const { chromium } = require(process.env.HOME + '/Desktop/claude_work/cinemagazer-chrome/e2e/node_modules/playwright');
const path = require('path');
const SCRATCH = __dirname;
const OUT = process.env.HOME + '/Desktop/claude_work';
(async () => {
  const browser = await chromium.launch({ channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const name of ['shot1', 'shot2', 'shot3']) {
    await page.goto('file://' + path.join(SCRATCH, name + '.html'));
    await page.waitForTimeout(400);
    const out = path.join(OUT, 'cinemagazer-store-' + name + '.png');
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1280, height: 800 } });
    console.log('wrote', out);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
