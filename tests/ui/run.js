const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, vp, hash] of [["desktop", {width: 1500, height: 900}, ""], ["mobile", {width: 400, height: 820}, "#narrow"]]) {
    const pg = await b.newPage({ viewport: vp, colorScheme: name === "mobile" ? "dark" : "light" });
    pg.on('pageerror', e => errs.push(name + ': ' + e.message));
    pg.on('console', m => m.type() === 'error' && errs.push(name + ' console: ' + m.text()));
    await pg.goto('file://' + __dirname + '/harness.html' + hash);
    await pg.waitForTimeout(400);
    if (name === "desktop") { await pg.locator('ha-ladder-panel #theme').click(); await pg.waitForTimeout(250); await pg.screenshot({ path: '/tmp/claude-0/ui_dark.png' }); await pg.locator('ha-ladder-panel #theme').click(); await pg.locator('ha-ladder-panel #theme').click(); }
    await pg.screenshot({ path: `/tmp/claude-0/ui_${name}_1.png` });
    const root = pg.locator('ha-ladder-panel');
    // select e3 (SUN) then insert a TON after it, then OR-branch it
    await pg.locator('ha-ladder-panel [data-id="e3"] .hit').dispatchEvent('pointerdown');
    await pg.waitForTimeout(100);
    await pg.locator('ha-ladder-panel .pitem[data-type="TON"]').click();
    await pg.waitForTimeout(100);
    await pg.locator('ha-ladder-panel [data-pact="or"]').click();
    await pg.waitForTimeout(100);
    await pg.locator('ha-ladder-panel #props [data-field="tag"]').fill('binary_sensor.front_door');
    // add rung + coil via palette
    await pg.locator('ha-ladder-panel .pitem[data-type="NECOIL"]').click();
    await pg.waitForTimeout(150);
    await pg.screenshot({ path: `/tmp/claude-0/ui_${name}_2.png` });
    if (name === "desktop") {
      await pg.keyboard.press('Escape');
      await pg.locator('ha-ladder-panel #save').click();
      await pg.waitForTimeout(150);
      const saved = await pg.evaluate(() => window.saved);
      console.log('saved rungs', saved && saved[0].rungs.length, JSON.stringify(saved[0].rungs[0].logic).length);
      console.log(JSON.stringify(saved[0].rungs[0].logic.items.map(i => i.type || i.t)));
      // undo works
      await pg.keyboard.press('Control+z');
      await pg.waitForTimeout(100);
      await pg.screenshot({ path: `/tmp/claude-0/ui_${name}_3.png` });
    }
  }
  console.log('errors:', errs);
  await b.close();
})();
