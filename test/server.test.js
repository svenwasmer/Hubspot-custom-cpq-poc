import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { HubSpotError } from '../server/hubspot.js';

const config = {
  templatePath: 'cpq-poc/templates/quote.html',
  domain: '',
  redirectUrl: 'https://example.com',
  expiryDays: 30,
};
const quoteInput = {
  customerName: 'Jane',
  company: 'Acme',
  lineItems: [{ description: 'License', quantity: 1, unitPrice: 10 }],
};

let server, baseUrl, dir, client, calls;

function fakeClient(overrides = {}) {
  calls = [];
  return {
    createPage: async (payload) => { calls.push(['create', payload]); return { id: 42, url: `https://x/${payload.slug}` }; },
    publishNow: async (id) => { calls.push(['publish', id]); },
    deletePage: async (id) => { calls.push(['delete', id]); return null; },
    ...overrides,
  };
}

async function start(c) {
  client = c;
  const app = createApp({ client, store: createStore(join(dir, 'quotes.json')), config });
  server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

const post = (body) => fetch(`${baseUrl}/api/quotes`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'cpq-')); });
afterEach(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

test('POST /api/quotes creates, publishes and stores the quote', async () => {
  await start(fakeClient());
  const res = await post(quoteInput);
  assert.equal(res.status, 201);
  const record = await res.json();
  assert.equal(record.pageId, '42');
  assert.match(record.url, /^https:\/\/x\/quote\/[0-9a-f]{32}$/);
  assert.match(record.password, /^[\w-]{16}$/);
  assert.equal(record.total, 10);
  assert.deepEqual(calls.map((c) => c[0]), ['create', 'publish']);
  assert.equal(calls[0][1].password, record.password);

  const list = await (await fetch(`${baseUrl}/api/quotes`)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, record.id);
});

test('POST /api/quotes returns 400 on invalid input without calling HubSpot', async () => {
  await start(fakeClient());
  const res = await post({ ...quoteInput, company: '' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /company/);
  assert.equal(calls.length, 0);
});

test('publish failure deletes the draft and returns 502', async () => {
  await start(fakeClient({
    publishNow: async () => { throw new HubSpotError(400, { message: 'nope' }); },
  }));
  const res = await post(quoteInput);
  assert.equal(res.status, 502);
  assert.deepEqual((await res.json()).details, { message: 'nope' });
  assert.deepEqual(calls.map((c) => c[0]), ['create', 'delete']);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/quotes`)).json(), []);
});

test('DELETE /api/quotes/:id deletes the page and the record', async () => {
  await start(fakeClient());
  const record = await (await post(quoteInput)).json();
  const res = await fetch(`${baseUrl}/api/quotes/${record.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
  assert.deepEqual(calls.at(-1), ['delete', '42']);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/quotes`)).json(), []);
});

test('DELETE tolerates a page already removed in HubSpot', async () => {
  await start(fakeClient({ deletePage: async () => { throw new HubSpotError(404, 'gone'); } }));
  const record = await (await post(quoteInput)).json();
  const res = await fetch(`${baseUrl}/api/quotes/${record.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
});

test('DELETE of an unknown quote returns 404', async () => {
  await start(fakeClient());
  const res = await fetch(`${baseUrl}/api/quotes/nope`, { method: 'DELETE' });
  assert.equal(res.status, 404);
});

test('serves the SPA and blocks path traversal', async () => {
  await start(fakeClient());
  const index = await fetch(`${baseUrl}/`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /CPQ Simulator/);
  const traversal = await fetch(`${baseUrl}/..%2fpackage.json`);
  assert.notEqual(traversal.status, 200);
});
