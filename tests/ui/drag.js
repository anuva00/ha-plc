const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + __dirname + '/harness.html');
  await pg.waitForTimeout(400);
  const box = async (sel) => await pg.locator('ha-ladder-panel ' + sel).first().boundingBox();
  const drag = async (from, to, shot) => {
    await pg.mouse.move(from.x, from.y); await pg.mouse.down();
    await pg.mouse.move(to.x, to.y, { steps: 12 });
    if (shot) await pg.screenshot({ path: shot });
    await pg.mouse.up(); await pg.waitForTimeout(120);
  };
  const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const struct = () => pg.evaluate(() => {
    const p = document.getElementById('p'); const pr = p.programs[0];
    const f = (n) => n.t === 'el' ? n.type + (n.tag ? ':' + n.tag : '') : n.t === 'series' ? n.items.map(f).join(' ') : '(' + n.branches.map(f).join(' | ') + ')';
    return pr.rungs.map((r, i) => `${i + 1}: ${f(r.logic)}  =>  ${r.outputs.map(f).join(', ')}`).join('\n');
  });
  console.log('BEFORE\n' + await struct());

  // 1. palette TON into gap between SUN(e3) and TOF(e4)
  let e3 = await box('[data-id="e3"] .hit');
  await drag(center(await box('.pitem[data-type="TON"]')), { x: e3.x + e3.width + 3, y: e3.y + 46 + 4 }, '/tmp/claude-0/drag1.png');
  // 2. move SET coil (o2) from rung 1 into rung 2 outputs (below NOTIFY)
  const o3 = await box('[data-id="o3"] .hit');
  await drag(center(await box('[data-id="o2"] .hit')), { x: o3.x + o3.width / 2, y: o3.y + o3.height + 2 });
  // 3. move g1 (NC #hall_used, rung 3) under SUN as OR branch
  e3 = await box('[data-id="e3"] .hit');
  await drag(center(await box('[data-id="g1"] .hit')), { x: e3.x + e3.width / 2, y: e3.y + 46 + 40 }, '/tmp/claude-0/drag3.png');
  // 4. rung 3 to the top
  const rh = await box('[data-rhandle]:nth-of-type(1)');
  const handles = pg.locator('ha-ladder-panel [data-rhandle]');
  const h3 = await handles.nth(2).boundingBox();
  const first = await pg.locator('ha-ladder-panel section.rung').first().boundingBox();
  await drag(center(h3), { x: first.x + 100, y: first.y + 10 }, '/tmp/claude-0/drag4.png');
  // 5. drag f1 onto palette -> delete
  await drag(center(await box('[data-id="f1"] .hit')), center(await box('.pitem[data-type="CMP"]')), '/tmp/claude-0/drag5.png');
  // 6. click (no drag) still selects; palette click still inserts
  await pg.locator('ha-ladder-panel .pitem[data-type="NO"]').click();
  console.log('AFTER\n' + await struct());
  await pg.screenshot({ path: '/tmp/claude-0/drag_final.png' });
  // touch long-press drag
  const ctx2 = await b.newContext({ viewport: { width: 420, height: 860 }, hasTouch: true, isMobile: true });
  const m = await ctx2.newPage(); m.on('pageerror', e => errs.push('mobile ' + e.message));
  await m.goto('file://' + __dirname + '/harness.html#narrow'); await m.waitForTimeout(400);
  console.log('errors', errs);
  await b.close();
})();
