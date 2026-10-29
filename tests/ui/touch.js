const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 860 }, hasTouch: true, isMobile: false });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + __dirname + '/harness.html#narrow'); await pg.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(pg); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await pg.reload(); await pg.waitForTimeout(400);
  const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const s = await pg.locator('ha-ladder-panel [data-id="e1"] .hit').boundingBox();
  const d = await pg.locator('ha-ladder-panel [data-id="f2"] .hit').boundingBox();
  const sx = s.x + s.width / 2, sy = s.y + s.height / 2, tx = d.x + d.width + 2, ty = d.y + 50;
  await t('touchStart', sx, sy); await pg.waitForTimeout(400);
  for (let i = 1; i <= 10; i++) { await t('touchMove', sx + (tx - sx) * i / 10, sy + (ty - sy) * i / 10); await pg.waitForTimeout(20); }
  await pg.screenshot({ path: '/tmp/claude-0/touch.png' }); console.log('target', tx, ty, await pg.evaluate(() => { const d = document.getElementById('p')._drag; return d ? JSON.stringify({a: d.active, t: !!d.target, moved: d.moved}) : 'no drag'; }));
  await t('touchEnd'); await pg.waitForTimeout(150);
  console.log(await pg.evaluate(() => { const r = document.getElementById('p').programs[0].rungs; const f = (n) => n.t === 'el' ? n.type : n.t === 'series' ? n.items.map(f).join(' ') : '(' + n.branches.map(f).join('|') + ')'; return r.map(x => f(x.logic)).join('\n'); }));
   console.log('errors', errs); await b.close();
})();
