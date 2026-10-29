const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [vp, hash, wrap] of [[{ width: 1440, height: 900 }, "", false], [{ width: 400, height: 800 }, "#narrow", false], [{ width: 1440, height: 900 }, "", true]]) {
    const pg = await b.newPage({ viewport: vp });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto('file://' + __dirname + '/harness.html' + hash);
    // HA-like host: panel inside an auto-height container (no definite height)
    if (wrap) await pg.evaluate(() => { const p = document.getElementById('p'); const d = document.createElement('div'); p.style.height = 'auto'; p.parentNode.insertBefore(d, p); d.appendChild(p); });
    await pg.waitForTimeout(300);
    await pg.locator('ha-ladder-panel #views [data-view="trace"]').click();
    const hs = [];
    for (let i = 0; i < 6; i++) { await pg.waitForTimeout(500); hs.push(await pg.evaluate(() => { const sr = document.getElementById('p').shadowRoot; return [sr.getElementById('chartbox').clientHeight, sr.getElementById('chart').clientHeight, document.documentElement.scrollHeight].join('/'); })); }
    console.log(hash || (wrap ? 'auto-host' : 'desktop'), hs.join('  '), errs);
  }
  await b.close();
})();
