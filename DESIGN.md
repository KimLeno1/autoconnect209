# Interface direction

The user requests Apple Design for Auto Connect's interface work: familiar navigation, clear hierarchy, restrained depth, direct manipulation where appropriate, immediate press feedback, accessible controls and reduced-motion alternatives. Preserve the blue and black brand palette.

The admin surface prioritizes completing operational tasks. Use the platform system font, size-specific tracking, comfortable line height, a persistent navigation region on desktop and a compact navigation drawer on phones. Controls remain usable during transitions. Avoid decorative motion and bounce on ordinary menus.

Admin colors live in `src/admin.css`: near-black canvas, dark slate panels, pale blue actions, high-contrast text, muted secondary text and restrained semantic status colors. Keep external-service status honest. Empty database records stay empty rather than displaying invented business metrics.

Tables use search, filters, clear selection counts and pagination. Destructive or access-changing actions need explicit confirmation. Dialogs use native focus management, Escape dismissal, clear validation and unsaved-change protection. A support preview always identifies the administrator and remains read-only.

The marketplace keeps its existing visual identity and behaviors unless a later brief requests a redesign. Apply the same Apple Design principles to future interface changes throughout the project.

The seller workspace follows this same system. Wallet and verification screens must distinguish real provider outcomes from local records or test results. Preserve the existing vehicle editor and buyer conversations while extending seller operations.
The buyer surface keeps five primary destinations: Home, Orders, Saved items, Messages and Account. Put subordinate settings inside Account and keep Help visible. One main action sits at the top right of a screen or form. Do not add a competing creation action to empty-state cards. Longer address forms end with a review step. Optional buyer identity checks must have a specific administrative request and reason; do not make identity a permanent onboarding requirement.

Current business-model decision: Auto Connect charges sellers for listing publication only. Buyers never pay Auto Connect for physical purchases. Remove buyer checkout, cart payment and payment-method navigation, and seller wallets/payouts. Seller and admin financial surfaces show publication fees paid to Auto Connect. Draft preparation stays free; paid publication still needs review. No amount, recurring period or provider should be activated without owner-approved configuration.

## Shared refinement — November 2026

Public branding consistently reads Auto Connect. Preserve the existing public typefaces; the font detector advisory is an intentional incumbent-design choice.

All account areas use WorkspaceNavigation for the phone drawer: background dimming, scroll containment, Escape dismissal, a visible close control, a contained keyboard sequence and return to the opening control. Desktop keeps persistent navigation. Navigation targets and principal controls are at least 44px tall; mobile form text is 16px to avoid browser zoom. Dense desktop table actions retain a 36px minimum and expand to 44px on small screens.

Shared account refinements live in src/experience.css. Keep focus visible, preserve meaningful status text, and pair errors with a recovery action. Account section descriptions explain the current task. Ignore stale account loads after navigation. Reduced-motion mode removes movement while keeping loading status visible.

Validated at phone, tablet and desktop sizes using real rendered pages. Production build, seven application tests and three end-to-end journeys pass. Payment collection and actual provider refunds remain disconnected.

November 2026 visual upgrade: the public marketplace uses a photography-led split hero, one pointer-responsive seller statement and live listing/comparison content. The owner retains blue and black; updated navy surfaces and locally hosted Onest unify the public and account areas. Editorial images are compressed WebP stand-ins. Fonts include their SIL OFL licenses. Buyer/admin bundles load only when needed. Motion modules are locally bundled/served; no external animation CDN is required, and reduced-motion/touch modes retain complete content.

Task-oriented account workspaces keep stable layout and controls. Cinematic treatments are concentrated on the public marketplace. Full screen section guidance applies to desktop storytelling, while phone sections grow to accommodate readable content and controls. Prototype notices and unconnected-provider information stay visible even where marketing-oriented checks prefer to remove them.
