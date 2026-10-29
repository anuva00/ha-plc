const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [w, h, hash] of [[1440, 900, ""], [400, 860, "#narrow"]]) {
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
    pg.on('dialog', d => d.accept());
    await pg.goto('file://' + __dirname + '/harness.html' + hash); await pg.waitForTimeout(400);
    const P = (s) => pg.locator('ha-ladder-panel ' + s);
    await P('#views [data-view="history"]').click(); await pg.waitForTimeout(400);
    await pg.screenshot({ path: `/tmp/claude-0/hist_${w}.png`, fullPage: false });
    if (w === 400) continue;
    console.log('diff text:', (await P('#hdetail').innerText()).replace(/\n+/g, ' | ').slice(0, 700));
    // note edit
    await P('#hnote').fill('known good before CMP'); await P('#hnote').press('Enter'); await P('#hnote').blur(); await pg.waitForTimeout(150);
    // backup now + preview file
    await P('[data-hact="backupnow"]').click(); await pg.waitForTimeout(200);
    await P('[data-bact="brestore"]').last().click(); await pg.waitForTimeout(200);
    console.log('file preview head:', (await P('#hdetail h3').innerText()));
    // restore the old version
    await P('[data-hv="vold"]').click(); await pg.waitForTimeout(200);
    await P('[data-hact="restore"]').click(); await pg.waitForTimeout(300);
    const st = await pg.evaluate(() => { const p = document.getElementById('p'); return { saved: window.saved && window.saved[0].rungs.map(r => r.id), editor: p.programs[0].rungs.map(r => r.id), dirty: p.dirty }; });
    console.log('after restore:', JSON.stringify(st));
    console.log('list:', (await P('#hlist').innerText()).replace(/\n+/g, ' | ').slice(0, 300));
    // open in editor
    await P('[data-hv="vinit"]').click(); await pg.waitForTimeout(150);
    await P('[data-hact="load"]').click(); await pg.waitForTimeout(200);
    console.log('view after open:', await pg.evaluate(() => document.getElementById('p').view), 'dirty', await pg.evaluate(() => document.getElementById('p').dirty));
    await pg.keyboard.press('Control+z'); await pg.waitForTimeout(100);
    console.log('undo restores rungs:', await pg.evaluate(() => document.getElementById('p').programs[0].rungs.length));
  }
  console.log('errors', errs); await b.close();
})();
