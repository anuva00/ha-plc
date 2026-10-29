const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, vp, scheme] of [["d", { width: 1440, height: 900 }, "light"], ["dark", { width: 1440, height: 900 }, "dark"]]) {
  const pg = await b.newPage({ viewport: vp, colorScheme: scheme });
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await pg.goto('file://' + __dirname + '/harness.html'); await pg.waitForTimeout(400);
  const P = (s) => pg.locator('ha-ladder-panel ' + s);
  if (scheme === "dark") { await P('#theme').click(); }
  await P('#views [data-view="tags"]').click(); await pg.waitForTimeout(150);
  // force a bool input and a marker number
  await P('tr[data-row="binary_sensor.front_door"] [data-tact="f1"]').click();
  await P('tr[data-row="#setpoint"] [data-fval]').fill('25');
  await P('tr[data-row="#setpoint"] [data-tact="force"]').click();
  await P('tr[data-row="#hall_used"] [data-tact="toggle"]').click();
  await pg.waitForTimeout(250);
  await pg.screenshot({ path: `/tmp/claude-0/tags_${name}.png` });
  // ladder shows F badge
  await P('#views [data-view="ladder"]').click(); await pg.waitForTimeout(200);
  await pg.screenshot({ path: `/tmp/claude-0/ladderF_${name}.png`, clip: { x: 160, y: 0, width: 1050, height: 420 } });
  // trace
  await P('#views [data-view="trace"]').click(); await pg.waitForTimeout(400);
  await pg.screenshot({ path: `/tmp/claude-0/trace_${name}.png` });
  const cb = await P('#chart').boundingBox();
  await pg.mouse.move(cb.x + cb.width * 0.6, cb.y + 100);
  for (let i = 0; i < 3; i++) { await pg.mouse.wheel(0, -200); await pg.waitForTimeout(60); }
  await pg.mouse.move(cb.x + cb.width * 0.5, cb.y + 150);
  await pg.waitForTimeout(150);
  await pg.screenshot({ path: `/tmp/claude-0/trace_zoom_${name}.png` });
  // pan
  await pg.mouse.down(); await pg.mouse.move(cb.x + cb.width * 0.3, cb.y + 150, { steps: 6 }); await pg.mouse.up();
  console.log(name, 'tview', await pg.evaluate(() => JSON.stringify(document.getElementById('p').tview)));
  // preset 24h shows history
  await P('[data-span="86400"]').click(); await P('[data-live]').click(); await pg.waitForTimeout(150);
  await pg.screenshot({ path: `/tmp/claude-0/trace_24h_${name}.png` });
  // add signal through picker
  await P('.addwatch input').click(); await pg.keyboard.type('living ac'); await pg.waitForTimeout(80); await pg.keyboard.press('ArrowDown'); 
  await P('.addwatch input').fill(''); await pg.keyboard.type('#setp'); await pg.waitForTimeout(80); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
  console.log(name, 'signals', await pg.evaluate(() => JSON.stringify(document.getElementById('p').trace.signals)));
  }
  // mobile
  const m = await b.newPage({ viewport: { width: 400, height: 860 } });
  m.on('pageerror', e => errs.push('m ' + e.message));
  await m.goto('file://' + __dirname + '/harness.html#narrow'); await m.waitForTimeout(400);
  await m.locator('ha-ladder-panel #views [data-view="trace"]').click(); await m.waitForTimeout(400);
  await m.screenshot({ path: '/tmp/claude-0/trace_mobile.png' });
  await m.locator('ha-ladder-panel #views [data-view="tags"]').click(); await m.waitForTimeout(200);
  await m.screenshot({ path: '/tmp/claude-0/tags_mobile.png' });
  console.log('errors', errs); await b.close();
})();
