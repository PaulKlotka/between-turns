import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Exercise the actual built readers across the four independent game apps.
for (const game of ['rpg-bingo', 'push-your-luck', 'roll-race', 'horse-race']) {
  test(`${game} renders arbitrary effects safely and still reads legacy rewards`, async ({ page }) => {
    const effect = 'Reroll once.\nKeep the new result; <b>house rule</b>.';
    let custom = true;
    const base = {
      playerId: 'p', phase: 'playing', last: null, memberCount: 2, connectedCount: 2, canUndo: false,
      reviewUntil: null, winnerIds: [], winnerId: null, challenge: 'Roll 11–15', revision: 1,
      mode: 'multiplayer', target: 100, rollCount: 0, rollLimit: null, canBank: false, canRoll: true,
      canUndoRoll: false, canUndoBank: false, pattern: 'single-line', marks: [], rolls: 0,
      pending: null, winners: [], card: Array.from({ length: 25 }, (_, i) => i === 12 ? null : i % 20 + 1),
      players: [{ id: 'p', playerId: 'p', name: 'Player', numbers: [1, 2, 3, 4], hits: 0, banked: 0, atRisk: 0, skipNext: false, toxicNumbers: [1] }],
    };
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'between-turns-paul.web.app') return route.fulfill({ contentType: 'text/html', body: `
        <style>body{margin:0}iframe{width:100%;height:100vh;border:0}</style>
        <iframe src="https://game.example/embed?btVersion=1&btNonce=test-nonce&btParentOrigin=https%3A%2F%2Fbetween-turns-paul.web.app"></iframe>
        <script>addEventListener('message', e => { if(e.origin === 'https://game.example' && e.data.type === 'ready') e.source.postMessage({channel:'between-turns',version:1,type:'connect',nonce:'test-nonce',grant:'grant',expiresAt:Date.now()+60000}, e.origin); });</script>
      ` });
      if (url.pathname.toLowerCase().endsWith('/embeddedapi')) {
        const input = route.request().postDataJSON();
        return route.fulfill({ json: { result: input.action === 'begin' ? { credential: 'A'.repeat(43) } : {
          ...base, serverNow: Date.now(), offer: { id: 'offer', reward: { id: 'reward', name: 'Second Chance', ...(custom ? { effect } : { qualifyingRoll: 'Reflex save' }) } },
        } } });
      }
      if (url.hostname !== 'game.example') return route.abort();
      const file = path.join('C:/GitHub', game, 'dist', url.pathname.startsWith('/assets/') ? url.pathname.slice(1) : 'index.html');
      return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', body: readFileSync(file) });
    });
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto('https://between-turns-paul.web.app');
    const frame = page.frameLocator('iframe'), benefit = frame.locator(game === 'rpg-bingo' ? '#embed-benefit' : '#benefit');
    await expect(benefit).toHaveText(effect);
    await expect(benefit.locator('b')).toHaveCount(0);
    custom = false;
    await expect(benefit).toHaveText('+1 to one Reflex save.');
    expect(errors).toEqual([]);
  });
}
