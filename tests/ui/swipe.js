const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 600 }, hasTouch: true });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + __dirname + '/harness.html#narrow'); await pg.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(pg);
  const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const s = await pg.locator('ha-ladder-panel [data-id="f2"] .hit').boundingBox();
  const sx = s.x + 40, sy = s.y + 40;
  await t('touchStart', sx, sy);
  for (let i = 1; i <= 8; i++) { await t('touchMove', sx - 15 * i, sy - 20 * i); await pg.waitForTimeout(15); }
  await t('touchEnd'); await pg.waitForTimeout(100);
  const r = await pg.evaluate(() => { const p = document.getElementById('p'); const sr = p.shadowRoot; return { top: sr.getElementById('canvas').scrollTop, left: [...sr.querySelectorAll('.svgwrap')].map(w => w.scrollLeft).join(','), sel: JSON.stringify(p.sel) }; });
  console.log('after swipe', r);
  // tap selects
  const g = await pg.locator('ha-ladder-panel [data-id="g2"] .hit').boundingBox();
  await t('touchStart', g.x + 30, g.y + 40); await t('touchEnd'); await pg.waitForTimeout(100);
  console.log('after tap', await pg.evaluate(() => JSON.stringify(document.getElementById('p').sel)));
  console.log('errors', errs); await b.close();
})();
