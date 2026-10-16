import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError, buildPagePayload, expiryDate, normalizeQuote, randomPassword, randomSlug,
} from '../server/quote.js';

const validInput = {
  quoteNumber: 'Q-1',
  customerName: 'Jane Doe',
  company: 'Acme',
  currency: 'EUR',
  lineItems: [
    { description: 'License', quantity: 2, unitPrice: 100.5 },
    { description: 'Onboarding', quantity: '1', unitPrice: '0.1' },
  ],
};

test('randomSlug is prefixed, 32 hex chars, and unique', () => {
  const slugs = new Set(Array.from({ length: 1000 }, () => randomSlug()));
  assert.equal(slugs.size, 1000);
  for (const slug of slugs) assert.match(slug, /^quote\/[0-9a-f]{32}$/);
});

test('randomPassword is url-safe, 16 chars, and unique', () => {
  const pwds = new Set(Array.from({ length: 1000 }, () => randomPassword()));
  assert.equal(pwds.size, 1000);
  for (const p of pwds) assert.match(p, /^[A-Za-z0-9_-]{16}$/);
});

test('expiryDate defaults to 30 days from now', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  assert.equal(expiryDate(now).toISOString(), '2026-11-15T12:00:00.000Z');
  assert.equal(expiryDate(now, 1).toISOString(), '2026-10-17T12:00:00.000Z');
});

test('normalizeQuote coerces numbers and computes the total', () => {
  const q = normalizeQuote(validInput);
  assert.equal(q.total, 201.1);
  assert.deepEqual(q.lineItems[1], { description: 'Onboarding', quantity: 1, unitPrice: 0.1 });
  assert.equal(q.currency, 'EUR');
});

test('normalizeQuote fills defaults for quote number and currency', () => {
  const q = normalizeQuote({ ...validInput, quoteNumber: '', currency: undefined });
  assert.match(q.quoteNumber, /^Q-/);
  assert.equal(q.currency, 'USD');
});

test('normalizeQuote rejects missing or invalid fields', () => {
  assert.throws(() => normalizeQuote(null), ValidationError);
  assert.throws(() => normalizeQuote({ ...validInput, customerName: ' ' }), /customerName/);
  assert.throws(() => normalizeQuote({ ...validInput, lineItems: [] }), /line item/);
  assert.throws(
    () => normalizeQuote({ ...validInput, lineItems: [{ description: 'x', quantity: 0, unitPrice: 1 }] }),
    /quantity/,
  );
  assert.throws(
    () => normalizeQuote({ ...validInput, lineItems: [{ description: 'x', quantity: 1, unitPrice: 'abc' }] }),
    /unitPrice/,
  );
});

test('buildPagePayload sets template, slug, password, expiry and module data', () => {
  const quote = normalizeQuote(validInput);
  const expiresAt = new Date('2026-11-15T12:00:00Z');
  const payload = buildPagePayload(quote, {
    templatePath: 'cpq-poc/templates/quote.html',
    domain: '',
    slug: 'quote/abc',
    password: 'secret',
    expiresAt,
    redirectUrl: 'https://example.com',
  });
  assert.equal(payload.templatePath, 'cpq-poc/templates/quote.html');
  assert.equal(payload.slug, 'quote/abc');
  assert.equal(payload.password, 'secret');
  assert.equal(payload.pageExpiryEnabled, true);
  assert.equal(payload.pageExpiryDate, expiresAt.getTime());
  assert.equal(payload.pageExpiryRedirectUrl, 'https://example.com');
  assert.equal('domain' in payload, false);
  const body = payload.widgets.quote_details.body;
  assert.equal(body.valid_until, '2026-11-15');
  assert.equal(body.total, 201.1);
  assert.deepEqual(body.line_items[0], { description: 'License', quantity: 2, unit_price: 100.5 });
});

test('buildPagePayload includes domain when configured', () => {
  const payload = buildPagePayload(normalizeQuote(validInput), {
    templatePath: 't', domain: 'quotes.example.com', slug: 's', password: 'p',
    expiresAt: new Date(), redirectUrl: 'r',
  });
  assert.equal(payload.domain, 'quotes.example.com');
});
