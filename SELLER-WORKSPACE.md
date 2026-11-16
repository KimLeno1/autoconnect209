> Current model: sellers pay Auto Connect to publish listings. Buyers arrange physical purchases and payment directly with sellers. Buyer checkout, carts and payment methods, and seller wallets/payouts are removed. Earlier descriptions of those features below are historical. See [BUSINESS-MODEL.md](BUSINESS-MODEL.md) for the current fee-only implementation and pending owner configuration.

# Seller workspace

Open `/dealer/dashboard` with a private-seller or dealership account. The Apple-inspired seller console uses the same system typography, blue/black palette, focus management, responsive navigation and accessibility preferences as administration.

## Working local features

- Overview with real listing, enquiry, view, saved-vehicle, draft and order-record counts. Date-filtered activity, low-stock alerts, open cases, setup checklist and separate verification states.
- Individual/business setup records saved for later. Onboarding updates the seller's private contact/profile details and returns a changed business name to marketplace review.
- Existing seven-step vehicle editor, photos, draft autosave/resume, review submission, listing availability and archive/restore. Added private-draft duplication and validated JSON import of up to 50 vehicle drafts.
- Stock/SKU/variant records linked only to the seller's own vehicles. Zero linked stock pauses an active listing.
- Store drafts, logo/cover URLs, opening hours, pickup areas and delivery/return/cancellation/warranty policies. Explicit publication makes allowed store fields available on the approved public seller page. Vacation mode pauses new enquiries while preserving existing conversations.
- Seller-managed order records with validated acceptance, packing, shipping/pickup, partial fulfillment, delivery and exception states, tracking references, notes, filters, selection, archive/restore, record history and exports.
- Returns/dispute records with reasons, requested amounts, response deadlines, tracking, evidence descriptions, decisions and escalation. These do not execute financial refunds or send evidence to payment networks.
- Existing buyer enquiry threads, replies, mark-as-read, reusable saved replies and abuse reports. Blocking prevents that buyer from sending further enquiries/replies to the seller.
- Promotion, discount, eligibility, bundle, scheduling and planned-budget records. Campaigns do not spend money or alter checkout prices.
- Performance reports use actual marketplace views/enquiries/saves/sold-listing data. Recorded order value is distinct from paid revenue. No conversion, balance, payout or revenue figures are fabricated.
- Seller-only sessions, revocation of other sessions, notification preferences and staff-invitation drafts. Staff definitions do not grant delegated access or send invitations.
- Seller support/appeal requests appear in the administrator's support queue. Customer messages and public support replies are separated from administrator-only internal notes. Case status and explicit public replies are visible to the seller.
- Tenant-scoped APIs, CSRF checks, financial/identity-field allowlists, owner checks for referenced listings/orders, version history and audit events.

## Hosted identity integration

The server includes a Stripe Identity adapter, using the provider's hosted verification URL, a document check, a matching-selfie requirement and live-capture requirement. It requests only an internal seller reference and selected document type; the provider handles capture. No ID image, selfie, ID number, tax ID or bank-account form is added to this application.

Set `STRIPE_IDENTITY_SECRET_KEY` and `STRIPE_IDENTITY_WEBHOOK_SECRET` in server environment variables. Configure the webhook at `/api/seller/identity/webhook`. The adapter verifies the raw-body signature, timestamp and duplicate event ID, applies ordered status updates, and stores only provider references, mode, outcome and correction reason.

Test-mode outcomes never satisfy production publishing. Production always requires a live verified seller identity, as well as existing profile/listing approval. In a local development environment, `REQUIRE_SELLER_IDENTITY=true` enables the identity gate; it is off by default so the existing prototype can be exercised without provider credentials. The public listing query, details/media, publication approval and seller resume paths apply the gate.

Changing the seller's legal name resets an existing verification and detaches the old provider session, so an old webhook cannot verify changed details. Reverification and accessible-alternative requests can also be sent through the appeal queue.

Activate and validate provider coverage, capture/accessibility behavior, liveness/anti-spoof assurances, document types, privacy notices, retention/redaction policy, manual-review permissions and webhook delivery before going live. No live provider session was created during implementation; automated checks use a mock provider. Test mode does not verify real identities.

Primary references: [Create a VerificationSession](https://docs.stripe.com/api/identity/verification_sessions/create), [Verification Sessions API](https://docs.stripe.com/identity/verification-sessions), [Selfie checks](https://docs.stripe.com/identity/verification-checks?type=selfie), [Webhook handling](https://docs.stripe.com/events/manage-webhook-endpoints).

## Still requires implementation or service activation

- Email/phone OTP delivery and verified signup; a reviewed, versioned live seller agreement and its acceptance flow.
- Business-document, tax, license, beneficial-ownership and representative verification through a secure KYB provider. Local business records/review requests do not establish verified business status.
- Checkout, trusted order/payment ingestion, payout-account onboarding, real balances/ledger, fees/refunds/adjustments, payouts, holds and step-up verification for payout changes. Wallet controls remain unavailable until connected.
- Shipping-label/invoice generation, courier synchronization, automated tracking and return fulfillment.
- Message/evidence attachment storage and scanning; do not use support messages for sensitive documents.
- Advertising delivery, applied checkout promotions, followers, reviews, conversion/repeat-customer and shipment performance instrumentation.
- MFA, device/IP/login history, automated security alerts, delegated seller-staff authentication and secure recovery delivery.
- Automated scheduling, evidence delivery and external dispute/refund execution. Saved records alone do not run these services.

## Checks

`pnpm test` includes tenant isolation, CSRF, reference ownership, field validation, order transitions, archive/restore, support bridging, store publication, secure identity handoff parameters, signed webhook verification/replay handling, rejection of forged identity/payment state, production/test separation and draft import.

The existing buyer/seller/admin browser journeys remain in `pnpm test:e2e`. They cover registration, the listing wizard, photos, draft resume, approval, buyer messaging and moderation.
