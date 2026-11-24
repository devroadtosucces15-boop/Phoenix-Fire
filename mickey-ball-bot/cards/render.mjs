// HTML → PNG with headless Chrome (playwright-core). In GitHub Actions Chrome is preinstalled at /usr/bin/google-chrome.
import { chromium } from 'playwright-core';

const EXE = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => { try { return !!process.getBuiltinModule('fs').existsSync(p); } catch { return false; } });

export async function openRenderer() {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 100 }, deviceScaleFactor: 1 });
  return {
    async png(html, { transparent = false, clip } = {}) {
      const page = await ctx.newPage();
      try {
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))));
        await page.waitForTimeout(60);
        return await page.screenshot({ type: 'png', omitBackground: transparent, fullPage: true, ...(clip ? { clip } : {}) });
      } finally { await page.close(); }
    },
    close: () => browser.close(),
  };
}
