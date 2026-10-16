import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ValidationError, buildPagePayload, expiryDate, normalizeQuote, randomPassword, randomSlug,
} from './quote.js';
import { HubSpotError, createHubSpotClient } from './hubspot.js';
import { createStore } from './store.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC_DIR = join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(data === undefined ? '' : JSON.stringify(data));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new ValidationError('Request body too large');
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new ValidationError('Invalid JSON body');
  }
}

async function serveStatic(req, res) {
  const urlPath = new URL(req.url, 'http://localhost').pathname;
  const filePath = normalize(join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR + sep)) return sendJson(res, 403, { error: 'Forbidden' });
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

export function createApp({ client, store, config, now = () => new Date() }) {
  async function createQuote(req, res) {
    const quote = normalizeQuote(await readJson(req));
    const createdAt = now();
    const expiresAt = expiryDate(createdAt, config.expiryDays);
    const password = randomPassword();
    const payload = buildPagePayload(quote, {
      templatePath: config.templatePath,
      domain: config.domain,
      slug: randomSlug(),
      password,
      expiresAt,
      redirectUrl: config.redirectUrl,
    });

    const page = await client.createPage(payload);
    try {
      await client.publishNow(page.id, createdAt);
    } catch (err) {
      // Don't leave an orphaned draft behind if publishing fails.
      await client.deletePage(page.id).catch(() => {});
      throw err;
    }

    const record = await store.save({
      id: randomUUID(),
      ...quote,
      pageId: String(page.id),
      url: page.url,
      password,
      expiresAt: expiresAt.toISOString(),
      createdAt: createdAt.toISOString(),
    });
    sendJson(res, 201, record);
  }

  async function deleteQuote(res, id) {
    const record = await store.get(id);
    if (!record) return sendJson(res, 404, { error: 'Quote not found' });
    try {
      await client.deletePage(record.pageId);
    } catch (err) {
      // Page already gone in HubSpot: still clean up locally.
      if (!(err instanceof HubSpotError && err.status === 404)) throw err;
    }
    await store.remove(id);
    sendJson(res, 204);
  }

  return async function handler(req, res) {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname === '/api/quotes' && req.method === 'GET') return sendJson(res, 200, await store.list());
      if (pathname === '/api/quotes' && req.method === 'POST') return await createQuote(req, res);
      const match = pathname.match(/^\/api\/quotes\/([\w-]+)$/);
      if (match && req.method === 'DELETE') return await deleteQuote(res, match[1]);
      if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
      if (req.method === 'GET') return await serveStatic(req, res);
      sendJson(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      if (err instanceof ValidationError) return sendJson(res, 400, { error: err.message });
      if (err instanceof HubSpotError) {
        console.error(err.message);
        return sendJson(res, 502, { error: 'HubSpot API error', status: err.status, details: err.body });
      }
      console.error(err);
      sendJson(res, 500, { error: 'Internal error' });
    }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = {
    templatePath: process.env.HUBSPOT_TEMPLATE_PATH || 'cpq-poc/templates/quote.html',
    domain: process.env.HUBSPOT_DOMAIN || '',
    redirectUrl: process.env.EXPIRY_REDIRECT_URL || 'https://www.hubspot.com',
    expiryDays: Number(process.env.QUOTE_EXPIRY_DAYS || 30),
  };
  const app = createApp({
    client: createHubSpotClient({
      token: process.env.HUBSPOT_ACCESS_TOKEN,
      publishLeadMs: Number(process.env.PUBLISH_LEAD_SECONDS || 3) * 1000,
    }),
    store: createStore(join(ROOT, 'data', 'quotes.json')),
    config,
  });
  const port = Number(process.env.PORT || 3000);
  createServer(app).listen(port, '127.0.0.1', () => {
    console.log(`CPQ simulator running at http://localhost:${port}`);
  });
}
