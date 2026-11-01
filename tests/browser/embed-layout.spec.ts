import { test, expect } from '@playwright/test';
import type { SessionView } from '../../shared/types';

test('embedded game fits desktop viewports and survives navigation without clipping controls', async ({ page }) => {
  const now = Date.now();
  const view: SessionView = {
    playerId: 'alice', expired: false, serverNow: now, rewardsApp: null,
    games: [{ id: 'bingo', name: 'RPG Bingo', description: 'Bingo', ready: true, embedUrl: 'https://game.example/embed' }],
    session: { id: 'session', code: 'ABCDEF123456789', phase: 'playing', createdAt: now, activityAt: now,
      expiresAt: now + 86400000, members: [{ id: 'alice', name: 'Alice', connected: true }],
      ballot: null, run: { id: 'run', gameId: 'bingo', startedAt: now }, history: [], revision: 1 },
  };
  await page.route('**/src/client.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const local = true;
    export async function initialize() {}
    export async function command(value) { return value.action === 'connect' ? {token:'test',expiresAt:Date.now()+60000} : ${JSON.stringify(view)}; }
  ` }));
  await page.route('https://game.example/embed?*', route => route.fulfill({ contentType: 'text/html', body: `
    <!doctype html><style>*{box-sizing:border-box}body{margin:0;width:900px;height:1000px;display:flex;flex-direction:column}h1{margin:20px}#card{display:grid;grid-template-columns:repeat(5,1fr);flex:1;gap:8px;padding:20px}button{min-height:44px}</style>
    <h1>Bingo</h1><div id="card">${Array.from({ length: 25 }, (_, i) => `<button>${i + 1}</button>`).join('')}</div><button id="roll">Roll a d20</button><button id="undo">Undo my last roll</button>
    <script>
      const nonce = new URLSearchParams(location.search).get('btNonce');
      const send = type => parent.postMessage({channel:'between-turns',version:1,type,nonce,width:900,height:1000}, 'http://127.0.0.1:5180');
      addEventListener('message', event => { if(event.source === parent && event.data.type === 'connect') send('connected'); if(event.source === parent && event.data.type === 'viewport') send('size'); });
      send('ready');
    </script>
  ` }));
  await page.goto('/');
  const frame = page.locator('#game-embed iframe');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveCSS('width', '900px');
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await expect(async () => {
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const stage = await page.locator('#game-embed').boundingBox(); const bounds = await frame.boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      expect(bounds!.width).toBeLessThanOrEqual(stage!.width + 1);
      expect(bounds!.height).toBeLessThanOrEqual(stage!.height + 1);
      expect(await page.frameLocator('#game-embed iframe').locator('body').evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }).toPass();
  }
  await page.getByRole('button', { name: /^Session/ }).click();
  await expect(page.locator('body')).not.toHaveClass(/playing-game/);
  await page.getByRole('button', { name: 'Current Game', exact: true }).click();
  await expect(frame).toHaveCount(1);
  await expect(page.frameLocator('#game-embed iframe').locator('#undo')).toBeVisible();
});
