# hs-cms-cli-tests — CPQ quote landing page POC

A local CPQ simulator (vanilla JS SPA + zero-dependency Node backend). For every quote it creates a HubSpot landing page through the Pages API, using a coded template. Each page is:

- reachable at a random, unguessable slug (`quote/<32 hex chars>`)
- password protected, with a random password per quote
- set to expire after 30 days and redirect to `EXPIRY_REDIRECT_URL`
- deletable from the SPA

The backend exists because the browser can't call `api.hubapi.com` directly: CORS blocks it, and the call would expose the access token.

## Prerequisites

- Node.js >= 20.6 (uses `--env-file`)
- HubSpot CLI (`hs`), authenticated to the target account (`hs accounts list`)
- A service key or private app token for that account with the `content` scope

## Setup

1. Upload the template and module to the account's Design Manager:
   ```sh
   npm run upload-template          # = hs cms upload hubspot/cpq-poc cpq-poc
   # add --account=<id|name> to target a non-default account
   ```
2. Create `.env` from the example and fill in the token:
   ```sh
   cp .env.example .env
   ```

## Run

```sh
npm start    # http://localhost:3000
npm test     # unit + API route tests (HubSpot calls are mocked)
```

## How it works

| Step | Call |
| --- | --- |
| Create page | `POST /cms/pages/2026-09/landing-pages` with `templatePath`, `slug`, `password`, `pageExpiryEnabled`, `pageExpiryDate`, `pageExpiryRedirectUrl` and `widgets.quote_details.body` (module field values) |
| Publish | `POST /cms/pages/2026-09/landing-pages/schedule` with `{ id, publishDate: now + PUBLISH_LEAD_SECONDS }` (default 3s; the API rejects "now") |
| Delete | `DELETE /cms/pages/2026-09/landing-pages/{id}` |

Quotes, including page id, URL and password, are stored locally in `data/quotes.json`, which is gitignored.

## Layout

```
hubspot/cpq-poc/   coded landing page template + quote-details module (uploaded with hs)
server/            Node backend: quote.js (pure logic), hubspot.js (API client), store.js, index.js (HTTP)
public/            SPA
test/              node:test suites
```
