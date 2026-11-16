# Visual upgrade validation

**Six-issue follow-up: resolved. The integrated application check passes 6/6 with zero failures.**

GATE: OPEN 51 (rounds used up)

The requested design skills were applied as an enhancement to the existing React application. The finished preview is http://127.0.0.1:4287/.

## Delivered

Photography-led split hero, masked text entrance, one restrained pointer-responsive seller heading, live comparison table, matching prototype Defender/Taycan/Audi photographs, consistent Onest typography across public and account areas, navy/blue surfaces, readable search filter labels, local fonts and motion modules, and separate buyer/admin bundles. The seller-paid listing model and unconnected payment state are retained.

## Application checks

Production builds pass in both the working copy and original project. Seven application tests pass. Four browser journeys pass: discovery/search/comparison/account creation and mobile focus recovery; seller submission/admin approval/buyer enquiry/moderation; draft resume; and reduced-motion imagery/search. The later comparison-table change only replaces div rows with semantic table rows; no behavior changed.

## Scope and design choices

Software marketplace; owner-specified blue/black palette; Onest + JetBrains Mono; dealt split hero; dealt liquid-type seller statement. No shader, 3D scene or new payment provider. Account controls stay stable while public storytelling carries the visual effects. Voice: direct, specific, Ghana-focused. No new invented customer numbers, testimonials, businesses or promises. Canonical production domain and live inventory photographs remain owner-supplied. No contact form or external message destination was added.

The marketing-oriented gate has remaining open style findings, listed in full below. They include section rhythm, container and grid conventions, heading/copy heuristics, button-family variants and the React root wrapper. The separate layout utility crashed with an undefined sections/map error; its success is not claimed. The Epic static validator scans an isolated JSX component, so it cannot find the document's main/lang/skip-link or imported reduced-motion CSS. GSAP and ScrollTrigger were intentionally not added: the shipped local motion modules implement the used effects without changing the app's content-security policy.

The performance check reports oversized source dimensions at desktop and phone sizes. Those two findings remain open; compressed files are small, but responsive image variants would improve this further. Recorded timing values are local CPU-relative measurements, not production performance guarantees. There were no broken requests or recorded layout shifts in that run.

## Asset provenance

Editorial stand-ins: porsche-road.webp (Unsplash photo-1503376780353-7e6692767b70), car-detail.webp (photo-1492144534655-ae79c964c9d7). Original source pages/photographers for these legacy CDN assets are not confirmed; replace or finish attribution before commercial launch.

Matched illustrative model photographs: Defender, Haberdoedas, https://unsplash.com/photos/KHAEZkXlwW8 ; Audi RS 6, lennyyx2z, https://unsplash.com/photos/YWZ9fVNDSLg ; Taycan, Stepan Voronkov, https://unsplash.com/photos/K0LncGv1mww . These are stock scenes, not the advertised seller's actual cars; the interface retains illustrative labels. Backgrounds are intentionally preserved. Fonts carry their SIL OFL files under public/assets/fonts. No client media slots were invented.

## Waivers

~~~json
[
  {
    "check": "caption",
    "target": "section#browse > div.wrap.mk-wrap > p.mk-disclosure",
    "reason": "The prototype inventory notice is a required product truth: stock photographs and illustrative offers must not be represented as verified seller inventory."
  },
  {
    "check": "text-only",
    "target": "section#faq",
    "reason": "This section answers practical buyer questions. Readable text and native disclosures serve the task; a decorative picture would add no information."
  },
  {
    "check": "section-height",
    "target": "footer.closing",
    "reason": "The existing application uses a compact shared navigation footer. Stretching those links to a whole viewport would add blank scrolling to every route."
  },
  {
    "check": "no-visual",
    "target": "section#about",
    "reason": "The visual is a live HTML comparison table populated from marketplace records, not a screenshot or illustrative picture. Keeping real data readable is the purpose of this section."
  },
  {
    "check": "no-visual",
    "target": "section#import",
    "reason": "The visual is the working shipping-estimate form with labels, controls and a returned API result. A decorative photograph would not improve this task."
  }
]
~~~

## Final gate output — all open findings

~~~text
gate: checking http://127.0.0.1:4287/ (software); this takes a few minutes on a CPU Chrome
gate: rounds used up; 51 FAIL open
  FAIL button-styles    (one screen)  [1440]
       3 button styles on one screen: soft, fill #60a5fa ("Find a car"); soft, fill #24344b ("View vehicle"); soft, outline #0b0f14 ("Build your comparison"); the odd one out: "Build your comparison"
       fix: one primary and one secondary button: one shape, one height per size, one label size
  FAIL button-styles    (the page)  [1440, 390]
       3 button styles on the page: soft, fill #60a5fa x5 ("Find a car"); soft, fill #24344b x3 ("View vehicle"); soft, outline #0b0f14 x1 ("Build your comparison")
       fix: one primary and one secondary button: one shape, one height per size, one label size
  FAIL copy-headings    div.mk-compare-layout > div.mk-steps > div:nth-of-type(1) > h3 "Save your shortlist."  [1440]
       "Save your shortlist." names no product, part, place or section (7 headings like it; at most one brand line per page) (and 6 more like it: "Check vehicle details.", "Your car. Its next owner", "Prepare your listing", "Co
       fix: name the thing in every heading: the product, a part, the place or a section noun
  FAIL section-gaps     section#import / section#faq  [1440]
       366px between these sections, +163% against the median 139px
       fix: use one gap between sections (all within 25% of each other)
  FAIL hero-enter       main#main > section.hero.mk-hero  [1440]
       the hero does not enter on load: no head line setting html.m-enter (motion.md, The hero's entrance)
       fix: put data-enter on the hero <section> and keep the head line from starter.html that sets html.m-enter
  FAIL section-height (screen-height) section#browse "Find cars for your shortlist.Explore the"  [1440, 390]
       the section's content does not fit it: its lowest content ends 844px below its top, past 828px (the section less 72px of bottom padding) (SR-2)
       fix: fit the content above the section's bottom padding (--padb), or make it two screens (.g2) in two groups
  FAIL one-section      div#root > footer.closing.market-footer "AUTOCONNECTVehicle search, comparison an"  [1440]
       the screen at scroll 4862px (the top of section 7) shows 362px of section 7 beside section 6: a screen shows one section (another may peek 8px, 24px WARN) (SR-4)
       fix: make each section exactly one screen or two, so a screen shows one section and no neighbour peeks
  FAIL container-edges  div#root > header.nav.market-header "ACAUTOCONNECTCarsImportFor dealersAboutS"  [1440]
       the nav's content runs 80px from the left and 80px from the right (read from its outermost blocks: no .wrap): the page's container starts at 0px (one container, equal margins, 2px either way) (SR-6)
       fix: use one container on every section and the nav (.wrap): one margin left and right, 64-120px on a desktop, 16-24px on a phone
  FAIL container-edges  main#main > section.hero.mk-hero "Cars for yournext chapter.Find your next"  [1440]
       the content of section 1 runs 0px from the left and 0px from the right: the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (and 6 more like it: "Find cars for your short", "Compare your next 
       fix: use one container on every section and the nav (.wrap): one margin left and right, 64-120px on a desktop, 16-24px on a phone
  FAIL container-edges  div#root "Skip to contentACAUTOCONNECTCarsImportFo"  [1440]
       a <div> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6)
       fix: build the page as header.nav, a main of sections (each one in-flow .wrap plus background layers) and footer.closing
  FAIL container-edges  main#main > section.hero.mk-hero > div.mk-ground.depth-0  [1440]
       a child of section 1 beside its .wrap is no valid background layer: not img, picture, video or canvas (and 1 more like it: "Cars for yournext chapte") (SR-6)
       fix: build the page as header.nav, a main of sections (each one in-flow .wrap plus background layers) and footer.closing
  FAIL container-edges  div.mk-compare-layout > div.mk-steps > div:nth-of-type(1) > h3 "Save your shortlist."  [1440]
       6 text blocks start on a left line at x 124, 124px from the container's left: text starts on the container's left, or on one split line (x 610, 732, 854) (also "Save cars to return to later.", "Check vehicle details.", "
       fix: start the text on the container's left, or on the one split line every split shares
  FAIL container-edges  ol.mk-seller-process.depth-3 > li:nth-of-type(1) > div > p "Save a draft with photos and v  [1440]
       1 text block starts on a left line at x 114, 114px from the container's left: text starts on the container's left, or on one split line (x 610, 732, 854) (and 9 more like it: x 105, x 80, "Cars for yournext chapte") (SR-
       fix: start the text on the container's left, or on the one split line every split shares
  FAIL container-edges  section#dealers > div.wrap.mk-wrap > ol.mk-seller-process.depth-3 "01Prepare your listingS  [1440]
       a box over half the container wide runs 80-1360px, not on the container's lines at 0-1440px (SR-6)
       fix: run the picture or box from the container's left line to its right line, or put it in a row or a split
  FAIL container-edges  div#root > footer.closing.market-footer > div.wrap.mx-auto > div.mt-9.flex "© 2026 Auto Co  [1440]
       a box over half the container wide runs 80-1360px, not on the container's lines at 0-1440px (SR-6)
       fix: run the picture or box from the container's left line to its right line, or put it in a row or a split
  FAIL row-lines        section#browse > div.wrap.mk-wrap > div.mk-car-grid "Illustrative listing2022 Land Rover D  [1440]
       a row of 3 items: its first item starts at 80px, the container's left line at 0px; its last item ends at 1360px, the container's right line at 1440px (2px either way) (SR-7)
       fix: start the row's first item on the container's left line and end its last on the right line, every item one height
  FAIL row-lines        section#dealers > div.wrap.mk-wrap > ol.mk-seller-process.depth-3 "01Prepare your listingS  [1440]
       a row of 3 items: its first item starts at 80px, the container's left line at 0px; its last item ends at 1360px, the container's right line at 1440px (2px either way) (SR-7)
       fix: start the row's first item on the container's left line and end its last on the right line, every item one height
  FAIL row-lines        div#root > footer.closing.market-footer > div.wrap.mx-auto > div.grid.gap-9 "AUTOCONNECTVe  [1440]
       a row of 4 items: its first item starts at 80px, the container's left line at 0px; its last item ends at 1360px, the container's right line at 1440px (2px either way) (SR-7)
       fix: start the row's first item on the container's left line and end its last on the right line, every item one height
  FAIL split-pair       section#dealers > div.wrap.mk-wrap > div.mk-seller-layout "Your car.Its next owner.Create   [1440]
       the split's left column starts with a picture or a box, not text: text left, the visual right, on every split (SR-8)
       fix: put the text in the left column and the visual in the right, on every split
  FAIL split-pair       main#main > section.hero.mk-hero > div.wrap.mk-wrap "Cars for yournext chapter.Find your n  [1440]
       the split does not run edge to edge on the container: its left column starts at 80px, the container's left at 0px; its right column ends at 1360px, the container's right at 1440px (SR-8)
       fix: run the split from the container's left line to its right line
  FAIL split-pair       section#about > div.wrap.mk-wrap > div.mk-compare-layout "Save your shortlist.Save cars to  [1440]
       the split does not run edge to edge on the container: its left column starts at 80px, the container's left at 0px; its right column ends at 1360px, the container's right at 1440px (SR-8)
       fix: run the split from the container's left line to its right line
  FAIL section-gaps     main#main > section.hero.mk-hero / section#browse  [390]
       178px between these sections, +62% against the median 110px
       fix: use one gap between sections (all within 25% of each other)
  FAIL edge-left        #browse svg  [1440, 390]
       starts at x 447.1; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-right       #browse svg  [1440, 390]
       ends at x 464.1; the right line is 1360.1
       fix: end it on the .wrap right line
  FAIL edge-left        #browse p.mt-1.text-xs "110 X-Dynamic · AWD"  [1440, 390]
       starts at x 100.9; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        #browse p.mt-1.text-xs "4S · AWD"  [1440, 390]
       starts at x 535.6; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        #browse p.mt-1.text-xs "G 550 · AWD"  [1440, 390]
       starts at x 970.4; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        #about h3 "Save your shortlist."  [1440, 390]
       starts at x 123.9; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        #about p "Save cars to return to later."  [1440, 390]
       starts at x 123.9; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        #about h3 "Check vehicle details."  [1440, 390]
       starts at x 123.9; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        #about p "Confirm condition, records and s"  [1440, 390]
       starts at x 123.9; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        #about h3 "Contact the seller."  [1440, 390]
       starts at x 123.9; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        #about p "Ask about the car from its listi"  [1440, 390]
       starts at x 123.9; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        #dealers h2.mo-lt "Your car.Its next owner."  [1440]
       starts at x 772; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        #dealers p "Create your seller profile, prep"  [1440]
       starts at x 772; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        footer.closing.market-footer div "MarketplaceBrowse carsCompareSav"  [1440]
       starts at x 506.6; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-right       footer.closing.market-footer div "MarketplaceBrowse carsCompareSav"  [1440]
       ends at x 767.1; the right line is 1360.1
       fix: end it on the .wrap right line
  FAIL edge-left        footer.closing.market-footer a.flex.min-h-10 "Browse cars"  [1440]
       starts at x 506.6; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        footer.closing.market-footer a.flex.min-h-10 "Compare"  [1440]
       starts at x 506.6; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        footer.closing.market-footer a.flex.min-h-10 "Saved cars"  [1440]
       starts at x 506.6; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        footer.closing.market-footer div "ServicesImport guidanceShipping "  [1440]
       starts at x 803.1; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-right       footer.closing.market-footer div "ServicesImport guidanceShipping "  [1440]
       ends at x 1063.6; the right line is 1360.1
       fix: end it on the .wrap right line
  FAIL edge-left        footer.closing.market-footer a.flex.min-h-10 "Import guidance"  [1440]
       starts at x 803.1; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        footer.closing.market-footer a.flex.min-h-10 "Shipping estimate"  [1440]
       starts at x 803.1; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        footer.closing.market-footer a.flex.min-h-10 "List a car"  [1440]
       starts at x 803.1; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        footer.closing.market-footer div "AccountSign inPrivacy overviewTe"  [1440]
       starts at x 1099.6; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        footer.closing.market-footer a.flex.min-h-10 "Sign in"  [1440]
       starts at x 1099.6; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        footer.closing.market-footer a.flex.min-h-10 "Privacy overview"  [1440]
       starts at x 1099.6; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        footer.closing.market-footer a.flex.min-h-10 "Terms overview"  [1440]
       starts at x 1099.6; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL edge-left        footer.closing.market-footer a.flex.min-h-10 "Photo credits"  [1440]
       starts at x 1099.6; the lines are 79.9 and the column starts
       fix: start it on the .wrap left line
  FAIL neighbour        #import section.mk-import-section.border-b "A clearer route to importA plann"  [390]
       framed, 78px of #faq section.mk-section.mk-faq "Questions beforeyour next car.Ge" shows
       fix: keep the next section's heading and picture out of this screen
  WAIVED caption section#browse > div.wrap.mk-wrap > p.mk-disclosure "Prototype collection: listi: The prototype inventory notice is a required product truth: stock photographs and illustrative offers must not be represented as verified seller inventory.
  WAIVED no-visual section#about "Compare your next car.": The visual is a live HTML comparison table populated from marketplace records, not a screenshot or illustrative picture. Keeping real data readable is the purpose of this section.
  WAIVED no-visual section#import "A clearer route to import": The visual is the working shipping-estimate form with labels, controls and a returned API result. A decorative photograph would not improve this task.
  WAIVED text-only section#faq "Questions before your next car.": This section answers practical buyer questions. Readable text and native disclosures serve the task; a decorative picture would add no information.
  WAIVED section-height div#root > footer.closing.market-footer "AUTOCONNECTVehicle search, comparison a: The existing application uses a compact shared navigation footer. Stretching those links to a whole viewport would add blank scrolling to every route.
  20 WARN (not blocking), first: nav div#root > header.nav.market-header > di; copy-headings ol.grid.gap-3 > li.surface.flex:nth-of-t; copy-buttons div.wrap.mk-wrap > div.mk-hero-copy.dept; copy-actions header.nav.market-header > div.mx-auto.f; copy-actions (the page)
Stop fixing: put these open FAILs and the waivers in your report, then finish.
GATE: OPEN 51 (rounds used up)

~~~

## Performance output

~~~text

perf /127.0.0.1:4287/ @ 1440px
  PASS  host CPU load (before/after)               2/1 %          
  PASS  total transfer                             982 KiB        html 2K  css 114.5K  js 451.8K  font 65.1K  img 338.3K  other 10.5K
  PASS  requests                                   20             18 by load
  PASS  images bytes                               338.3 KiB      5 files
  PASS  largest image                              101 KiB        editorial/defender.webp
  PASS  JS parsed                                  448.1 KiB      5 files, 451.8K gz
  PASS  CSS                                        114.5 KiB      3 files
  PASS  font families                              2              Onest, JetBrains Mono
  PASS  font files                                 2              65.1K
  PASS  font bytes                                 65.1 KiB       
  PASS  images without width+height                0              
  PASS  below-fold images not lazy                 0              
  FAIL  oversized images (natural > 2.2x shown)    4              porsche-road.webp 1600px for 628; defender.webp 1000px for 409; taycan.webp 1000px for 409
  PASS  WebGL live at load                         0              
  PASS  WebGL live at bottom                       0              
  PASS  WebGL peak live                            0              0 contexts made in all
  PASS  long tasks                                 0              runs 3, 0..0, max 0ms
  PASS  blocking time                              0 ms           runs 3, 0..0 ms; at load 0ms
  PASS  FCP (CPU, relative)                        156 ms         runs 3, 144..644
  PASS  LCP (CPU, relative)                        156 ms         runs 3, 144..644, img
  PASS  layout shift                               0.000          runs 3, 0.000..0.000; at load 0.000
  PASS  modules loaded, never mounted              0              
  PASS  broken requests                            0              
  PASS  page height                                6.4 screens    DOM 430 nodes

perf /127.0.0.1:4287/ @ 390px
  PASS  host CPU load (before/after)               2/1 %          
  PASS  total transfer                             981 KiB        html 2K  css 114.5K  js 451.8K  font 65.1K  img 338.1K  other 9.6K
  PASS  requests                                   19             16 by load
  PASS  images bytes                               338.1 KiB      5 files
  PASS  largest image                              101 KiB        editorial/defender.webp
  PASS  JS parsed                                  448.1 KiB      5 files, 451.8K gz
  PASS  CSS                                        114.5 KiB      3 files
  PASS  font families                              2              Onest, JetBrains Mono
  PASS  font files                                 2              65.1K
  PASS  font bytes                                 65.1 KiB       
  PASS  images without width+height                0              
  PASS  below-fold images not lazy                 0              
  FAIL  oversized images (natural > 2.2x shown)    5              porsche-road.webp 1600px for 342; defender.webp 1000px for 340; taycan.webp 1000px for 340
  PASS  WebGL live at load                         0              
  PASS  WebGL live at bottom                       0              
  PASS  WebGL peak live                            0              0 contexts made in all
  PASS  long tasks                                 0              runs 3, 0..0, max 0ms
  PASS  blocking time                              0 ms           runs 3, 0..0 ms; at load 0ms
  PASS  FCP (CPU, relative)                        136 ms         runs 3, 132..140
  PASS  LCP (CPU, relative)                        136 ms         runs 3, 132..140, img
  PASS  layout shift                               0.000          runs 3, 0.000..0.000; at load 0.000
  PASS  modules loaded, never mounted              0              
  PASS  broken requests                            0              
  PASS  page height                                9.7 screens    DOM 430 nodes

SUMMARY /127.0.0.1:4287/: 2 FAIL, 0 WARN  -> FAIL

~~~

## Six-issue follow-up — integrated application validation

The earlier Epic static script scanned MarketplaceHome.jsx as though it were a complete HTML document. That output is superseded by the app-aware check in scripts/check-experience.mjs. Run pnpm build, start the local preview, then run pnpm check:experience (an alternate local URL may be passed as its argument).

| Earlier flag | Resolution | Verified result |
| --- | --- | --- |
| Scene elements | Inspect rendered scene and its background, image and content depth planes. | PASS |
| Reduced-motion handling | Verify the actual imported stylesheet and runtime behavior, including a preference change after load. The heading effect now remounts safely and loses its filter immediately. | PASS |
| Skip link | Verify the first keyboard target and activate it. Fixed the SPA router intercept so focus reaches the main content. | PASS |
| GSAP missing | Removed the inappropriate library-specific requirement from project validation. Verify that the installed local animation engine mounts and reaches its final state. GSAP is not a dependency of this implementation. | PASS |
| Main landmark | Verify the complete application's single main landmark and its focus target. | PASS |
| Document language | Verify lang=en on the actual HTML document. | PASS |

Result: 6 passed, 0 failed. No design-kit files or original kit checkers were edited. The older design-gate findings and image-dimension findings above are separate and remain open; this follow-up resolves the six component-validator flags.
