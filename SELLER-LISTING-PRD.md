# Product Requirements Document: Seller Profiles and Vehicle Listings

**Product:** Motor Market  
**Document status:** Draft for implementation  
**Market:** Ghana first; extensible to additional countries  
**Primary platform:** Responsive web  
**Current stack:** React, Tailwind CSS, Node.js API, SQLite

## 1. Summary

Motor Market needs a trustworthy, usable way for private sellers and dealerships to create seller profiles, publish vehicle listings for review, and manage each vehicle through its lifecycle. Buyers must be able to discover approved listings, understand what is seller-provided versus independently checked, view the public seller profile, and send an enquiry.

The seller experience will use a guided listing wizard with server-backed drafts, clear validation, a buyer-facing preview, and an explicit submission step. Listings remain hidden until admin approval. Seller dashboards show only recorded activity and current database state.

## 2. Problem and opportunity

The current marketplace supports dealer accounts, a basic vehicle form, local image storage, admin approval, and buyer enquiries. Sellers still lack private-seller onboarding, a resumable multi-step listing process, a complete and editable public profile, flexible condition and feature details, and a clear path from draft to sale.

Improving this workflow should make listing information more complete, reduce submission errors, give buyers a clearer basis for enquiries, and give administrators enough structured information to review listings consistently.

## 3. Goals

- Let private sellers and registered dealerships create the appropriate seller profile.
- Let a seller create, save, resume, preview, submit, edit, pause, archive, and mark owned listings as sold.
- Require at least one valid vehicle image before submitting a new listing for review.
- Keep seller contact details private unless the seller explicitly enables public display.
- Keep all submitted listings pending until an administrator approves them.
- Show approved listings in the existing browse, detail, save, compare, and enquiry journeys.
- Base dashboard figures on recorded views, favourites, enquiries, messages, and listing statuses.
- Make the workflow accessible, responsive, and understandable to first-time sellers.

## 4. Non-goals for this release

- Payment, escrow, reservations, subscriptions, or paid featured placement.
- Automated email, WhatsApp, SMS, or push delivery.
- AI-generated descriptions. A local description helper may only assemble text from information the seller entered.
- Independent vehicle-history checks, inspections, identity verification, or mechanical certification.
- Public star ratings or reviews until verified review collection and moderation exist.
- Live shipping, customs, financing, or price-valuation services.
- Video uploads, 360-degree galleries, team seats, bulk inventory import, and listing analytics charts.
- International tax or country-specific compliance beyond the Ghana-focused initial flow.

## 5. Users and permissions

### Private seller

Creates one seller profile and manages their own listings. Their exact residential address, registration details, VIN, and private contact information are never exposed through public APIs. They may opt into displaying a phone number or WhatsApp number.

### Dealership seller

Creates a dealership profile and manages dealership listings. Business contact details may be made public by the seller. Dealership profile review must not be described as identity verification.

### Buyer

Browses approved vehicles, views public seller profiles, saves and compares listings, and sends a vehicle-specific enquiry.

### Marketplace administrator

Reviews seller profiles and listing submissions, approves or rejects them with a reason, and reviews reports. Admin actions are permission-checked by the server and recorded in the audit log.

## 6. Key user journeys

### 6.1 Seller onboarding

1. Seller selects **Private seller** or **Registered dealership**.
2. Seller creates an account and provides the required profile fields for that type.
3. The system creates a pending seller profile and opens the seller workspace.
4. The seller can complete or update profile information while profile review is pending.
5. Public profile information remains hidden until the profile is approved.

### 6.2 Create and submit a listing

1. Seller starts a vehicle listing.
2. Seller completes the wizard sections: vehicle, specifications, price, condition and history, features, media and location, and preview.
3. The system saves draft changes to the seller’s account and indicates the most recent save state.
4. Seller can leave and resume the draft on another visit.
5. Seller previews the buyer-facing listing and corrects any section.
6. Seller submits the listing. The system validates required fields and at least one valid photo.
7. Listing becomes **Pending review** and is not visible in public browse results.
8. Admin approves or rejects the listing. Rejection includes a reason visible to its owner.
9. Approved listings become visible in search and the seller’s public profile.

### 6.3 Manage a listing

- Seller can edit an owned listing. Changes to price, identity, mileage, condition, ownership, or public contact details return the listing to review before the changed version is public.
- Seller can pause an active listing, resume a paused listing where policy allows, mark an active or paused listing sold, or archive it.
- A sold listing is removed from active search and cannot be represented as currently available.
- Restoring an archived listing sends it back to review.

### 6.4 Buyer contacts seller

1. Buyer opens an approved listing and sees its specifications, seller-provided condition disclosures, public seller details, and trust-state language.
2. Buyer sends an enquiry through the marketplace.
3. Enquiry and replies are stored in the existing conversation system and associated with the listing, buyer, and seller.
4. Seller sees the enquiry and unread state in the dashboard. The buyer can view replies in their account.

## 7. Functional requirements

### 7.1 Seller profiles

**Required for all sellers:** seller type, display name, account email, contact email, phone or other chosen contact method, region, city, preferred contact method, and profile creation date.

**Optional:** WhatsApp number, profile image, dealership logo, description, business address, website, social links, opening hours, years in business, and dealership registration details.

**Privacy and trust rules:**

- Exact address, VIN/chassis number, registration documents, and private phone details are private by default.
- Only explicitly approved public fields are returned by the public seller API.
- “Verified” and star-rating UI must not appear until a real evidence-backed verification or review process exists.
- An approved marketplace profile may be described as “Profile approved,” with a nearby explanation that this is not identity, vehicle, or mechanical verification.
- Public profiles show active vehicles, sold vehicles only when the database has a recorded sold state, member-since date, approved contact methods, and the seller’s approved listings.
- A seller can report another seller; reports enter the administrator review queue.

### 7.2 Listing wizard

The wizard shows the current step, total progress, saved state, back/continue controls, and a final preview. It supports keyboard use and narrow screens. Validation errors appear beside the relevant fields and do not discard entered data.

| Step | Fields and behavior |
| --- | --- |
| Vehicle | Body type, make, model, year, trim, generation, exterior/interior colour, condition, mileage, unit, and private VIN/chassis number. Make/model may be searchable; unsupported values remain enterable. |
| Specifications | Fuel, transmission, drivetrain, engine capacity, cylinders, power, doors, seats, steering position, fuel economy, electric battery capacity/range, previous owners, registration year, and registration status. Hide petrol-engine fields for electric vehicles. |
| Price | Asking price, supported currency, negotiability, pricing type, trade-in availability, financing availability, fees, tax/duty inclusion, customs clearance, and live formatted price. No generated valuation or invented offer. |
| Condition and history | Accident history, repairs, mechanical/electrical issues, service history and records, repainting, warning lights, AC, tyres, roadworthiness, ownership disputes, documentation, and optional narrative. Questions support Yes, No, and Unknown where applicable. |
| Features | Searchable grouped features with custom additions. Categories include comfort, technology, safety, and exterior. |
| Media and location | Multiple image upload, preview, remove, reorder, select cover image, photo category, city/region/country, inspection availability, test-drive availability, availability, delivery, and import/shipping facts where relevant. |
| Preview | Editable title, description, media, price, specifications, disclosures, location, seller profile, and contact methods. Save draft, edit a previous step, or submit for approval. |

### 7.3 Media

- Accept JPEG, PNG, and WebP images within configured per-file and total upload limits.
- Validate ownership, content signatures, file count, and size on the server.
- Resize large images in the browser and retain a usable preview.
- Require one valid image for submission; recommend a front, rear, side, cabin, dashboard, engine, and odometer set.
- The cover image is the first ordered image. Ordering must be keyboard-operable as well as pointer-operable.
- Draft images remain accessible only to the owner and administrators until approval.
- Do not accept video until a secure storage and processing path exists.

### 7.4 Dashboard

Show database-backed counts for active, pending, draft, rejected, paused, sold, and archived listings; recorded views; favourites; enquiries; and unread messages when a reliable unread state is available. Never render placeholder activity as real analytics.

Provide vehicle search, status filtering, sorting, pagination, and actions allowed by each listing’s current status. Include profile review state and an explanation of what profile approval does and does not mean. Charts are out of scope until the underlying event data and useful reporting intervals are defined.

### 7.5 Admin moderation

- Show pending seller profiles, vehicle listings, and seller/vehicle reports.
- Allow approve or reject actions with a recorded actor, time, and reason.
- Enforce review status transitions on the API. A browser request cannot set a listing active.
- Notify the owner in the application when their profile or listing changes state.
- Preserve rejected listing data so the owner can make corrections and resubmit.

## 8. Listing lifecycle and state transitions

| Current state | Allowed seller action | Result |
| --- | --- | --- |
| Draft | Edit, save, submit | Draft or Pending review |
| Pending review | Edit draft, withdraw/archive | Draft or Archived |
| Active | Edit, pause, mark sold, archive | Pending review, Paused, Sold, or Archived |
| Rejected | Edit, resubmit, archive | Pending review or Archived |
| Paused | Resume, edit, mark sold, archive | Active, Pending review, Sold, or Archived |
| Sold | Archive | Archived |
| Archived | Restore | Pending review |

Only administrators can transition Pending review to Active or Rejected. Edits to published material must not mutate the visible approved version before moderation completes. If the current implementation cannot keep an approved snapshot while edits are pending, the listing must be hidden until reapproval.

## 9. Data and API requirements

Reuse existing users, seller/dealer profiles, vehicles, vehicle media, views, favourites, enquiries, conversations, messages, notifications, reports, verification requests, and audit logs. Add migrations rather than destructive schema rewrites.

Data additions may include seller type and public-contact preferences; structured vehicle attributes and disclosures; listing drafts; photo category/order/cover information; seller report ownership; moderation reasons; and status history. Store VIN and sensitive seller data in protected columns or private records, never in the public listing JSON.

All seller CRUD APIs must check the authenticated user, CSRF protections, valid status transition, and ownership in the SQL query. Admin exceptions must be explicit and permission-checked. All displayed analytics must derive from persisted records.

## 10. UX, accessibility, and content

- Use the existing Motor Market visual system: near-black surfaces, warm neutral text, and one red accent.
- Keep the seller workspace legible and calm, with strong grouping, short labels, clear progress, and a persistent but unobtrusive save state.
- Use visible labels, inline validation, keyboard focus, semantic headings, descriptive image alternatives, and status text that does not rely on colour alone.
- Controls should be comfortably operable on touch screens, and the page must not overflow horizontally at phone widths.
- Use plain, factual language. Avoid “verified,” “accident-free,” “best price,” or “mechanically sound” unless there is evidence supporting the claim.
- Respect reduced-motion preferences. Motion is limited to interaction feedback and step changes.

## 11. Success metrics

Instrument these events only after persistence and consent/retention rules are defined:

- Seller registration completion rate by seller type.
- Draft start-to-submit completion rate and median time to submit.
- Wizard abandonment by step.
- Photo validation failure rate.
- Submission rejection rate and common rejection reasons.
- Approved listing-to-first-enquiry time.
- Enquiry response time and unread enquiry count.
- Share of published listings with complete specs and condition disclosures.

Targets should be set after a baseline is collected; this PRD does not invent numerical targets or activity counts.

## 12. Acceptance criteria

1. A user can register as a private seller or a dealership and receives the corresponding profile form.
2. Seller profile data persists after refresh; public phone and WhatsApp remain hidden unless separately enabled.
3. A seller can start an incomplete listing, see its saved state, leave the page, return, and resume its stored draft.
4. A seller can complete the wizard, and EV selections do not require combustion-engine fields.
5. Price and mileage validation rejects invalid values and displays the selected currency and mileage unit consistently.
6. Submitting without the required fields or one valid image is blocked in both the interface and API.
7. Draft listings and draft media are not returned by public search or public vehicle detail routes.
8. A valid submission creates a pending record and appears in the admin review queue, not public search.
9. Approval publishes the listing in browse/search/detail/compare/save flows and links the approved public seller profile.
10. Rejection includes a seller-visible reason and permits a corrected resubmission.
11. A seller cannot read or change another seller’s draft, media, listing, enquiry, or profile by changing an identifier.
12. A seller can pause, resume, archive, restore, and mark a listing sold only through allowed transitions; sold inventory is excluded from active search.
13. Buyer enquiries and replies persist, appear to the correct buyer and seller, and update unread state and notifications.
14. View, favourite, enquiry, and message counts match persisted database records.
15. Public responses never contain VIN, private address, unapproved profile data, passwords, or session tokens.
16. Playwright covers private seller and dealership onboarding, profile privacy, draft save/resume, photos, validation, moderation, buyer discovery, enquiry/reply, lifecycle actions, access controls, persistence, and responsive layouts.

## 13. Test plan

Use an isolated temporary SQLite database and synthetic `example.test` accounts. Keep the headed browser visible during the full journey when requested. Add API integration checks for server-side validation, ownership, role checks, and status transitions. Add Playwright journeys for private seller and dealer paths, draft persistence after refresh, photo upload and rejection, approval and buyer discovery, enquiry replies, sold-state exclusion, and 390/768/1440 px layouts. Verify that invalid or unauthorized calls fail without changing the database.

## 14. Delivery sequence

1. **Foundation:** additive migrations, seller type, private data boundaries, API validation, and ownership checks.
2. **Seller onboarding/profile:** profile creation, editing, contact permissions, approval state, and public seller page.
3. **Listing wizard:** structured fields, server-backed draft save/resume, validation, photo gallery, preview, and submission.
4. **Seller dashboard:** actual counts, listing filters/actions, enquiry inbox, and lifecycle support.
5. **Buyer/admin integration:** seller profile links, approved-listing discovery, moderation reasons, notifications, and seller reports.
6. **Verification:** run API tests, headed Playwright journeys, build, accessibility checks, and responsive review; fix failures before release.

## 15. Dependencies and risks

- Email/WhatsApp notifications require provider selection, credentials, consent, and delivery monitoring.
- Profile images, logos, and video need secure storage, processing, limits, and content moderation before activation.
- Dealer registration verification needs an evidence policy, secure document storage, retention, reviewer access rules, and appeal handling.
- Reviews need a verified transaction or other review eligibility rule and a moderation process.
- International expansion requires country-specific currency, registration, privacy, tax, and import rules.
- SQLite is suitable for a local prototype; production multi-instance deployment will need a managed database and media storage strategy.

## 16. Current project baseline

The current app provides a Node.js/SQLite API, private-seller and dealership signup, seller profile settings and contact privacy controls, public seller pages and seller reports, a seven-step listing wizard, server-persisted resumable drafts, local listing photos, listing moderation and lifecycle actions, buyer browsing, saved vehicles, comparisons, in-app enquiries and a seller inbox/dashboard. The implementation uses the existing `dealer` account role with a `seller_type` profile value for private seller vs dealership. Remaining prototype gaps include status-change audit history, profile/logo uploads, video, deeper image editing and category persistence, no-price listings, external notifications, verified identity/vehicle checks, and production-grade cloud media and operations.
