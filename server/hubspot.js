const PAGES_PATH = '/cms/pages/2026-09/landing-pages';
// The schedule endpoint rejects publish dates that aren't in the future.
const DEFAULT_PUBLISH_LEAD_MS = 3_000;

export class HubSpotError extends Error {
  constructor(status, body) {
    super(`HubSpot API ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

export function createHubSpotClient({
  token,
  baseUrl = 'https://api.hubapi.com',
  fetchImpl = fetch,
  publishLeadMs = DEFAULT_PUBLISH_LEAD_MS,
}) {
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set');

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
    createPage: (payload) => request('POST', PAGES_PATH, payload),
    getPage: (id) => request('GET', `${PAGES_PATH}/${encodeURIComponent(id)}`),
    publishNow: (id, now = new Date()) => request('POST', `${PAGES_PATH}/schedule`, {
      id: String(id),
      publishDate: new Date(now.getTime() + publishLeadMs).toISOString(),
    }),
    deletePage: (id) => request('DELETE', `${PAGES_PATH}/${encodeURIComponent(id)}`),
  };
}
