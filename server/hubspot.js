/**
 * Thin client for the HubSpot CMS Pages API (landing pages, version 2026-09).
 * Only the calls this POC needs are wrapped; see
 * https://developers.hubspot.com/docs/api-reference/latest/cms/pages/guide
 */
const PAGES_PATH = '/cms/pages/2026-09/landing-pages';
// The schedule endpoint rejects publish dates that aren't in the future.
const DEFAULT_PUBLISH_LEAD_MS = 3_000;

/** A non-2xx response from HubSpot. `body` holds HubSpot's error details verbatim. */
export class HubSpotError extends Error {
  /**
   * @param {number} status HTTP status code.
   * @param {unknown} body  Parsed JSON error body, or raw text if it wasn't JSON.
   */
  constructor(status, body) {
    super(`HubSpot API ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * Creates a Pages API client.
 *
 * @param {object} options
 * @param {string} options.token  Service key or private app token with the `content` scope.
 *                                The token determines which HubSpot account is used.
 * @param {string} [options.baseUrl='https://api.hubapi.com']
 * @param {typeof fetch} [options.fetchImpl=fetch] Injectable for tests.
 * @param {number} [options.publishLeadMs=3000] How far ahead {@link publishNow} schedules publishing.
 */
export function createHubSpotClient({
  token,
  baseUrl = 'https://api.hubapi.com',
  fetchImpl = fetch,
  publishLeadMs = DEFAULT_PUBLISH_LEAD_MS,
}) {
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set');

  // Sends a request and returns parsed JSON (or null for empty bodies, e.g. 204).
  async function request(method, path, body) {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* keep raw text */ }
    if (!res.ok) throw new HubSpotError(res.status, data);
    return data;
  }

  return {
    /**
     * Creates a landing page as a draft.
     * @param {object} payload See `buildPagePayload` in quote.js.
     * @returns {Promise<{id: string, url: string}>} The created page (more fields are returned).
     */
    createPage: (payload) => request('POST', PAGES_PATH, payload),

    /** Fetches a page by id. Useful for debugging what HubSpot stored. */
    getPage: (id) => request('GET', `${PAGES_PATH}/${encodeURIComponent(id)}`),

    /**
     * Publishes a draft page. The API has no "publish now" for drafts, so this
     * schedules publishing `publishLeadMs` in the future; the page goes live a
     * few seconds later.
     * @param {string|number} id
     * @param {Date} [now=new Date()]
     */
    publishNow: (id, now = new Date()) => request('POST', `${PAGES_PATH}/schedule`, {
      id: String(id),
      publishDate: new Date(now.getTime() + publishLeadMs).toISOString(),
    }),

    /** Deletes (archives) a page. Its URL returns 404 within about a second. */
    deletePage: (id) => request('DELETE', `${PAGES_PATH}/${encodeURIComponent(id)}`),
  };
}
