# Remaining work and launch checklist

## Prototype scope

The application currently supports a Ghana/GHS marketplace prototype with combined search and pagination, listing details/gallery/compare, buyer accounts and saved activity, dealer listing/photo management, basic admin moderation, in-app conversations and illustrative shipping estimates. Automated API journey and production bundle checks pass. See `MARKETPLACE-AUDIT.md` for the feature matrix and exact evidence.

## Required before a commercial launch

1. Select the launch operator, jurisdictions, support channels, retention policy and final privacy/consumer terms.
2. Add email verification, recovery, account deletion, notification preferences, admin MFA and shared rate limits.
3. Create evidence-based dealer, vehicle-document, history and mechanical inspection workflows; include rejection reasons and re-submission. Do not call profile approval identity verification.
4. Select and integrate email, optional WhatsApp, licensed vehicle history/inspection partners, object storage and image processing. Current gallery is local SQLite and needs scanning, backups and restore drills.
5. Integrate authoritative Ghana import-cost data and carrier quotes. Link source, effective date and assumptions; current shipping estimate is illustrative.
6. Complete payments/subscriptions only after selecting a provider, market and reconciliation process. No payment flow currently exists.
7. Add crawlable vehicle pages, canonical/robots/sitemap and structured data, then check image licenses/attribution.
8. Add logs, alerts, monitoring, retention jobs, production backups and a rehearsed incident response path.
9. Run independent security, legal, accessibility, performance and deployment reviews; verify desktop and mobile in a real browser.

## Visual follow-up

A historical quick browser consistency scan at 1440px and 390px reported layout, contrast and heading hierarchy findings. It was a limited scan, not a full accessibility or acceptance test, and must be repeated on the current build. Remote sample photos may not load on restricted networks.

## Deployment checklist

- [ ] Configure secure admin credentials, production origin and TLS/proxy settings.
- [ ] Use persistent protected storage; configure and restore-test backups.
- [ ] Configure external mail, media, logistics, history and payment services only when selected and tested.
- [ ] Replace demo inventory with authorized real listings and finalize image credits.
- [ ] Publish reviewed terms, privacy, support and contact information.
- [ ] Complete security, accessibility, load and legal reviews.
- [ ] Run `pnpm test` and `pnpm build` against release configuration.
- [ ] Confirm no sample listing, profile approval or estimate appears as a verified vehicle, identity check, official duty amount or live quote.
