# Backlog

## Up next

- [ ] Explore: move the CPQ simulator into a HubSpot App Card / app (requirements, auto_deploy, auto_refresh)

## Completed

- [x] CPQ POC: explored UUID v4/v6 for randomness. Kept CSPRNG slug/password (UUID v4 = 122 bits, v6 = timestamp-based and guessable); rationale documented in `server/quote.js` and README
- [x] CPQ POC: coded landing page template + `quote-details` module, uploaded via `hs cms upload`
- [x] CPQ POC: local Node backend proxying the Pages API (create + publish, delete)
- [x] CPQ POC: random slug, random password, 30-day expiry on each quote page
- [x] CPQ POC: vanilla JS SPA to create quotes, show URL/password, delete pages
- [x] CPQ POC: unit tests (`npm test`)
- [x] CPQ POC: README with setup/run steps
- [x] CPQ POC: real round-trip against a HubSpot test account (create, publish, password, expiry, delete verified)
