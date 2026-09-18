import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const [app, base] = process.argv.slice(2);
assert(['learn', 'dashboard', 'website'].includes(app), 'Expected app and base URL');
const get = (path, options) => fetch(new URL(path, base), { signal: AbortSignal.timeout(10000), ...options });
for (let attempt = 0; ; attempt++) {
  try {
    assert.equal((await get('/healthz')).status, 200);
    break;
  } catch (error) {
    if (attempt >= 30) throw error;
    await setTimeout(1000);
  }
}
if (app === 'learn') {
  const root = await get('/', { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/guides/welcome/');
  const guide = await get('/guides/welcome/');
  assert.equal(guide.status, 200);
  const html = await guide.text();
  assert.match(html, /<html/);
  if (process.env.EXPECTED_WEBSITE_URL) {
    const expected = process.env.EXPECTED_WEBSITE_URL;
    assert(html.includes(`${expected}/contact`), 'Learn contact link must use preview Website');
    const registration = await (await get('/guides/registering-a-team/')).text();
    assert(registration.includes(`${expected}/dashboard/download`), 'MDX download link must use preview Website');
    for (const page of [html, registration]) {
      assert(!/href=["']https:\/\/(?:www\.)?lovat\.app(?:[\/"'])/.test(page), 'Learn links must not escape to production');
    }
  }
  assert.equal((await get('/nonexistent-guide')).status, 404);
} else if (app === 'dashboard') {
  const root = await get('/');
  assert.equal(root.status, 200);
  const html = await root.text();
  const deep = await get('/preview/deep-link', { headers: { accept: 'text/html' } });
  assert.equal(deep.status, 200);
  assert.equal(await deep.text(), html);
  assert.equal((await get('/missing-file.js')).status, 404);
  for (const path of ['/flutter_bootstrap.js', '/main.dart.js', '/flutter_service_worker.js']) {
    const asset = await get(path);
    assert.equal(asset.status, 200, path);
    assert.equal(asset.headers.get('cache-control'), 'no-cache', path);
  }
} else {
  const root = await get('/');
  assert.equal(root.status, 200);
  assert.match(root.headers.get('cache-control'), /no-store/);
  if (process.env.EXPECTED_LEARN_URL) {
    for (const [path, guide] of [['/dashboard', 'welcome'], ['/collection', 'scouting-a-match'], ['/scouting-lead', 'registering-a-team']]) {
      const redirect = await get(path, { redirect: 'manual', headers: { accept: 'text/html' } });
      assert.equal(redirect.status, 301);
      assert.equal(redirect.headers.get('location'), `${process.env.EXPECTED_LEARN_URL}/guides/${guide}`);
    }
    const html = await root.text();
    assert(html.includes(`${process.env.EXPECTED_LEARN_URL}/guides/welcome`));
    const download = await (await get('/download')).text();
    assert(download.includes(process.env.EXPECTED_DASHBOARD_URL));
    for (const page of [html, download]) {
      assert(!/href=["']https:\/\/(?:learn|dashboard)\.lovat\.app/.test(page), 'Website links must not escape to production');
    }
  }
  // The contact form's existing bot trap validates POST/redirect behavior without sending a message.
  const form = (origin) => get('/contact', {
    method: 'POST', redirect: 'manual',
    headers: { origin, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
    body: 'name=Hosting+test&email=test%40example.invalid&team=8033&message=Test',
  });
  assert.equal((await form(new URL(base).origin)).status, 303);
  assert.equal((await form('https://untrusted.invalid')).status, 403);
  const slack = await get('/api/slack/interaction', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'payload=%7B%7D',
  });
  assert.equal(slack.status, 400, 'Unsigned Slack requests must be rejected');
}
console.log(`${app}: hosting smoke checks passed`);
