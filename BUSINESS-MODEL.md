# Auto Connect business model

Auto Connect is a paid advertising/listing service. Sellers pay Auto Connect to publish a listing. Buyers contact sellers and arrange the physical purchase and payment directly. Auto Connect does not collect vehicle purchase payments, hold customer funds, provide a buyer cart/checkout, or pay seller proceeds.

## Publishing
Preparing a draft is free. Submit a listing, pay its publication fee through a hosted payment page, and obtain marketplace approval. Public browsing, listing details and listing photographs enforce payment as well as the existing seller/profile and identity requirements. Demo inventory remains explicitly illustrative. Duplicate listings have separate IDs and need separate fees. Resuming the same paid listing does not charge again.

The initial implementation is a one-time fee per listing. No subscription, renewal period, expiry, commission or automatic recurring charge is introduced. Approved GHS asking-price bands: up to 100,000 costs GHS 60; above 100,000 to 500,000 costs GHS 80; above 500,000 to 1,000,000 costs GHS 100; above 1,000,000 costs GHS 200. Boundaries use pesewas, so fractional prices have no gaps. Fees for non-GHS asking prices are undefined and checkout is blocked instead of inventing an exchange rate. The owner still needs to choose the payment service and receiving account; collection remains disabled.

## Payment integration
An optional Paystack hosted-checkout adapter is prepared. It is inactive unless `LISTING_PAYMENT_PROVIDER=paystack`, a secret key are configured on the server. Fees are calculated from the server-stored asking price, never from a browser-supplied fee. Never place real keys in source control or chat.

The server derives the amount, currency, listing and seller. Client-supplied prices and paid flags are ignored. Signed payment notifications and server-side provider verification confirm the exact reference, amount, currency and success state before a publication entitlement is granted. A browser redirect is not payment proof. Production requires a live provider payment; test payments cannot publish production listings. Unknown listings, other sellers' payments and buyer checkout attempts are rejected.

- Webhook: `/api/listing-billing/webhook`
- Seller screen: `/dealer/dashboard?seller=billing`
- Admin screen: `/admin?section=billing`

The admin ledger is read-only. Generic legacy buyer/subscription billing routes are disabled. Live advertising revenue is derived only from verified live seller listing-fee payments. Old records are retained, not deleted or reclassified as advertising payments. A price increase that moves a listing into a higher band requires a sufficiently paid fee before publication; a cheaper old payment cannot unlock it. A pending checkout for an outdated fee is superseded when a new quote is requested. A verified payment does not transfer ownership of a vehicle or imply the vehicle is sold.

Actual collection has not been activated or exercised against a live account. Production activation still needs merchant onboarding, live webhook setup, payment return/failure checks and an advertising refund/chargeback policy. No buyer or seller was charged during development.

## Tests
Build and API/browser journeys check the new model. Mocked-provider tests cover foreign-account access, CSRF, forged client prices, amount/currency mismatch, invalid webhook signatures, idempotent pending checkout and test/live separation. Marketplace integration tests assert unpaid approval is refused, then use an isolated database fixture representing a provider-confirmed fee for the remaining listing lifecycle. Test fixtures are not exposed as application APIs.

If a previously paid listing moves to a higher fee band, publication is blocked and the seller is directed to support for a fee adjustment. A second full fee is not automatically collected. A lower-band edit keeps a sufficient existing publication payment; automatic refunds are not introduced.

## Preparing a future payment connection
The admin Seller listing fees screen includes Payment setup for non-secret provider/account/policy notes. Saving notes never connects a provider or enables charges. Credentials belong in secure server configuration. The screen documents signed provider notifications, exact server-side transaction verification, retry/duplicate handling and the remaining provider-specific launch checks.

Sellers can request a review of a confirmed advertising-fee payment. A unique payment reference prevents duplicate refund requests. Administrators with billing permissions can mark a request reviewed; this does not refund money or change the paid record. Actual refund execution, confirmation, reversal of publication entitlement, failed refunds and chargeback processing must be integrated and tested when a provider is selected. No generic UI control can mark a payment refunded or bypass provider verification.
