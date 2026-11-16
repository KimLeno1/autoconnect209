# Auto Connect marketplace prototype

A Ghana-first automotive marketplace prototype with responsive vehicle discovery, combined search, buyer and dealer accounts, local listing photo galleries, private admin review, comparisons, in-app enquiries and an illustrative shipping estimate.

The client uses React 19, Vite 8 and Tailwind CSS 4. The API and persistence layer use Node.js and SQLite via Node's built-in `node:sqlite` driver. No external runtime database service is required for local use.

## Run locally

Requires Node.js 22.12+ and pnpm.

1. Run `pnpm install`.
2. Copy `.env.example` to `.env`; configure a unique admin email and password if you need `/admin`.
3. Run `pnpm dev` and open `http://127.0.0.1:5173`.

Vite proxies `/api` to the Node server on port 4173. Local records are stored in `data/apex.sqlite`. For the production bundle run `pnpm build`, set `NODE_ENV=production` and the exact `PUBLIC_ORIGIN`, then run `pnpm start`. Keep `.env` and the database out of source control. Terminate TLS at a trusted host; only set `TRUST_PROXY=true` behind a proxy that strips untrusted forwarding headers.

## Included flows

- Ghana/GHS illustrative inventory, detailed combined search, sorting, shareable filters, pagination, listing detail gallery and comparison.
- Buyer accounts, saved cars/searches, recently viewed, profiles/password changes, notifications and threaded enquiries.
- Private seller and dealership profiles, privacy-controlled public seller pages, and seller reports for admin review.
- A seven-step seller listing wizard, server-saved drafts with resume, vehicle specifications and disclosures, feature selection, up to six locally stored photos, listing preview, review submission, lifecycle controls, and a seller enquiry inbox.
- Seller dashboard with listing filters and persisted counts for active, pending, draft, sold, view, favourite, and enquiry activity.
- Basic private admin approvals, account suspension, reports and audit events.
- Sample shipping estimate with explicit assumptions.

## Prototype boundaries

Sample vehicles, prices and photos are illustrative; they are not verified offers. Photo storage is local SQLite with browser resize and basic signature validation, not cloud storage or malware scanning. There is no payment, live chat, email/WhatsApp delivery, official customs calculation, carrier quote, vehicle history provider, inspection booking, dealer identity verification, profile logo/photo upload, video gallery, email recovery, production monitoring or backup workflow. Dealer profile approval is not identity or vehicle verification. Seller types are distinguished in the profile while both use the existing seller account role.

See [MARKETPLACE-AUDIT.md](MARKETPLACE-AUDIT.md), [SECURITY-AUDIT.md](SECURITY-AUDIT.md), and [ROADMAP.md](ROADMAP.md) for tested capability and launch gaps.

## Checks

- `pnpm test` runs the isolated local API integration journey.
- `pnpm test:e2e` opens Microsoft Edge and runs headed Playwright journeys against a temporary database. The runner picks free local ports and removes its temporary database when finished; screenshots and traces are kept under `test-results/` when a test fails.
- `pnpm build` creates the production frontend bundle.

## Main files

- `server.mjs`: Node routes, session controls, SQLite queries and built-site hosting.
- `schema.sql`: local database schema and indexes.
- `src/App.jsx`: React pages, forms and marketplace interactions.
- `src/styles.css`: Tailwind entry and design system.
- `SECURITY.md`: deployment/security guidance.

## Administration

Open /admin with a server-provisioned administrator account. The operations workspace covers people, roles, listings, approvals, content, billing records, support, analytics, audit, integrations and privacy. See [ADMIN-OPERATIONS.md](ADMIN-OPERATIONS.md) for working features and external connections still required. Interface work follows [DESIGN.md](DESIGN.md).

## Seller workspace

The seller console uses the same Apple-inspired design as administration. It includes private setup, inventory/drafts, store publication, order/case records, messages, secure identity-provider handoff, performance and support. See [SELLER-WORKSPACE.md](SELLER-WORKSPACE.md) for provider setup, verification rules, tests and the services still required for live trading.

## Seller-funded advertising

The current business model is seller-paid listing publication. Buyers contact sellers and arrange physical purchases directly; there is no buyer checkout or seller payout wallet. See [BUSINESS-MODEL.md](BUSINESS-MODEL.md) for publishing fees, payment verification and configuration still required.
