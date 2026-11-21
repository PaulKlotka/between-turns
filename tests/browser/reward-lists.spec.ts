import { test, expect } from '@playwright/test';
import type { SessionView } from '../../shared/types';

for (const signedIn of [false, true]) {
  test(`Reward Lists navigation works for ${signedIn ? 'accounts outside sessions' : 'guests inside sessions'}`, async ({ page }) => {
    const rewardsApp = { id: 'rpg-rewards', embedUrl: 'https://rewards.example/embed' };
    const now = Date.now();
    const view: SessionView | null = signedIn ? null : {
      playerId: 'guest', expired: false, serverNow: now, games: [], rewardsApp,
      session: { id: 'session', code: 'ABCDEF123456789', createdAt: now, activityAt: now, expiresAt: now + 86400000,
        phase: 'lobby', members: [{ id: 'guest', name: 'Guest', connected: true }], run: null, ballot: null, history: [], revision: 1 },
    };
    await page.route('**/src/client.ts*', route => route.fulfill({ contentType: 'text/javascript', body: `
      export const local = true;
      export async function initialize() {}
      export async function identity() { return ${JSON.stringify({ signedIn, playerId: signedIn ? 'account' : 'guest', displayName: 'Author', rewardsApp })}; }
      export async function command(value) { return ['connect','accountConnect'].includes(value.action) ? {token:'test',expiresAt:Date.now()+60000} : ${JSON.stringify(view)}; }
    ` }));
    await page.route('https://rewards.example/embed?*', route => route.fulfill({ contentType: 'text/html', body: `
      <h1>Connected reward lists</h1><p id="mode"></p><script>
      const params = new URLSearchParams(location.search), nonce = params.get('btNonce');
      document.querySelector('#mode').textContent = params.get('view');
      addEventListener('message', e => { if(e.source === parent && e.data.type === 'connect') parent.postMessage({channel:'between-turns',version:1,type:'connected',nonce}, 'http://127.0.0.1:5180'); });
      parent.postMessage({channel:'between-turns',version:1,type:'ready',nonce}, 'http://127.0.0.1:5180');
      </script>
    ` }));
    await page.setViewportSize({ width: 320, height: 844 }); await page.goto('/');
    await page.getByRole('button', { name: 'Reward Lists', exact: true }).click();
    const frame = page.frameLocator('iframe[title="Reward Lists"]');
    await expect(frame.locator('#mode')).toHaveText('lists');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const source = await page.locator('iframe[title="Reward Lists"]').getAttribute('src');
    await expect(async () => { expect(await page.locator('iframe[title="Reward Lists"]').getAttribute('src')).toBe(source); }).toPass();
    await page.getByRole('button', { name: 'My Rewards', exact: true }).click();
    await expect(page.frameLocator('iframe[title="My Rewards"]').locator('#mode')).toHaveText('inventory');
  });
}
