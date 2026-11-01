import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('standalone Rewards sends players to Between Turns without starting its own login', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', r => requests.push(r.url()));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Open Between Turns' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create session|Join session/ })).toHaveCount(0);
  expect(requests.some(url => url.includes('identitytoolkit'))).toBe(false);
});

test('embedded inventory, owner use and undo, history privacy, reconnect, and narrow layouts', async ({ page }) => {
  // Serve the synthetic parent here so this test can run alongside the real hub.
  // Chromium classifies routed documents as public; permit this test origin to
  // load its loopback iframe without changing application security settings.
  await page.context().grantPermissions(['local-network-access'], { origin: 'http://127.0.0.1:5180' });
  await page.route('http://127.0.0.1:5180/test', route => route.fulfill({ contentType: 'text/html', body: readFileSync(new URL('./hub.html', import.meta.url), 'utf8') }));
  let consumedAt: number | null = null;
  let revoked = false;
  const requests: Record<string, unknown>[] = [];
  const reward = { id: 'test', name: 'A little luck', qualifyingRoll: 'Acrobatics check' };
  const view = () => ({ serverNow: Date.now(), inventory: [
    { id: 'first', playerId: 'alpha', playerName: 'Alpha', gameId: 'rpg-bingo', offerId: 'o', reward, awardedAt: Date.now(), consumedAt },
    { id: 'second', playerId: 'alpha', playerName: 'Alpha', gameId: 'rpg-bingo', offerId: 'p', reward, awardedAt: Date.now(), consumedAt: null },
  ], history: [{ id: 'first', playerName: 'Alpha', reward, gameId: 'rpg-bingo', awardedAt: Date.now() }, { id: 'other', playerName: 'Beta', reward, gameId: 'rpg-bingo', awardedAt: Date.now() }] });
  await page.route('http://127.0.0.1:5173/embeddedApi', async route => {
    const input = route.request().postDataJSON(); requests.push(input);
    if (revoked) { await route.fulfill({status:403,json:{error:{code:'permission-denied',message:'You are no longer in this session.'}}}); return; }
    if (input.action === 'begin') { await route.fulfill({json:{result:{credential:'x'.repeat(43)}}}); return; }
    if (input.action === 'consume') consumedAt = input.consumed ? Date.now() : null;
    await route.fulfill({json:{result:view()}});
  });
  await page.goto('http://127.0.0.1:5180/test');
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: 'My Rewards', exact: true })).toBeVisible();
  const use = frame.getByRole('button', { name: 'Use reward', exact: true });
  await expect(use).toHaveCount(2);
  await use.first().click();
  await expect(frame.getByRole('button', { name: /Undo use/ })).toBeVisible();
  await expect(use).toBeDisabled();
  await frame.getByRole('button', { name: /Undo use/ }).click();
  await expect(use.first()).toBeEnabled();
  await page.getByRole('button', {name:'History',exact:true}).click();
  await expect(frame.getByRole('heading', {name:'Session History',exact:true})).toBeVisible();
  await expect(frame.getByText('Beta', {exact:true})).toBeVisible();
  await expect(frame.getByText(/Available|Consumed|Used/, {exact:true})).toHaveCount(0);
  await expect(frame.getByRole('button', {name:'Use reward',exact:true})).toHaveCount(0);
  for (const width of [1440,390,320]) {
    await page.setViewportSize({width,height:900});
    const noOverflow = await page.frames()[1].evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(noOverflow).toBe(true);
  }
  await page.getByRole('button', {name:'Mine',exact:true}).click();
  revoked = true;
  await expect(frame.getByText('You are no longer in this session.')).toBeVisible();
  await expect(frame.getByRole('button', {name:'Use reward',exact:true})).toHaveCount(0);
  expect(requests.filter(r=>r.action==='consume')).toHaveLength(2);
  expect(requests.every(r=>!('sessionId' in r)&&!('playerId' in r))).toBe(true);
});
