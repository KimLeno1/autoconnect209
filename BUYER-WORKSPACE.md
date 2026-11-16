> Current model: sellers pay Auto Connect to publish listings. Buyers arrange physical purchases and payment directly with sellers. Buyer checkout, carts and payment methods, and seller wallets/payouts are removed. Earlier descriptions of those features below are historical. See [BUSINESS-MODEL.md](BUSINESS-MODEL.md) for the current fee-only implementation and pending owner configuration.

# Buyer workspace

The buyer workspace is available at `/account`, with Home, Orders, Saved items, Messages and Account as the five main destinations. Help is available on every screen. It shares the seller/admin blue and black system, native focus-managed dialogs, immediate button feedback and responsive navigation.

## Implemented
- Persisted profile name, contact phone and HTTPS photo URL, with field validation. Email remains read-only until verification delivery is configured.
- Private delivery addresses, edit/delete/default selection, and a three-step contact/delivery/review flow.
- Own seller-linked orders, processing/shipped/delivered/cancelled filters, detail, tracking reference, eligible cancellation, issue/report links and availability checks before buying again.
- Saved listing search, price-change baseline, availability and removal even after a listing becomes unavailable; private cart records.
- Existing listing-linked buyer/seller conversations and in-app notifications.
- Provider payment history, with no raw card or wallet capture.
- Delivered-order return requests and editable review submissions. Return cases route to the admin support queue; no refund is invented.
- Buyer support tickets and public support replies. Internal admin notes are never returned to the buyer.
- Own active sessions and session revocation; existing password change revokes other sessions.
- Locale/currency/time-zone and separate optional notification preferences, plus reviewed data export/deletion requests.
- Conditional hosted Stripe Identity reuse: an administrator creates a Privacy record for the buyer with type `verification`, status `verification_required`, and a clear reason. Buyers with no such request cannot start capture and see no permanent verification task. The app stores provider references/status rather than documents or biometrics.

## Integration work still required
Checkout, saved provider payment methods, payment receipts/refunds, courier labels/tracking feeds, email/phone verification delivery, multifactor enrollment, photo attachments, review publication/seller responses and automated notification delivery remain unavailable. UI copy identifies these limits. Preferences persist but translation/currency conversion do not run. Orders are local fulfillment records, not proof of payment. Return eligibility and deadlines are reviewed by support; no unconfigured automatic return policy is invented.

A seller can link an order only to a buyer who has contacted that seller. The buyer sees only the necessary fulfillment fields; internal seller notes are excluded. Existing unlinked order records are never matched by customer name or email. Cart items do not reserve stock or create paid orders.

## Verification
`pnpm build`, `pnpm test` and `pnpm test:e2e`. Buyer security tests cover account isolation, CSRF, single default address, internal-note privacy, order ownership, delivery eligibility, duplicate reviews and conditional identity. Browser checks cover profile save, address steps and persistence, saved-to-cart, support submission, navigation, desktop and phone layouts.
