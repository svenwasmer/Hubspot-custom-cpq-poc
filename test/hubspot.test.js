import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HubSpotError, createHubSpotClient } from '../server/hubspot.js';

function mockFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    const { status = 200, body = '' } = responses.shift();
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(status === 204 ? null : text, { status });
  };
  return { calls, fetchImpl };
}

const BASE = 'https://api.hubapi.com/cms/pages/2026-09/landing-pages';

test('requires a token', () => {
  assert.throws(() => createHubSpotClient({ token: '' }), /HUBSPOT_ACCESS_TOKEN/);
});

test('createPage posts the payload with a bearer token', async () => {
  const { calls, fetchImpl } = mockFetch([{ status: 201, body: { id: '123', url: 'https://x/quote/a' } }]);
  const client = createHubSpotClient({ token: 'tok', fetchImpl });
  const page = await client.createPage({ name: 'n' });
  assert.deepEqual(page, { id: '123', url: 'https://x/quote/a' });
  assert.equal(calls[0].url, BASE);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  assert.deepEqual(calls[0].body, { name: 'n' });
});

test('publishNow schedules slightly in the future (API rejects "now")', async () => {
  const { calls, fetchImpl } = mockFetch([{ status: 204 }]);
  const client = createHubSpotClient({ token: 'tok', fetchImpl });
  await client.publishNow(123, new Date('2026-10-16T00:00:00Z'));
  assert.equal(calls[0].url, `${BASE}/schedule`);
  assert.deepEqual(calls[0].body, { id: '123', publishDate: '2026-10-16T00:00:03.000Z' });
});

test('publishNow lead time is configurable', async () => {
  const { calls, fetchImpl } = mockFetch([{ status: 204 }]);
  const client = createHubSpotClient({ token: 'tok', fetchImpl, publishLeadMs: 10_000 });
  await client.publishNow(1, new Date('2026-10-16T00:00:00Z'));
  assert.equal(calls[0].body.publishDate, '2026-10-16T00:00:10.000Z');
});

test('deletePage sends DELETE to the page id', async () => {
  const { calls, fetchImpl } = mockFetch([{ status: 204 }]);
  const client = createHubSpotClient({ token: 'tok', fetchImpl });
  assert.equal(await client.deletePage('123'), null);
  assert.equal(calls[0].url, `${BASE}/123`);
  assert.equal(calls[0].method, 'DELETE');
});

test('non-2xx responses throw HubSpotError with the body', async () => {
  const { fetchImpl } = mockFetch([{ status: 400, body: { message: 'bad slug' } }]);
  const client = createHubSpotClient({ token: 'tok', fetchImpl });
  await assert.rejects(client.createPage({}), (err) => {
    assert.ok(err instanceof HubSpotError);
    assert.equal(err.status, 400);
    assert.deepEqual(err.body, { message: 'bad slug' });
    return true;
  });
});
