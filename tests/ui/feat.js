const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
  pg.on('dialog', d => d.accept());
  await pg.goto('file://' + __dirname + '/harness.html'); await pg.waitForTimeout(400);
  const P = (s) => pg.locator('ha-ladder-panel ' + s);
  console.log('checks badge:', await P('#checks').innerText(), 'hidden:', await P('#checks').isHidden());
  // create a double coil: drag a COIL into rung 2 outputs and point it at light.hallway
  await P('[data-id="o3"] .hit').click({ force: true });
  await P('.pitem[data-type="COIL"]').click();
  await P('#props [data-field="tag"]').fill('light.hallway');
  await P('#props [data-field="tag"]').press('Escape');
  // duplicate timer name
  await P('[data-id="f2"] .hit').click({ force: true });
  await P('#props [data-field="name"]').fill('T1');
  await pg.waitForTimeout(100);
  console.log('checks badge after:', await P('#checks').innerText());
  await P('#checks').click(); await pg.waitForTimeout(100);
  console.log((await P('#props').innerText()).split('\n').slice(0, 14).join(' | '));
  await pg.screenshot({ path: '/tmp/claude-0/checks.png' });
  // jump from a check
  await P('#props .prob .uchip').first().click(); await pg.waitForTimeout(150);
  console.log('selected after goto:', await pg.evaluate(() => JSON.stringify(document.getElementById('p').sel)));
  // xref on the coil
  await P('[data-id="o1"] .hit').click({ force: true }); await pg.waitForTimeout(100);
  console.log('xref:', (await P('#props .xref').first().innerText()).replace(/\n/g, ' | '));
  await pg.screenshot({ path: '/tmp/claude-0/xref.png' });
  // collapse rung 1 and all
  await P('[data-act="collapse"]').first().click(); await pg.waitForTimeout(80);
  console.log('collapsed summary:', await P('[data-rsum]').first().innerText());
  await P('[data-act="collapseall"]').click(); await pg.waitForTimeout(80);
  await pg.screenshot({ path: '/tmp/claude-0/collapsed.png' });
  console.log('collapsed count:', await P('section.rung.collapsed').count());
  await P('[data-act="expandall"]').click();
  // test mode
  await P('#testmode').click(); await pg.waitForTimeout(300);
  console.log('test banner:', await P('.banner.test').count(), 'btn:', await P('#testmode').getAttribute('class'));
  await P('#props [data-pact="close"]').click().catch(() => {});
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(1200);
  await pg.screenshot({ path: '/tmp/claude-0/testmode.png' });
  await P('#testmode').click(); await pg.waitForTimeout(300);
  console.log('after exit banner:', await P('.banner.test').count());
  console.log('errors', errs); await b.close();
})();
