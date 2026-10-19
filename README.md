# CPQ Quote Landing Pages: HubSpot Pages API POC

This proof of concept shows that a Configure-Price-Quote (CPQ) system can publish **one HubSpot landing page per quote** through the [HubSpot Pages API](https://developers.hubspot.com/docs/api-reference/latest/cms/pages/guide). Each page is rendered from a shared template and filled with the quote's data. It's:

- **Unguessable.** The URL path is random, e.g. `/quote/1144094057136bd8cfd81a6a725dbd99` (128 bits of randomness).
- **Password protected.** Every quote gets its own random password.
- **Time limited.** The page expires after 30 days (configurable) and then redirects to a URL you choose.
- **Removable.** Deleting the quote deletes the page, and its URL returns 404 within about a second.

A small vanilla JS web app (the **CPQ simulator**) stands in for the real CPQ system, so you can try the whole flow locally before integrating it with your own system.

---

## Contents

1. [How it works](#how-it-works)
2. [Requirements](#requirements)
3. [Setup](#setup)
4. [Usage](#usage)
5. [Configuration reference](#configuration-reference)
6. [Local API reference](#local-api-reference)
7. [Adapting it to your use case](#adapting-it-to-your-use-case)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)
10. [Project structure](#project-structure)
11. [Limitations](#limitations)

---

## How it works

```
┌──────────────────────┐    /api/quotes    ┌──────────────────────┐   Pages API (HTTPS)   ┌───────────────────────────┐
│  CPQ simulator (SPA) │ ────────────────▶ │  Local Node backend  │ ────────────────────▶ │  HubSpot                  │
│  public/             │ ◀──────────────── │  server/             │ ◀──────────────────── │  landing page per quote   │
│  browser             │   quote + URL     │  holds the API token │   page id + URL       │  (template: hubspot/...)  │
└──────────────────────┘                   └──────────────────────┘                       └───────────────────────────┘
                                                      │
                                                      ▼
                                              data/quotes.json
                                         (page id, URL, password)
```

**Why is there a backend?** Browsers can't call `api.hubapi.com` directly, because HubSpot doesn't allow cross-origin (CORS) API requests. A browser call would also expose your access token. The backend keeps the token on the server and is the only part that talks to HubSpot. In a real integration, your CPQ system's backend plays this role.

### What happens when a quote is submitted

1. The SPA sends the quote (customer, company, line items, …) to `POST /api/quotes`.
2. The backend validates the input and recalculates the total (`server/quote.js`).
3. It generates a random slug, a random password and an expiry date 30 days out.
4. It creates the landing page as a draft: `POST /cms/pages/2026-09/landing-pages`. The request body contains:
   - `templatePath`: the coded template in `hubspot/cpq-poc/`.
   - `slug` and `password`.
   - `pageExpiryEnabled`, `pageExpiryDate` and `pageExpiryRedirectUrl`.
   - `widgets.quote_details.body`: the quote data, which fills the fields of the `quote-details` module in the template.
5. It publishes the page: `POST /cms/pages/2026-09/landing-pages/schedule`. The API only accepts a publish time in the future, so the backend schedules publishing 3 seconds ahead. The page is typically live about 5 seconds after you submit.
6. It stores the page id, URL and password in `data/quotes.json` and returns them to the SPA.

If publishing fails, the backend deletes the draft, so no half-created pages are left behind.

### What happens when a quote is deleted

The backend calls `DELETE /cms/pages/2026-09/landing-pages/{id}` and removes the local record. The page URL returns 404 within about a second.

HubSpot serves pages with `Cache-Control: max-age=5`, so a browser that already has the page open may keep showing its copy for up to 5 seconds after a reload.

---

## Requirements

| Requirement | Notes |
| --- | --- |
| **HubSpot account** with landing pages | A sandbox or test account is recommended for trying this out. Password protection and page expiration were verified on a standard account. To confirm they're available on your subscription, see [Password protect a page](https://knowledge.hubspot.com/website-pages/password-protect-a-page). |
| **HubSpot user permissions** | To create a service key you must be a **Super admin** or have the **Developer tools** access permission. To upload the template you need Design Manager access. |
| **Node.js 20.6 or newer** | Uses the built-in `fetch`, `node:test` and `--env-file`. There are **no npm dependencies** to install. Check with `node --version`. |
| **HubSpot CLI (`hs`)** | Only needed to upload the template and module. Install with `npm install -g @hubspot/cli`. Tested with version 8.16. |

---

## Setup

### 1. Get the code

```sh
git clone <repository-url>
cd <repository-folder>
```

### 2. Connect the HubSpot CLI to your account

```sh
hs init          # first account: creates the CLI config and opens the browser to authenticate
# or, if the CLI is already set up for other accounts:
hs account auth
hs account list  # confirm the account is listed; note its name or ID
```

### 3. Upload the template and module

This uploads `hubspot/cpq-poc/` into a `cpq-poc` folder in your account's Design Manager.

```sh
npm run upload-template -- --account=<account name or ID>
# same as: hs cms upload hubspot/cpq-poc cpq-poc --account=<account>
```

You should see `SUCCESS Uploading files to "cpq-poc" in the Design Manager is complete`. In HubSpot, go to **Content › Design Manager** and you'll find:

- `cpq-poc/templates/quote.html`: the page template.
- `cpq-poc/modules/quote-details.module`: the module that renders the quote.

Run this again whenever you change files in `hubspot/`.

### 4. Create a service key

Following [Make API requests using a service key](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/account-service-keys):

1. In HubSpot, go to **Development › Keys › Service keys** and click **Create service key**.
2. Name it, for example "CPQ quote pages POC".
3. Click **Add new scope** and select **`content`**. That's the only scope the Pages API needs.
4. Click **Create**, then **Show** and **Copy** to copy the key.

A private app access token with the `content` scope also works. The token decides which HubSpot account the pages are created in, so use one from the same account you uploaded the template to.

### 5. Configure `.env`

```sh
cp .env.example .env
```

Then edit `.env`. At minimum, set:

```sh
HUBSPOT_ACCESS_TOKEN=pat-...                     # the service key from step 4
EXPIRY_REDIRECT_URL=https://www.your-company.com # where expired quote pages redirect
```

All variables are described in the [configuration reference](#configuration-reference). `.env` is gitignored. Never commit it.

### 6. Start the simulator

```sh
npm start
```

Open **http://localhost:3000**.

---

## Usage

1. **Fill in the quote.** Enter a customer name and company, and optionally a quote number and currency. Add line items with a description, quantity and unit price; the total updates as you type. You can add notes.
2. **Submit the quote.** After a few seconds, the quote appears in the **Quotes** list with:
   - the **page URL** (clickable)
   - the **password** (with a **Copy** button)
   - the **expiry date**
3. **Open the page.** Click **Open** or the URL. HubSpot shows a password prompt; paste the password to see the rendered quote. If you get a 404 right after submitting, wait a few seconds: the page goes live about 3 seconds after creation.
4. **Delete the page.** Click **Delete page** and confirm. The page is deleted in HubSpot, and the quote disappears from the list.

The pages also appear in HubSpot under **Content › Landing Pages**, named `Quote <number> – <company>`.

---

## Configuration reference

All settings are environment variables, read from `.env` by `npm start`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `HUBSPOT_ACCESS_TOKEN` | **yes** | – | Service key or private app token with the `content` scope. It determines the HubSpot account. |
| `EXPIRY_REDIRECT_URL` | recommended | `https://www.hubspot.com` | Where visitors go once a quote page has expired. |
| `HUBSPOT_TEMPLATE_PATH` | no | `cpq-poc/templates/quote.html` | Design Manager path of the template, without a leading `/`. Change this if you upload to a different folder. |
| `HUBSPOT_DOMAIN` | no | *(blank)* | Domain for the pages, e.g. `quotes.your-company.com`. When blank, HubSpot uses the account's default landing page domain (e.g. `<account-id>.hs-sites.com`). The domain must be connected in HubSpot. |
| `QUOTE_EXPIRY_DAYS` | no | `30` | Days until a quote page expires. |
| `PUBLISH_LEAD_SECONDS` | no | `3` | How far ahead publishing is scheduled. The API rejects times that are already past, so don't go lower than about 2. Raise it if you see `publishDate must be in the future` errors. |
| `PORT` | no | `3000` | Port of the local server. It only listens on `127.0.0.1`. |

---

## Local API reference

The SPA uses these endpoints. Your own CPQ system or scripts can call them too.

| Method & path | Body | Response |
| --- | --- | --- |
| `GET /api/quotes` | – | `200`: array of quote records, newest first |
| `POST /api/quotes` | quote JSON (below) | `201`: quote record · `400`: validation error · `502`: HubSpot error (with `details`) |
| `DELETE /api/quotes/:id` | – | `204` · `404`: unknown quote · `502`: HubSpot error |

**Quote JSON**

| Field | Required | Notes |
| --- | --- | --- |
| `customerName` | yes | |
| `company` | yes | |
| `lineItems` | yes | At least one: `{ description, quantity (>= 1), unitPrice (>= 0) }` |
| `quoteNumber` | no | Generated if empty |
| `currency` | no | Default `USD`; display only |
| `notes` | no | |

```sh
curl -X POST http://localhost:3000/api/quotes \
  -H 'Content-Type: application/json' \
  -d '{
    "quoteNumber": "Q-1001",
    "customerName": "Jane Doe",
    "company": "Acme Inc.",
    "currency": "EUR",
    "lineItems": [
      { "description": "Platform license (annual)", "quantity": 1, "unitPrice": 12000 },
      { "description": "Onboarding", "quantity": 1, "unitPrice": 2500 }
    ]
  }'
```

The quote record returned adds `id`, `pageId`, `url`, `password`, `expiresAt`, `createdAt` and the calculated `total`.

---

## Adapting it to your use case

### Change what a quote contains

Quote data flows through four places. Keep the field names in sync:

| Step | File | What to change |
| --- | --- | --- |
| 1. Module fields | `hubspot/cpq-poc/modules/quote-details.module/fields.json` | Add, rename or remove fields. See [module fields](https://developers.hubspot.com/docs/cms/reference/fields/module-theme-fields). |
| 2. Page rendering | `hubspot/cpq-poc/modules/quote-details.module/module.html` | Render the fields with HubL, e.g. `{{ module.my_field }}`. |
| 3. API payload | `server/quote.js` → `buildPagePayload()` | Map your quote data onto `widgets.quote_details.body`. Each key must equal a field `name` from step 1. |
| 4. Input and validation | `server/quote.js` → `normalizeQuote()` and `public/` | Accept and validate the new input fields. |

Then run `npm run upload-template -- --account=<account>`, restart the server, and update the tests in `test/quote.test.js`.

### Change the look of the page

- **Styling:** edit `module.css` (quote block) or `templates/quote.html` (page shell), then upload again.
- **Your theme:** to use your site's theme, move the module into your theme and point `HUBSPOT_TEMPLATE_PATH` at a landing page template from that theme that includes `{% module "quote_details" path="…/quote-details" %}`. The module name `quote_details` must match the `widgets` key in `buildPagePayload()`.

### Change URL, password or expiry behaviour

All in `server/quote.js`:

- `randomSlug(prefix)` controls the URL path (default prefix `quote`).
- `randomPassword()` controls password length and alphabet.
- `expiryDate()` together with `QUOTE_EXPIRY_DAYS` controls when pages expire.

To remove password protection, drop the `password` field from `buildPagePayload()`.

### Connect your real CPQ system

The SPA in `public/` is only a stand-in. To integrate:

1. **Call the backend.** Either call this backend's `POST /api/quotes` from your CPQ system, or reuse `server/quote.js` and `server/hubspot.js` inside your own backend. Both are dependency-free ES modules.
2. **Store the page details.** Save `pageId`, `url` and `password` against the quote in your own database instead of `data/quotes.json`.
3. **Delete on change.** Call delete when a quote is withdrawn or superseded.

### Before using this beyond a POC

- **Secure the API.** Add authentication to the backend API. It currently has none and relies on listening only on `127.0.0.1`.
- **Manage the token as a secret.** Keep it in a secrets manager and rotate it regularly. HubSpot recommends rotating service keys every six months.
- **Escape untrusted text.** If quote text can come from untrusted input, add HubL's `|escape` filter to text fields in `module.html`.
- **Mind the rate limits.** Service keys are subject to [HubSpot's API limits](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines). Batch endpoints exist if you need to create many pages at once.

---

## Testing

```sh
npm test
```

This runs the `node:test` suites in `test/`. HubSpot is **mocked**, so the tests need no token and create no pages. They cover:

- slug and password format and uniqueness, expiry calculation, validation and payload shape (`quote.test.js`)
- the Pages API client: endpoints, auth header, error handling (`hubspot.test.js`)
- the HTTP API: create, list, delete, publish-failure cleanup, static file serving (`server.test.js`)

To validate the HubL in the template and module without uploading:

```sh
hs cms lint hubspot/cpq-poc --account=<account>
```

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `HUBSPOT_ACCESS_TOKEN is not set` on start | `.env` is missing, or the variable is empty. Run `cp .env.example .env` and set it. |
| `401` from HubSpot | The token is invalid, expired or rotated. Copy a fresh one into `.env` and restart. |
| `403` / missing scopes | The service key lacks the `content` scope. Edit the key in **Development › Keys › Service keys**. |
| Error mentioning the template or `templatePath` | The template isn't uploaded to this account, or `HUBSPOT_TEMPLATE_PATH` doesn't match. Run step 3 of [Setup](#setup) against the same account the token belongs to. |
| `publishDate must be in the future` | The publish lead is too short for your network or clock. Increase `PUBLISH_LEAD_SECONDS`, or check that your computer's clock is synced. |
| Page URL shows 404 right after creation | Publishing is scheduled a few seconds ahead. Wait about 5 seconds and reload. |
| Deleted page still visible after reload | The browser may reuse its copy for up to 5 seconds (`max-age=5`). Reload again. |
| Page shows default values (e.g. "Jane Doe", "Acme Inc.") | The `widgets` keys don't match the module. Check that `quote_details` and the field names in `buildPagePayload()` match `templates/quote.html` and `fields.json`. |
| `'landing_page' is not a valid template type` on upload | Coded templates use `templateType: page` for landing pages too. Keep the annotation as shipped. |
| `Did you mean hs cms upload?` | Newer CLI versions moved the command to `hs cms upload`. Use `npm run upload-template`. |

When HubSpot rejects a request, the backend logs the full error to the terminal and the SPA shows HubSpot's error details below the form.

---

## Project structure

```
hubspot/cpq-poc/                     uploaded to HubSpot's Design Manager with the hs CLI
  templates/quote.html               landing page template; places the quote_details module
  modules/quote-details.module/
    fields.json                      module fields = the quote data model on the page
    module.html, module.css          how a quote is rendered
    meta.json                        module metadata
server/                              local backend (Node, no dependencies)
  index.js                           HTTP server: static SPA + /api/quotes routes
  quote.js                           pure logic: validation, slug/password/expiry, Pages API payload
  hubspot.js                         Pages API client: create, publish, get, delete
  store.js                           JSON file store (data/quotes.json)
public/                              CPQ simulator SPA (vanilla JS, no build step)
test/                                node:test suites (HubSpot mocked)
.env.example                         all configuration variables, with placeholders
```

---

## Limitations

- **Local only.** There's no hosting, authentication or multi-user support.
- **File-based storage.** `data/quotes.json` is a local file, and it contains page passwords (it's gitignored).
- **Local and HubSpot can drift.** Pages deleted directly in HubSpot stay in the simulator's list until you click **Delete page**; the backend treats a 404 as already deleted. Pages created by the simulator and then removed from `data/quotes.json` must be deleted in HubSpot manually.
- **Display-only currency.** No currency conversion or locale-specific number formatting beyond HubL's `format_number`.
