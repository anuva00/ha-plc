const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + __dirname + '/harness.html'); await pg.waitForTimeout(400);
  const P = (s) => pg.locator('ha-ladder-panel ' + s);
  const tag = () => pg.evaluate(() => { const p = document.getElementById('p'); const l = p._locate(p.sel.ids[0]); return JSON.stringify(l.node); });
  // 1. contact: open picker empty
  await P('[data-id="g1"] .hit').click({ force: true });
  await P('#props [data-field="tag"]').click();
  await pg.keyboard.press('Control+a'); await pg.keyboard.press('Backspace');
  await pg.waitForTimeout(100);
  await pg.screenshot({ path: '/tmp/claude-0/pick1.png', clip: { x: 1095, y: 50, width: 305, height: 600 } });
  // 2. search "kitch mot" -> enter
  await pg.keyboard.type('kitch mot'); await pg.waitForTimeout(100);
  await pg.screenshot({ path: '/tmp/claude-0/pick2.png', clip: { x: 1095, y: 50, width: 305, height: 500 } });
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
  await pg.screenshot({ path: '/tmp/claude-0/pick2b.png', clip: { x: 1095, y: 50, width: 305, height: 400 } });
  await pg.keyboard.press('Enter');
  console.log('contact ->', await tag());
  // 3. CMP a: pick climate then attribute
  await P('[data-id="e2b"] .hit').click({ force: true });
  await P('#props [data-field="a"]').click(); await pg.keyboard.press('Control+a'); await pg.keyboard.type('living ac');
  await pg.waitForTimeout(80); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
  await pg.screenshot({ path: '/tmp/claude-0/pick3.png', clip: { x: 1095, y: 50, width: 305, height: 420 } });
  await P('#props [data-pattr="climate.living[current_temperature]"]').click();
  console.log('cmp ->', await tag());
  // 4. b: number constant
  await P('#props [data-field="b"]').click(); await pg.keyboard.press('Control+a'); await pg.keyboard.type('24'); await pg.keyboard.press('Enter');
  console.log('cmp b ->', await tag());
  // 5. coil: suggested excludes sensors; chips
  await P('[data-id="o1"] .hit').click({ force: true });
  await P('#props [data-pickopen="tag"]').click(); await pg.waitForTimeout(100);
  await pg.screenshot({ path: '/tmp/claude-0/pick5.png', clip: { x: 1095, y: 50, width: 305, height: 600 } });
  const names = await pg.evaluate(() => document.getElementById('p')._pick.items.filter(i => i.eid).map(i => i.eid));
  console.log('coil suggestions include sensor?', names.some(n => n.startsWith('sensor.') || n.startsWith('binary_sensor.')), names.slice(0, 6));
  await pg.keyboard.press('Escape');
  // 6. notify service picker
  await P('[data-id="o3"] .hit').click({ force: true });
  await P('#props [data-field="service"]').click(); await pg.keyboard.press('Control+a'); await pg.keyboard.type('pers');
  await pg.waitForTimeout(80); await pg.keyboard.press('Enter');
  console.log('notify ->', await tag());
  // 7. marker
  await P('[data-id="g1"] .hit').click({ force: true });
  await P('#props [data-field="tag"]').click(); await pg.keyboard.press('Control+a'); await pg.keyboard.type('#away mode'); await pg.waitForTimeout(80);
  await pg.screenshot({ path: '/tmp/claude-0/pick7.png', clip: { x: 1095, y: 50, width: 305, height: 400 } });
  await pg.keyboard.press('Enter');
  console.log('marker ->', await tag());
  console.log('errors', errs); await b.close();
})();
