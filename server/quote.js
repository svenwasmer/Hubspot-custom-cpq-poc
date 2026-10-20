/**
 * Pure quote logic: input validation, random slug/password generation, expiry
 * calculation and building the HubSpot Pages API payload.
 *
 * Nothing in this file does I/O, so it is easy to unit test and the natural
 * place to adapt the POC to a different quote data model.
 */
import { randomBytes } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Thrown for invalid client input; the HTTP layer maps it to a 400 response. */
export class ValidationError extends Error {}

/**
 * @typedef {object} LineItem
 * @property {string} description
 * @property {number} quantity   Whole or fractional units, >= 1.
 * @property {number} unitPrice  Price per unit, >= 0.
 */

/**
 * A validated quote, as produced by {@link normalizeQuote}.
 * @typedef {object} Quote
 * @property {string} quoteNumber
 * @property {string} customerName
 * @property {string} company
 * @property {string} currency     Display-only currency code, e.g. "USD".
 * @property {string} notes
 * @property {LineItem[]} lineItems
 * @property {number} total        Sum of quantity * unitPrice, rounded to 2 decimals.
 */

/**
 * Generates an unguessable page slug, e.g. `quote/1144094057136bd8cfd81a6a725dbd99`.
 * 16 random bytes = 128 bits of entropy, so URLs can't be guessed or enumerated.
 *
 * Why not a UUID? `randomBytes` reads from the OS CSPRNG, the same source UUID v4
 * (`crypto.randomUUID()`) uses, so UUID v4 is no "more random". It has 122 random bits
 * (6 are fixed for version/variant), i.e. slightly less. UUID v1/v6/v7 embed a
 * timestamp, which makes them partly predictable and leaks the creation time, so they
 * must not be used for unguessable URLs.
 * @param {string} [prefix='quote'] URL path segment placed before the random part.
 * @returns {string}
 */
export function randomSlug(prefix = 'quote') {
  return `${prefix}/${randomBytes(16).toString('hex')}`;
}

/**
 * Generates a random 16-character, URL-safe page password (96 bits of entropy).
 * Uses the OS CSPRNG like {@link randomSlug}. A UUID is a poor fit here: it has fixed bits,
 * dashes and a fixed format, and offers no more entropy per character.
 * @returns {string}
 */
export function randomPassword() {
  return randomBytes(12).toString('base64url');
}

/**
 * Returns the moment a quote page should expire.
 * @param {Date} [now=new Date()]
 * @param {number} [days=30]
 * @returns {Date}
 */
export function expiryDate(now = new Date(), days = 30) {
  return new Date(now.getTime() + days * DAY_MS);
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} is required`);
  }
  return value.trim();
}

// Accepts numbers or numeric strings (HTML form values arrive as strings).
function requireNumber(value, field, { min = 0 } = {}) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num) || num < min) {
    throw new ValidationError(`${field} must be a number >= ${min}`);
  }
  return num;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Validates raw request input and returns a clean {@link Quote}.
 * The total is always calculated here, never trusted from the client.
 *
 * Optional fields: `quoteNumber` (generated if empty), `currency` (defaults to
 * "USD"), `notes`.
 *
 * @param {unknown} input Parsed JSON body from the SPA (or any other caller).
 * @returns {Quote}
 * @throws {ValidationError} When a required field is missing or invalid.
 */
export function normalizeQuote(input) {
  if (!input || typeof input !== 'object') throw new ValidationError('Quote body is required');
  const items = input.lineItems;
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('At least one line item is required');
  }
  const lineItems = items.map((item, i) => ({
    description: requireText(item?.description, `lineItems[${i}].description`),
    quantity: requireNumber(item?.quantity, `lineItems[${i}].quantity`, { min: 1 }),
    unitPrice: requireNumber(item?.unitPrice, `lineItems[${i}].unitPrice`),
  }));
  return {
    quoteNumber: typeof input.quoteNumber === 'string' && input.quoteNumber.trim()
      ? input.quoteNumber.trim()
      : `Q-${Date.now().toString(36).toUpperCase()}`,
    customerName: requireText(input.customerName, 'customerName'),
    company: requireText(input.company, 'company'),
    currency: typeof input.currency === 'string' && input.currency.trim() ? input.currency.trim() : 'USD',
    notes: typeof input.notes === 'string' ? input.notes.trim() : '',
    lineItems,
    total: round2(lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0)),
  };
}

/**
 * Builds the request body for `POST /cms/pages/2026-09/landing-pages`.
 *
 * Quote data reaches the template through `widgets.quote_details.body`:
 * - `quote_details` must match the module name used in
 *   `hubspot/cpq-poc/templates/quote.html` (`{% module "quote_details" ... %}`).
 * - Every key in `body` must match a field `name` in
 *   `hubspot/cpq-poc/modules/quote-details.module/fields.json`.
 * If you add or rename module fields, update this mapping too.
 *
 * @param {Quote} quote
 * @param {object} options
 * @param {string} options.templatePath Design Manager path of the template, no leading slash.
 * @param {string} [options.domain]     Landing page domain; omitted = account's primary landing page domain.
 * @param {string} options.slug         URL path of the page (see {@link randomSlug}).
 * @param {string} options.password     Visitors must enter this to view the page.
 * @param {Date} options.expiresAt      After this moment the page redirects to `redirectUrl`.
 * @param {string} options.redirectUrl  Where expired pages send visitors.
 * @returns {object} Page payload.
 */
export function buildPagePayload(quote, { templatePath, domain, slug, password, expiresAt, redirectUrl }) {
  const payload = {
    name: `Quote ${quote.quoteNumber} – ${quote.company}`, // internal name in HubSpot's page list
    htmlTitle: `Your quote ${quote.quoteNumber}`, // browser tab title
    templatePath,
    slug,
    password,
    pageExpiryEnabled: true,
    pageExpiryDate: expiresAt.getTime(), // epoch milliseconds
    pageExpiryRedirectUrl: redirectUrl,
    widgets: {
      quote_details: {
        name: 'quote_details',
        type: 'module',
        body: {
          quote_number: quote.quoteNumber,
          customer_name: quote.customerName,
          company: quote.company,
          currency: quote.currency,
          valid_until: expiresAt.toISOString().slice(0, 10), // YYYY-MM-DD
          line_items: quote.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unitPrice,
          })),
          total: quote.total,
          notes: quote.notes,
        },
      },
    },
  };
  if (domain) payload.domain = domain;
  return payload;
}
