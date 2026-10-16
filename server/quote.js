import { randomBytes } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

export class ValidationError extends Error {}

// 128 bits of randomness, so quote URLs can't be guessed or enumerated.
export function randomSlug(prefix = 'quote') {
  return `${prefix}/${randomBytes(16).toString('hex')}`;
}

export function randomPassword() {
  return randomBytes(12).toString('base64url');
}

export function expiryDate(now = new Date(), days = 30) {
  return new Date(now.getTime() + days * DAY_MS);
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} is required`);
  }
  return value.trim();
}

function requireNumber(value, field, { min = 0 } = {}) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num) || num < min) {
    throw new ValidationError(`${field} must be a number >= ${min}`);
  }
  return num;
}

const round2 = (n) => Math.round(n * 100) / 100;

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

export function buildPagePayload(quote, { templatePath, domain, slug, password, expiresAt, redirectUrl }) {
  const payload = {
    name: `Quote ${quote.quoteNumber} – ${quote.company}`,
    htmlTitle: `Your quote ${quote.quoteNumber}`,
    templatePath,
    slug,
    password,
    pageExpiryEnabled: true,
    pageExpiryDate: expiresAt.getTime(),
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
          valid_until: expiresAt.toISOString().slice(0, 10),
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
