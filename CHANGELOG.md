# AUTO CONNECT — Complete Changelog & Modifications Log

This document records all architectural, database, backend, frontend, payment simulation, search filtering, and private seller bidding/offer changes made since the original `AUTO-CONNECT-main` repository was imported.

---

## 1. Project Promotion & Build Configuration
- **Workspace Promotion**: Moved the nested `AUTO-CONNECT-main/` project contents into the workspace root (`/`) so Vite, Express, SQLite, and automated tests run directly from the root directory.
- **Metadata & SEO Sync**:
  - Updated `/metadata.json` with application name **Auto Connect** and description.
  - Synchronized `<title>`, `<meta name="description">`, `og:title`, and `og:description` in `/index.html`.
- **Package Configuration (`/package.json`)**:
  - Added runtime dependencies `better-sqlite3` and `express` alongside `@types/better-sqlite3` and `@types/express`.
  - Configured `"dev": "node server.mjs"`, `"start": "node server.mjs"`, `"server:express": "node express-server.mjs"`, and `"test": "node --test tests/*.test.mjs"`.

---

## 2. SQLite Database Migration (`better-sqlite3`) & Schema Enhancements
- **Created `/db.mjs`**:
  - Replaced the experimental `node:sqlite` (`DatabaseSync`) import with a production-ready `better-sqlite3` database connection helper (`initializeDatabase`).
  - Enabled `WAL` journal mode, `foreign_keys = ON`, and `busy_timeout = 5000`.
  - Automatically executes `/schema.sql` and runs idempotent column migrations (`ensureColumn`) on existing SQLite files.
- **Updated `/schema.sql` & `vehicles` Table Schema**:
  - Ensured `vehicles` includes core fields:
    - `make` (`TEXT NOT NULL`)
    - `model` (`TEXT NOT NULL`)
    - `year` (`INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2100)`)
    - `price` (`REAL NOT NULL DEFAULT 0 CHECK (price >= 0)`)
    - `location` (`TEXT NOT NULL DEFAULT ''`)
    - `mileage` (`INTEGER NOT NULL DEFAULT 0 CHECK (mileage >= 0)`)
  - Added private seller offer/bid configuration columns to `vehicles`:
    - `allow_offers` (`INTEGER NOT NULL DEFAULT 0 CHECK (allow_offers IN (0,1))`)
    - `offer_min_minor` (`INTEGER` — private minimum acceptable offer in minor currency units, hidden from buyers)
    - `offer_max_minor` (`INTEGER` — private maximum target offer in minor currency units, hidden from buyers)
  - Created the `vehicle_offers` table to persist buyer offers/bids:
    - Columns: `id`, `vehicle_id`, `buyer_id`, `seller_id`, `buyer_name`, `buyer_email`, `amount_minor`, `currency`, `message`, `status` (`pending`, `accepted`, `declined`, `countered`), `created_at`, `updated_at`.
    - Added indexes `idx_vehicle_offers_vehicle` and `idx_vehicle_offers_seller`.

---

## 3. Express Server & Complete Admin / Supplier Panel Backend (`/express-server.mjs` & `/server.mjs`)
- **Created `/express-server.mjs` (`createExpressApp`)**:
  - **Public Vehicle Endpoints**:
    - `GET /api/vehicles`: Fetches active vehicle listings with computed `price`, `location`, `allowOffers`, images, and supplier details, plus real-time keyword filtering via `?q=`, `?search=`, or `?keyword=`.
    - `GET /api/vehicles/:id`: Fetches a single vehicle listing with public fields only.
    - `POST /api/vehicles`: Creates a new vehicle record with optional private offer range configuration.
  - **Supplier / Dealer Panel Endpoints (`/api/supplier/*`)**:
    - `GET /api/supplier/dashboard`: Returns complete supplier profile, identity status, KPI metrics (`totalVehicles`, `activeListings`, `pendingListings`, `views`, `saves`, `enquiries`, `offers`, `pendingOffers`, `orders`, `lowStock`, `promotions`), inventory (including private offer ranges), drafts, orders, stock, promotions, enquiries, and incoming buyer offers.
    - `GET /api/supplier/profile` & `PUT /api/supplier/profile`: Reads and updates dealership/supplier profile details.
    - `GET /api/supplier/vehicles`, `POST /api/supplier/vehicles`, `PUT /api/supplier/vehicles/:id`, `PATCH /api/supplier/vehicles/:id/status`, `DELETE /api/supplier/vehicles/:id`: Full CRUD and status lifecycle for supplier vehicle inventory, including private offer ranges (`allow_offers`, `offer_min_minor`, `offer_max_minor`).
    - `GET /api/supplier/orders`, `POST /api/supplier/orders`, `PATCH /api/supplier/orders/:id/status`: Supplier order management.
    - `GET /api/supplier/stock`, `POST /api/supplier/stock`: Showroom stock and SKU tracking.
    - `GET /api/supplier/enquiries`, `POST /api/supplier/enquiries/:id/reply`: Buyer enquiry threads and replies.
    - `POST /api/supplier/identity/verify`: Instant sandbox KYC/KYB verification toggle for suppliers.
  - **Admin Panel Endpoints (`/api/admin/*`)**:
    - `GET /api/admin/summary` & `GET /api/admin/panel`: Complete Admin overview with user/dealer/vehicle/revenue counts, moderation queues (`pendingDealers`, `pendingVehicles`, `reports`), supplier directory, users, payments, and audit logs.
    - `GET /api/admin/suppliers`, `POST /api/admin/suppliers/:id/approve`, `POST /api/admin/suppliers/:id/reject`, `POST /api/admin/suppliers/:id/suspend`: Supplier onboarding and compliance moderation.
    - `POST /api/admin/vehicles/:id/approve`, `POST /api/admin/vehicles/:id/reject`: Vehicle listing moderation with audit logging and seller notifications.
    - `POST /api/admin/reports/:id/:action`: Trust & safety report resolution (`review`, `resolve`, `dismiss`).
    - `GET /api/admin/audit-logs`: Administrative audit trail inspection.
- **Seeded Ghana Marketplace Accounts & Data (`/server.mjs`)**:
  - Seeded ready-to-use accounts:
    - Admin: `admin@autoconnect.gh` / `AutoConnect-Admin-2026!`
    - Verified Supplier: `dealer@autoconnect.gh` / `AutoConnect-Dealer-2026!` (*Accra Premier Motors*)
    - Pending Supplier: `kumasi.motors@autoconnect.gh` / `AutoConnect-Kumasi-2026!` (*Kumasi Royal Auto*)
    - Buyer: `buyer@autoconnect.gh` / `AutoConnect-Buyer-2026!` (*Kwame Mensah*)
  - Seeded showroom vehicles (`dealer-land-cruiser-300`, `dealer-lexus-rx350`, `dealer-range-rover-pending`, `dealer-hilux-unpaid`), stock records, orders, promotions, enquiries, reports, and admin operations records.

---

## 4. Paystack Checkout Simulator (`/listing-billing.mjs`, `/express-server.mjs`, `/src/ListingBilling.jsx`)
- **Backend Simulation Endpoints**:
  - Updated `/listing-billing.mjs` so `POST /api/listing-billing/checkout` works out-of-the-box without requiring a live `PAYSTACK_SECRET_KEY`, generating a `paystack_sim_*` reference and returning a `simulation` descriptor (`channels: ['mobile_money', 'card', 'bank', 'ussd']`, `providers: ['MTN MoMo', 'Telecel Cash', 'AT Money']`).
  - Added `POST /api/listing-billing/paystack-simulate/:reference` in `/listing-billing.mjs` and `POST /api/paystack/simulate/initialize` + `POST /api/paystack/simulate/complete` in `/express-server.mjs` to simulate `paid`, `failed`, or `cancelled` checkout outcomes and record audit logs.
- **Interactive Frontend Modal (`/src/ListingBilling.jsx`)**:
  - Built an interactive **Paystack Checkout Simulator** modal in the Seller Workspace (`Listing fees` tab) allowing sellers to choose **Mobile Money** (`MTN MoMo`, `Telecel Cash`, `AT Money`), **Card**, or **Bank USSD**, enter test payment details, and trigger **Approve Payment (GHS 250)**, **Simulate Declined**, or **Cancel Checkout** with instant status updates.

---

## 5. Real-Time Make / Model Keyword Filtering (`/src/MarketplaceHome.jsx`, `/src/App.jsx`, `/express-server.mjs`)
- **Homepage Main Search Bar (`/src/MarketplaceHome.jsx`)**:
  - Removed the secondary duplicate filter box in `#browse` and wired real-time keyword filtering directly into the primary hero search bar (`form.mk-search` input `name="q"`).
  - Typing in the main search bar filters displayed vehicles in real time on every keystroke by `make`, `model`, `trim`, `year`, `city`/`location`, `body_type`, or `fuel`, updates the collection header count, includes a clear (`X`) button, and navigates to `/browse?q=...` when submitted.
- **Browse Collection Filter (`/src/App.jsx`)**:
  - Added controlled real-time keyword matching (`matchesMakeOrModel`) inside `Browse` and `SearchFilters` (`aria-label="Filter by make or model"`) so typing in the filter box immediately narrows the displayed vehicle cards without requiring a page reload.
- **Backend Query Support (`/express-server.mjs`)**:
  - Enhanced `GET /api/vehicles` to support `?q=`, `?search=`, and `?keyword=` case-insensitive matching against `make`, `model`, `trim`, and `make || ' ' || model`.

---

## 6. Seller Bid / Offer Toggle & Hidden Price Range System
- **Seller Listing Creation & Editing (`/src/SellerWorkspace.jsx`, `/server.mjs`, `/express-server.mjs`)**:
  - Added a **"Tick for bid — allow buyers to make an offer"** toggle (`allowOffers`) in Step 2 (*Set your asking price & private offer range*) of the Seller Listing Wizard.
  - When ticked, sellers can set a **Minimum acceptable offer** (`offerMinPrice`) and **Maximum target offer** (`offerMaxPrice`).
  - Both backend servers validate that `offerMinPrice <= offerMaxPrice` and persist `allow_offers`, `offer_min_minor`, and `offer_max_minor` in SQLite.
- **Strict Buyer Privacy Enforcement (`/server.mjs` & `/express-server.mjs`)**:
  - `carFromRow` in `/server.mjs` and `formatVehicleRow` in `/express-server.mjs` explicitly strip `offer_min_minor`, `offer_max_minor`, `offerMinPrice`, and `offerMaxPrice` from all public vehicle responses (`GET /api/listings`, `GET /api/listings/:id`, `GET /api/vehicles`, `GET /api/vehicles/:id`) and from `listingData`.
  - Public users only receive `allowOffers: true/false` (`allow_offers: 1/0`) and **never** see the seller's hidden price range in the UI or network payloads.
- **Buyer Offer Submission (`/src/App.jsx`, `/server.mjs`, `/express-server.mjs`)**:
  - Vehicle cards (`CarCard`) display an **Accepts offers** badge when `allowOffers` is enabled.
  - Vehicle detail pages (`Vehicle` in `/src/App.jsx`) display a **"Make an offer to seller"** button and open an offer modal (`Dialog` with `modal.type === 'offer'`) where buyers enter their offer amount, name, email, and optional message.
  - Submitting posts to `POST /api/listings/:id/offers` (and `POST /api/vehicles/:id/offers`), saving the offer in `vehicle_offers` and notifying the seller without revealing the seller's range.
- **Seller Offer Evaluation & Management (`/src/SellerWorkspace.jsx`, `/server.mjs`, `/express-server.mjs`)**:
  - Added a **"Buyer offers & bids"** section in the Seller Workspace (`SellerInventory`) and in `/api/dealer/dashboard` + `/api/supplier/dashboard`.
  - Displays each buyer's offer alongside an automatic comparison against the seller's hidden range (**Within your hidden range**, **Above target range**, or **Below minimum range**) and provides **Accept offer** / **Decline** buttons (`PATCH /api/dealer/offers/:id/status` and `PATCH /api/supplier/offers/:id/status`).

---

## 7. Automated Verification & Tests (`/tests/listing-billing.test.mjs`)
- Added end-to-end automated tests verifying:
  1. SQLite (`better-sqlite3`) initialization and `vehicles` table schema (`make`, `model`, `year`, `price`, `location`, `mileage`, `allow_offers`, `offer_min_minor`, `offer_max_minor`).
  2. `GET /api/vehicles` listing retrieval and real-time `?q=` make/model filtering.
  3. Complete Supplier Panel (`/api/supplier/*`) and Admin Panel (`/api/admin/*`) workflows.
  4. Paystack Checkout Simulator (`/api/paystack/simulate/initialize` & `/api/paystack/simulate/complete`).
  5. Private Seller Offer Range & Buyer Bidding privacy guarantees (verifying sellers can set a range, buyers never see the range in public endpoints or offer responses, buyers can submit offers, and sellers can view `withinRange` status and accept/decline offers).
  6. Middleman Privacy & Admin-Mediated Enquiry Workflow (verifying seller contact details and buyer emails are stripped, enquiries remain hidden from sellers until reviewed/edited/forwarded by an Admin, and buyers can only report sellers for Admin case review).

---

## 8. Strict Middleman Isolation & Admin-Mediated "Ask About This Car" Enquiry Workflow
- **Complete Removal of Direct Buyer-to-Seller Contact (`/src/App.jsx`, `/src/SellerWorkspace.jsx`, `/server.mjs`, `/express-server.mjs`)**:
  - Removed the seller contact card (`Call seller`, `WhatsApp`, `Seller profile`, and direct contact links) from the Vehicle detail view in `/src/App.jsx`.
  - Removed all `Call seller`, `WhatsApp`, `Visit website`, and `Email seller` links from `SellerPublicProfile` in `/src/SellerWorkspace.jsx` and removed public phone/WhatsApp visibility toggles from seller profile settings.
  - Stripped seller `phone`, `whatsapp`, `website`, and `email` from all public vehicle and seller profile API responses (`carFromRow` and `/api/sellers/:id` in `/server.mjs`; `formatVehicleRow` and `/api/vehicles/:id` in `/express-server.mjs`).
  - Masked buyer email addresses and replaced direct buyer names with `Verified Buyer #ID` on seller-facing offer and enquiry payloads so neither party can bypass Auto Connect.
- **Buyer Report-Only Seller Escalation (`/src/App.jsx`, `/src/SellerWorkspace.jsx`)**:
  - Replaced direct seller contact options with a dedicated **Report seller / listing** escalation path that submits directly to Auto Connect Administrators for case review (`POST /api/reports`).
- **Admin-First "Ask About This Car" Review, Edit & Forward Workflow (`/schema.sql`, `/db.mjs`, `/admin-operations.mjs`, `/server.mjs`, `/express-server.mjs`, `/src/AdminWorkspace.jsx`)**:
  - Added moderation columns to `enquiries`: `original_message`, `admin_status` (`pending_admin`, `forwarded`, `rejected`), `forwarded_to_seller` (`0` or `1`), `admin_notes`, `reviewed_by`, and `forwarded_at`.
  - Updated `POST /api/enquiries` so every new **"Ask about this car"** submission is held in `admin_status = 'pending_admin'` with `forwarded_to_seller = 0` and notifies Administrators first.
  - Updated seller enquiry endpoints (`GET /api/dealer/dashboard`, `GET /api/dealer/enquiries`, `GET /api/enquiries/:id/messages`, `GET /api/supplier/dashboard`, `GET /api/supplier/enquiries`, `POST /api/supplier/enquiries/:id/reply`) to strictly require `forwarded_to_seller = 1` before a seller can view or reply to an enquiry.
  - Added Admin moderation endpoints (`GET /api/admin/enquiries`, `POST /api/admin/enquiries/:id/forward`, `POST /api/admin/enquiries/:id/reject`, `PATCH /api/admin/enquiries/:id`, and `/api/admin/operations/enquiries/:id`) and a **Buyer enquiries** moderation queue in `/src/AdminWorkspace.jsx` where Admins review incoming enquiries, edit the message text, and click **Forward to seller** (or **Hold / reject**).

---

## 9. Interactive Animations & Custom Automotive Loading States (`/src/styles.css`, `/src/experience.css`, `/src/MarketplaceHome.jsx`, `/src/App.jsx`)
- **Custom Automotive SVG Loader (`CarLoader`) & Route Progress Bar**:
  - Created an animated sports-car silhouette loader (`CarLoader`) featuring stroke-trace animation (`acStrokeTrace`), spinning alloy wheels (`acWheelSpin`), suspension bounce (`acCarSuspension`), and sweeping road speed lines (`acRoadSweep`).
  - Added a top viewport route/data progress bar (`.ac-top-progress`) and `<Suspense>` workspace loading screens (`FullPageCarLoader`).
- **Shimmering Vehicle Skeletons (`VehicleCardSkeleton`)**:
  - Added 6-card skeleton grids with sweeping diagonal shimmer (`acShimmer`) while showroom inventory or search results load.
- **Interactive Hero Spotlight & Category Filter Tabs (`/src/MarketplaceHome.jsx`)**:
  - Added an interactive **Featured Showroom Highlight** switcher on the hero showcase image allowing visitors to cycle through featured listings directly from the hero banner.
  - Added interactive category filter tabs (**All vehicles**, **SUVs & 4x4**, **Sedans & Coupes**, **Electric & Hybrid**, **Accepts Offers**) in the `#browse` collection header.
- **Staggered Card Entrance & Micro-Interactions (`/src/App.jsx`, `/src/styles.css`)**:
  - Added staggered card entrance animations (`acCardReveal` via `--card-index`), elevated hover states with image zoom and CTA arrow slide, heart-beat pop animation (`acHeartBeat`) when saving vehicles, interactive Prev/Next gallery controls with crossfade (`ac-photo-fade`) on vehicle detail pages, and spring modal/toast animations (all respecting `prefers-reduced-motion: reduce`).

---

## 10. Multi-Image Car Pictures Hero & Gallery Support (`/src/MarketplaceHome.jsx`, `/src/App.jsx`, `/src/SellerWorkspace.jsx`, `/server.mjs`, `/express-server.mjs`)
- **Homepage Hero Multi-Image Gallery (`/src/MarketplaceHome.jsx`)**:
  - Replaced the static single-image hero `<img src={road}>` with a dynamic multi-image car gallery (`getHeroCarPhotos`) that resolves all photos for the active featured vehicle.
  - Added top-right **Prev / Next photo** controls, a live `Photo X / Y` badge, a clickable multi-angle thumbnail strip directly inside `.mk-hero-media`, keyboard Left/Right arrow navigation, and bottom vehicle-highlight switcher controls.
- **Vehicle Detail Page Hero & Listing Card Multi-Photo Support (`/src/App.jsx`)**:
  - Fixed `vehicleImages(car)` so demo vehicles (`demo-defender`, `demo-taycan`, `demo-audi-rs6`, etc.) no longer discard `car.images` in favor of a 1-element array, instead combining the editorial lead image with all gallery images in `car.images`.
  - Upgraded the `Vehicle` detail page hero with overlay **Prev / Next** buttons, keyboard arrow support, photo angle captions, `Photo X of Y` badge, and a multi-thumbnail selector grid with active highlights and index badges.
  - Upgraded `CarCard` to support cycling through multiple car photos directly on the card hero with Prev/Next hover buttons, `1 / N` counter badge, and clickable dot indicators.
- **Seller Listing Wizard Multi-Photo Preview (`/src/SellerWorkspace.jsx`)**:
  - Updated Step 5 (`Photos & location`) to display existing saved vehicle photos when editing a listing alongside newly added uploads, and updated Step 6 (`Preview your listing`) to support interactive multi-photo previewing with clickable thumbnails.
- **Backend Multi-Image Seeding & Upload Ordering (`/server.mjs`, `/express-server.mjs`)**:
  - Seeded and backfilled 4-photo multi-angle galleries (`demoGalleries` and `supplierExtraGalleries`) for all demo and supplier vehicles with sequential `sort_order`.
  - Updated `storeVehicleImages` in `/server.mjs` and `POST /api/vehicles` / `POST /api/supplier/vehicles` in `/express-server.mjs` to store multiple images with sequential `sort_order`.

---

## 11. Focus Mode Cleanup: Removal of Selected Photo Overlays, Photo Counter Badges & Arrow Controls (`/src/MarketplaceHome.jsx`, `/src/App.jsx`)
- **Homepage Hero (`.mk-hero-media` in `/src/MarketplaceHome.jsx`)**:
  - Removed the selected bottom `div.mk-photo-action` bar (`CSS selector 1`), the `"Photo 2 / 4"` counter badge, and the `<ChevronLeft>` / `<ChevronRight>` arrow buttons overlaid on the hero photograph, leaving the clean multi-image thumbnail strip at the bottom of the hero image.
- **Listing Cards & Vehicle Detail Gallery (`CarCard` and `Vehicle` in `/src/App.jsx`)**:
  - Removed the selected `Illustrative listing` / `Verified showroom` and `Accepts offers` photo badges (`CSS selectors 2–6`), the `1 / 4` counter badge, and the `<ChevronLeft>` / `<ChevronRight>` arrow overlays from `CarCard` photos while preserving clickable dot indicators for multi-photo switching.
  - Removed the `<ChevronLeft>` / `<ChevronRight>` arrow buttons and `"Photo X of Y"` counter overlay from the `Vehicle` detail page hero photo while keeping the multi-photo thumbnail strip below the main image.

---

## 12. 3D Sculpted Luxury GT Sports Car Loader (`/src/MarketplaceHome.jsx`, `/src/styles.css`, `/src/App.jsx`)
- **3D Perspective Stage & Multi-Plane Coachwork (`CarLoader`)**:
  - Upgraded `CarLoader` from a flat 2D outline into a 320×142 3D-perspective luxury GT sports coupe inside a CSS 3D stage (`perspective: 950px; transform-style: preserve-3d; animation: acCar3DStage`).
  - Added multi-stop liquid sapphire and titanium metallic coachwork gradients (`#ac3dBodyPaint`, `#ac3dUpperDeck`, `#ac3dFlankSculpt`), carbon-fiber front splitter/side skirts/rear diffuser, active swan-neck GT rear wing with dual pylons and endplate, 3D far-side isometric wheels and hood crest, panoramic tinted glasshouse with interior bucket seat silhouette, and a sweeping studio softbox reflection (`acStudioLightSweep`).
- **3D Deep-Dish Forged Alloy Wheels, Slotted Brake Rotors & Volumetric Lighting**:
  - Added 3D wide tire cylinders, cross-drilled brake disc rotors, stationary crimson performance brake calipers, and high-speed spinning 10-spoke forged alloy rims (`acWheelSpin`).
  - Added quad-matrix 3D LED headlights with a pulsing volumetric headlight beam cone (`acHeadlightPulse`), wrap-around crimson LED taillight bar with slipstream trails (`acAero`), and a pulsing 3D underbody ground shadow (`#ac3dGroundShadow`).
- **Enhanced Loading Visibility Across Views**:
  - Wired smooth loading transitions across homepage initial load and category tab switching (`MarketplaceHome`), `/browse` filter updates (`Browse`), `/vehicle/:id` gallery loading (`Vehicle`), and side-by-side comparison loading (`Compare`).

---

## 13. Vehicle "Buy Now" & Paystack Escrow Checkout Flow (`/src/App.jsx`, `/server.mjs`, `/express-server.mjs`)
- **"Buy Now" Entry Points Across the Marketplace (`/src/App.jsx`)**:
  - Added a **"Buy now"** button directly on every `CarCard` across the Homepage (`/`), Browse (`/browse`), Saved Vehicles (`/favorites`), and Buyer Account (`/account`), alongside the **"View vehicle"** link.
  - Added a primary full-width **"Buy now · {Price} (Paystack Escrow)"** CTA button at the top of the action grid on the `Vehicle` detail page (`/vehicle/:id`).
  - Added a **"Buy now"** button to each vehicle column in the side-by-side `Compare` table (`/compare`).
- **Interactive Paystack Escrow Checkout Modal (`Dialog` in `/src/App.jsx`)**:
  - Added Payment Plan selection between **Full Purchase (`100%`)** and **10% Escrow Reservation Deposit** (locking the vehicle for independent inspection with 90% due on delivery).
  - Added Paystack Checkout Channel & Provider selection (**Mobile Money** via `MTN MoMo`, `Telecel Cash`, or `AT Money`; **Bank Card** via `Visa / Mastercard`; or **Bank Transfer / USSD (`*713#`)**).
  - Added Handover / Delivery method selection (**Auto Connect Showroom Handover (Accra)** or **Insured Regional Delivery (Ghana)**), delivery city, buyer contact details, and optional inspection/handover notes for Admin review.
  - Added an in-modal **Paystack Escrow Order Confirmation Receipt** view showing the generated Order Reference (`ORD-GH-...`), Paystack Reference (`ps_buy_...`), amount paid into escrow, remaining balance on handover, and a direct button to view the order in **My Orders** (`/account?view=orders`).
- **Backend Purchase & Escrow Order Recording (`/server.mjs`, `/express-server.mjs`)**:
  - Added `POST /api/listings/:id/buy` and `POST /api/vehicles/:id/buy` to process vehicle purchases, create an order record in `seller_operations` (`kind = 'orders'`, `status = 'pending'`), record the simulated Paystack transaction in `payments`, send middleman-safe notifications to Buyer, Seller, and Admins (preserving strict buyer/seller contact isolation), and write an audit log entry (`buyer.vehicle.purchase`).

---

## 14. Dropdown `<select>` & `<option>` High-Contrast Visibility Fix (`/src/styles.css`, `/src/experience.css`)
- **Fixed Invisible Dropdown Options**:
  - Replaced the translucent `bg-white/[.04]` background on `.field` and `<select>` elements with a solid dark slate surface (`#151b24`) and `color-scheme: dark` so browsers do not render white-on-white native dropdown menus.
  - Added explicit `select option, select optgroup { background-color: #151b24 !important; color: #f1f5f9 !important; }` and `:checked` / `:hover` highlight rules (`background-color: #1e3a5f !important; color: #ffffff !important;`) in `/src/styles.css` and `/src/experience.css` across all marketplace filters, checkout modals, and account workspaces.

---

## 15. Mandatory Buyer Sign-In to Buy & Redesigned Multi-Step Paystack Checkout Gateway (`/src/App.jsx`, `/server.mjs`, `/express-server.mjs`)
- **Removed Selected Dialog Paragraph & Old Buy Form (`/src/App.jsx`)**:
  - Removed the selected `<p>` element (`div#root > div > section > p:nth-of-type(1)`) and stripped the old inline buy form out of `Dialog`.
- **Mandatory Buyer Sign-In Enforcement**:
  - Updated `buy(car)` in `/src/App.jsx` so guests or non-buyer accounts clicking **Buy now** are notified (`"Please sign in with a buyer account to purchase this vehicle."`) and redirected to `/login?return=/vehicle/{id}?buy=1`. Upon signing in as a buyer, the checkout gateway opens automatically for that vehicle.
  - Enforced buyer session & CSRF verification on `POST /api/listings/:id/buy` (`/server.mjs`) and `POST /api/vehicles/:id/buy` + `POST /api/listings/:id/buy` (`/express-server.mjs`), returning `401`/`403` if the requester is not signed in with a buyer account.
- **Redesigned Minimal `VehiclePaystackCheckout` Modal (`/src/App.jsx`)**:
  - Streamlined the checkout modal body (`section > div:nth-of-type(2)`) into a compact, single-font (`Onest`) card with zero excess text or mixed monospace labels: a clean vehicle summary row, a 2-button plan toggle (**Full** vs **10% Deposit**), a 3-tab payment selector (**Mobile Money**, **Card**, **Bank**), delivery city input, and a single **Pay {Amount}** button with an instant minimal receipt view.

---

## 16. System-Based Light Mode & Dark Mode (`/index.html`, `/src/styles.css`, `/src/marketplace.css`, `/src/experience.css`, `/src/App.jsx`, `/src/MarketplaceHome.jsx`)
- **Automatic OS/Browser Theme Detection (`prefers-color-scheme`)**:
  - Configured `<meta name="color-scheme" content="light dark" />` and media-aware `<meta name="theme-color">` tags in `/index.html`.
  - Added `@media (prefers-color-scheme: light)` rules across `/src/styles.css`, `/src/marketplace.css`, and `/src/experience.css`, plus `dark:` responsive utility classes across `/src/App.jsx` and `/src/MarketplaceHome.jsx` so the entire marketplace, checkout modal, 3D car loader, `<select>` dropdowns, and account workspaces automatically switch between Light Mode and Dark Mode based on the user's system setting.

---

## 17. Search Icon Alignment, Registration Contact/Confirm Password & Seller-Configurable Reservation Deposit (`/src/App.jsx`, `/src/SellerWorkspace.jsx`, `/server.mjs`, `/express-server.mjs`)
- **Search Input Icon Alignment (`/src/App.jsx`)**:
  - Wrapped the keyword `<input>` inside `SearchFilters` in a `relative flex items-center` container with `top-1/2 -translate-y-1/2` positioning on both the `<Search>` icon and clear button so the icon stays vertically centered inside the input field.
- **Contact Number & Confirm Password in Registration (`/src/App.jsx`, `/server.mjs`)**:
  - Added **Contact number** (`phone`, required for both buyers and sellers) and **Confirm password** (`confirmPassword`, validated on both client and server) to the `Auth` registration form.
- **Seller-Configurable Reservation Deposit (`/src/SellerWorkspace.jsx`, `/src/App.jsx`, `/server.mjs`, `/express-server.mjs`)**:
  - Added `allow_deposit` (`INTEGER NOT NULL DEFAULT 1`) and `deposit_amount_minor` (`INTEGER`) columns to `vehicles` in `/server.mjs` and `/express-server.mjs`, along with `parseDealerDepositConfig` / `parseDepositConfig` validation (`0 < depositAmount < askingPrice`).
  - Updated Step 2 of the Seller Listing Wizard in `/src/SellerWorkspace.jsx` (`SellerInventory`) and the `Dealer` form in `/src/App.jsx` so sellers can toggle **Allow buyers to pay a reservation deposit** and set the exact **Reservation deposit amount** (with quick `5%`, `10%`, `15%`, `20%`, `25%` preset buttons or any custom amount).
  - Updated `VehiclePaystackCheckout` in `/src/App.jsx` and `POST /api/listings/:id/buy` / `POST /api/vehicles/:id/buy` to charge the seller's configured reservation deposit amount (`Deposit · {money(depositPrice, car.currency)}`) instead of a hardcoded 10%.
