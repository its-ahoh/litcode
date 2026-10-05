/* global process, console, window, chrome, document, Response */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

(async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'litcode-permission-'));
  const extension = path.resolve('.output/chrome-mv3');
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      channel: process.env.CHROMIUM_PATH ? undefined : 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = worker.url().split('/')[2];
    console.log(`Chrome ${context.browser().version()}`);

    async function open({ queued = false, granted = false, baseUrl = 'https://review.example/v1' } = {}) {
      await worker.evaluate(async ({ queued, baseUrl }) => {
        await chrome.storage.local.clear();
        await chrome.storage.session.clear();
        await chrome.storage.local.set({ litcode: { settings: {
          ai: { provider: 'openai', apiKey: 'test-only', baseUrl, model: 'test-model' },
          theme: 'system', responseLanguage: 'auto', videoLanguage: 'all',
        } } });
        if (queued) await chrome.storage.session.set({ pendingAiAction: { action: 'hint', selection: '', ts: Date.now() } });
      }, { queued, baseUrl });
      const page = await context.newPage();
      await page.addInitScript(({ granted }) => {
        const state = window.testPermission = { granted, allow: false, requests: 0, bodies: [], inClick: false };
        // Enforce the relevant contract: request must happen synchronously inside a trusted click.
        document.addEventListener('click', event => {
          state.inClick = event.isTrusted;

        }, true);
        window.addEventListener('click', () => { state.inClick = false; });
        chrome.permissions.contains = async () => state.granted;
        chrome.permissions.request = async () => {
          state.requests++;
          if (!state.inClick) throw new Error('Missing synchronous user click');
          if (state.allow) state.granted = true;
          return state.allow;
        };
        window.fetch = async (_url, options) => {
          state.bodies.push(JSON.parse(options.body));
          return new Response(JSON.stringify({ choices: [{ message: { content: 'mock answer' } }] }));
        };
      }, { granted });
      await page.goto(`chrome-extension://${id}/sidepanel.html`);
      if (!queued) await page.getByRole('button', { name: 'AI Chat', exact: true }).click();
      return page;
    }
    const allow = page => page.getByRole('button', { name: 'Allow access and continue', exact: true });
    const cancel = page => page.getByRole('button', { name: 'Cancel request', exact: true });
    async function send(page, text = 'original question') {
      await page.locator('.chat-input input').fill(text);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
    }
    async function state(page) { return page.evaluate(() => window.testPermission); }
    async function grantedReply(page, count = 1) {
      await page.waitForFunction(count => window.testPermission.bodies.length === count, count);
      await page.locator('.bubble.assistant').last().waitFor();
    }

    for (const queued of [false, true]) {
      const page = await open({ queued });
      if (!queued) await send(page);
      await allow(page).waitFor();
      assert.equal((await state(page)).requests, 0);
      assert.equal((await state(page)).bodies.length, 0);
      // Denial must retain the operation and must not call the API.
      await allow(page).click();
      await page.getByText('Access was not granted. Try again or cancel this request.').waitFor();
      assert.equal((await state(page)).bodies.length, 0);
      await page.evaluate(() => { window.testPermission.allow = true; });
      await allow(page).click();
      await grantedReply(page);
      let snapshot = await state(page);
      assert.equal(snapshot.requests, 2);
      assert.match(snapshot.bodies[0].messages.at(-1).content, queued ? /HINT level 1\/4/ : /original question/);
      // A subsequent operation with the remembered grant must not prompt again.
      if (queued) await page.getByRole('button', { name: 'Hint 2/4', exact: true }).click();
      else await send(page, 'follow-up');
      await grantedReply(page, 2);
      snapshot = await state(page);
      assert.equal(snapshot.requests, 2);
      assert.match(snapshot.bodies[1].messages.at(-1).content, queued ? /HINT level 2\/4/ : /follow-up/);
      console.log(`PASS ${queued ? 'queued Hint' : 'direct Send'}: denial, retry, resume, repeated request`);
      await page.close();
    }

    for (const queued of [false, true]) {
      const page = await open({ queued });
      if (!queued) await send(page);
      await cancel(page).click();
      await page.getByText('Request canceled.', { exact: true }).waitFor();
      assert.equal((await state(page)).requests, 0);
      assert.equal((await state(page)).bodies.length, 0);
      if (queued) await page.getByRole('button', { name: 'Hint', exact: true }).click();
      else await send(page, 'retry after cancel');
      await allow(page).waitFor();
      await page.evaluate(() => { window.testPermission.allow = true; });
      await allow(page).click();
      await grantedReply(page);
      assert.match((await state(page)).bodies[0].messages.at(-1).content, queued ? /HINT level 1\/4/ : /retry after cancel/);
      console.log(`PASS ${queued ? 'queued Hint' : 'direct Send'}: cancel and start again`);
      await page.close();
    }

    for (const baseUrl of ['', 'https://review.example/v1']) {
      const page = await open({ granted: true, baseUrl });
      await send(page);
      await grantedReply(page);
      assert.equal((await state(page)).requests, 0);
      console.log(`PASS ${baseUrl ? 'previously granted' : 'default'} endpoint`);
      await page.close();
    }

    const page = await open({ queued: true });
    await allow(page).waitFor();
    await page.getByRole('button', { name: 'My Codes', exact: true }).click();
    await page.getByRole('button', { name: 'AI Chat', exact: true }).click();
    await send(page, 'after leaving the pending action');
    await allow(page).waitFor();
    await page.evaluate(() => { window.testPermission.allow = true; });
    await allow(page).click();
    await grantedReply(page);
    assert.match((await state(page)).bodies[0].messages.at(-1).content, /after leaving/);
    console.log('PASS leaving panel cancels pending action without later replay');
  } finally {
    if (context) await context.close();
    await rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
