# Global marketplace audit — Motor Market

Audit date: 9 November 2026. Scope: source inspection and automated API integration journey for the local React/Node prototype. Competitor observations are limited to publicly accessible official product/help pages linked below; a checked feature is not a claim that every competitor offers it in every country.

## Product and architecture

Motor Market is a Ghana-first vehicle marketplace prototype. The client is React 19, Vite 8 and Tailwind CSS 4. A Node.js HTTP server provides JSON APIs and serves the production bundle. Data is stored in SQLite through Node's built-in `node:sqlite` `DatabaseSync`; there are no added runtime dependencies. User sessions are opaque random tokens whose hashes are stored in SQLite. Local vehicle photos are resized in the browser and stored as BLOBs in SQLite.

Core tables cover users/profiles, dealer profiles, vehicles and media, favourites, saved searches, recent views, enquiries/messages, notifications, reports, verification/inspection/import/shipping estimate records, customs rules, subscriptions/payments, roles, audit logs and sessions. Several trust, commerce and logistics tables have no live integration or complete product flow yet; their presence alone does not mean the capability is available.

## Current feature status

| Feature | Status | What works / limitation |
| --- | --- | --- |
| Homepage, responsive catalogue and CTA | EXISTING AND WORKING | React marketplace pages, responsive Tailwind layouts and visible browse/account actions. Visual/browser acceptance still needs a current manual review. |
| Search and filters | EXISTING AND WORKING | Combined keyword, make/model, price, year, mileage, fuel, transmission, body type, condition, engine, engine cc, drivetrain, import status, colour, location and dealer filters; allow-listed sorting, URL filters, clear filters, loading/error/empty states and pagination. Private-seller, LHD/RHD, verified-only and relevance ranking are not implemented and are not presented as filters. |
| Listing details and gallery | EXISTING AND WORKING | Specs, user disclosures, image gallery, report, save, share, enquiry, comparison and inspection-request enquiry capture. Videos, VIN/history service, actual inspection booking and independent verification are not connected. |
| Photo management | EXISTING AND WORKING (LOCAL) | Up to six browser-resized JPEG photos are stored in SQLite; MIME signatures checked; active approved listing media public, pending media owner/admin only; dealer-owned deletion. No malware scanning, server-side decode/re-encode, cloud object storage or lifecycle/backup pipeline. |
| Buyer workspace | EXISTING AND WORKING | Saved cars/searches, recently viewed, profile/password settings, enquiry threads and in-app notifications. Saved search email/push alerts, email verification, recovery and account deletion are absent. |
| Dealer workspace | EXISTING AND WORKING | Profile edit/review, listing create/edit/review, pause/resume/sold/archive/restore, inquiries, per-listing views/favourites/enquiries. No separate private-seller onboarding; profile approval is not identity verification. |
| Admin workspace | EXISTING AND WORKING (BASIC) | Dealer/listing approval and rejection, reports, account suspension/reactivation, counts and audit events. No MFA, document verification workflow, moderation queue tooling depth or production operator controls. |
| Pricing context | EXISTING BUT INCOMPLETE | Non-demo estimate uses median/range of at least five active approved same make/model listings within two model years. Asking prices are not transaction prices; insufficient data is stated; no external valuation feed or historical trend. |
| Ghana import estimate | EXISTING BUT INCOMPLETE | Saved illustrative estimate only, explicitly not an official duty/carrier quote. No current GRA duty calculation or shipping provider integration. |
| Payments, subscriptions, dealer billing | MISSING | Schema records exist but no payment provider, checkout, webhook or reconciliation flow. |
| Verified inventory/dealer documents | MISSING | Admin profile approval changes marketplace profile state; no identity, document, history or mechanical check is performed. |
| Messages and alerts | EXISTING BUT INCOMPLETE | Threaded in-app replies/notifications work; no live chat, email, WhatsApp or push delivery. |
| SEO/discovery | EXISTING BUT INCOMPLETE | Static React shell and client-side routes; no server-rendered vehicle content, structured data, canonical strategy, sitemap or robots policy verified. |
| Security and performance | EXISTING BUT INCOMPLETE | Parameterized SQL, allow-listed sort, role/ownership checks, CSRF/origin checks, password hashing, opaque sessions and static security headers. No independent penetration test, shared rate limit, image scan/re-encode, performance budget, observability or tested production backups. |

## Competitor comparison matrix

Legend: **✓** means the linked official public source documents the capability; **~** means a narrower or market-specific version is documented; **?** means not confirmed from the sources reviewed, not proof the feature is absent. “Our status” describes this codebase, not an equivalence claim.

| Feature | Auto Trader | CarGurus | Cars.com | AutoScout24 | mobile.de | Carvana | PakWheels | Our status | Recommended improvement | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Detailed vehicle search | ✓ | ✓ | ✓ | ? | ✓ | ? | ? | ✓ Ghana-focused combined filters; no private seller/LHD/RHD/relevance | Add validated Ghana inventory attributes and relevance ranking before exposing controls | P1 |
| Saved searches and alerts | ✓ email alerts | ✓ alerts | ? | ? | ✓ car park/search tools | ? | ? | ~ saved searches run manually; no delivery | Add opt-in email alerts after email provider and preferences | P1 |
| Price guidance | ✓ market flags/check guidance | ✓ deal ratings and IMV | ? | ? | ? | ? | ? | ~ local asking-price sample only | Increase data quality; disclose sample size/date and benchmark source | P1 |
| Vehicle comparison | ? | ? | ✓ research/compare | ? | ? | ? | ? | ✓ local comparison | Add parity for equipment and ownership data when available | P2 |
| Vehicle checks/history | ✓ checks | ? | ? | ? | ? | ? | ? | Missing | Integrate a Ghana-appropriate licensed history provider or clearly manual checks | P1 |
| Dealer/vehicle verification | ? | ? | ? | ? | ? | ? | ✓ PakWheels Certified | Missing; basic dealer profile approval only | Design evidence-backed review, expiry and appeal workflow before using “verified” claims | P1 |
| Inspection service | ? | ? | ? | ? | ? | ? | ✓ inspection product listings | ~ request is an enquiry only | Partner with inspection providers; do not label a request as booking | P1 |
| Rich vehicle media | ? | ? | ? | ? | ? | ✓ 360/media in owned inventory flow | ? | ~ up to six image photos; no video/360 | Add managed object storage, media processing and optional video only after operations exist | P2 |
| Delivery/returns | ? | ? | ? | ? | ? | ✓ US-specific delivery and 7-day return policy | ? | Missing | Market-specific logistics and consumer policy; do not transplant Carvana terms | P2 |
| Dealer tools | ? | ? | ? | ? | ✓ seller marketplace tools | ? | ? | ~ listing/review/basic analytics | Add actionable funnel metrics and dealer public pages | P2 |
| Multi-site discovery | ? | ? | ? | ? | ? | ? | ? | Missing | Consider partner inventory feeds only with permission and clear attribution | P3 |

Sources: Auto Trader [saved search alerts](https://help.autotrader.co.uk/hc/en-gb/articles/9812082463005-How-do-I-save-searches-on-Autotrader), [vehicle checks and pricing advice](https://www.autotrader.co.uk/content/advice/finding-the-right-car); CarGurus [how its search, deal ratings and IMV work](https://www.cargurus.com/about/how-cargurus-works); Cars.com [advanced search](https://www.cars.com/shopping/advanced-search/) and [research/compare](https://www.cars.com/research/); AutoScout24 [search FAQ](https://www.autoscout24.fr/informer/conseils/avant-l-achat/search-faq/); mobile.de [detailed search](https://www.mobile.de/magazin/artikel/suchtipps-die-mobile-de-detailsuche-29286) and [searching/buying](https://www.mobile.de/magazin/artikel/suchen-und-kaufen-41618); Carvana [inventory locations](https://www.carvana.com/help/carvana-inventory/where-are-carvana-cars-located) and [return policy](https://www.carvana.com/help/purchasing-a-car/what-is-carvanas-return-policy); PakWheels [certified programme](https://www.pakwheels.com/used-cars/pakwheels-certified/); CarDekho [comparison](https://www.cardekho.com/compare-cars) and [used-car valuation](https://www.cardekho.com/used-car-valuation.htm); Carsales [price indicators](https://help.carsales.com.au/hc/en-gb/articles/360015482932-carsales-Price-Indicators-FAQs) and [saved searches](https://help.carsales.com.au/hc/en-gb/articles/210254213-How-do-I-save-a-search); AutoTempest [multi-site search explanation](https://www.autotempest.com/how-autotempest-works). A “?” means this audit did not verify that function in an official public page.

The brief also names three regional/platform comparators outside its requested seven-column matrix:

| Platform | Publicly documented capability reviewed | Relevance to Motor Market |
| --- | --- | --- |
| CarDekho | Car comparison and used vehicle valuation tools, on its relevant markets | Supports the recommendation to make comparison and price context distinct buyer journeys; not a Ghana valuation source. |
| Carsales | Price indicators and saved searches | Good model for dated price context and user-controlled search alerts; current app has no alert delivery. |
| AutoTempest | Search across multiple vehicle listing sites | Useful future inventory-feed pattern; any aggregation requires partner permission and attribution. |

## Ghana-specific service boundaries

The [Ghana Revenue Authority ICUMS page](https://gra.gov.gh/customs/icums/) and [DVLA vehicle services](https://dvla.gov.gh/services) are the appropriate official starting points for a Ghana import/registration journey. Motor Market currently does not call either system, calculate official import duty, or register a vehicle. The displayed shipping estimate is a planning sample and must never be presented as a quote.

## Security, performance and technical debt

- Database queries use SQLite parameters; sort SQL is selected from an allow-list. Public vehicle DTOs omit VIN, internal dealer IDs and archive timestamps.
- Passwords use Node scrypt with random salts. Session tokens are random and stored hashed; cookies are HttpOnly and SameSite Strict, Secure in production. Writes enforce CSRF/origin checks. Dealer, buyer and admin routes have role and ownership checks.
- Image uploads enforce allowed image MIME, matching file signatures, six-image count, per-image 500 KB, gallery 2.5 MB limits and a request-size cap. These controls do not replace file decoding/re-encoding, malware scanning or isolated cloud storage.
- SQLite `DatabaseSync` is synchronous. It suits the local prototype and modest workload; sustained concurrent production traffic should use a managed database and measured load tests.
- Demo content and some stand-in image sources are illustrative. Image credits still need final commercial-use review. No analytics, crash reporting, external mail, customs, shipping, payment or identity provider is configured.
- Historical quick visual scan in `ROADMAP.md` flagged layout/contrast/heading issues at desktop and mobile sizes. It was not a full accessibility or current visual acceptance pass; run a real browser review before launch.

## Checks run for this audit

- `node --check server.mjs` — passed.
- `pnpm build` — passed (Vite production build).
- `pnpm test` — passed: one end-to-end API journey covering buyer/dealer/admin flows, combined filters and pagination, session and authorization boundaries, and dealer image upload visibility/deletion rules.
- A local test run without permission for loopback HTTP could not reach its spawned server; the same suite passed when run with local-server access.

## Prioritized next work

1. P0: independent security review, backup/restore drills, shared abuse limits, admin MFA and account recovery before public launch.
2. P1: Ghana dealer/vehicle evidence review, genuine verification distinctions, compliant email delivery, alert preferences, and licensed vehicle-history/inspection providers.
3. P1: authoritative import cost flow using GRA-approved sources and a real logistics quote provider, with effective dates and source links.
4. P1: crawlable SEO pages, accessibility and real device/browser acceptance, image credits and performance budgets.
5. P2: external payment/subscription flow only after provider, market/legal requirements and reconciliation are selected.
6. P2: durable object storage and image processing; database migration once expected concurrency/load is established.
7. P3: private-seller onboarding, verified-only discovery, LHD/RHD, video/360 and multi-site inventory feeds where local demand and rights justify them.
