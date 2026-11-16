# Prototype security review

Review date: 9 November 2026. Scope: local source review and automated API integration journey. This is not a penetration test, deployment audit or certification.

## Implemented and exercised

| Control | Evidence | Result |
| --- | --- | --- |
| Password storage | scrypt with per-account random salt | Registration/login journey passes |
| Session handling | Random opaque token, token hash at rest, expiry, HttpOnly and SameSite Strict; Secure in production | Login and password rotation journey passes |
| Role and ownership access | Buyer/dealer/admin route checks and dealer-scoped vehicle/media actions | Unauthorized and cross-role paths exercised |
| CSRF and origin checks | Write routes validate CSRF token and request origin | Missing token and hostile origin return 403 |
| SQL injection exposure | Parameterized values and allow-listed sort keys | Source reviewed; no dedicated fuzz suite |
| Public listing privacy | Explicit vehicle DTO omits VIN, dealer ID and archive timestamp | API test asserts internal fields absent |
| Dealer listing controls | Ownership-scoped edit/status/archive; approved changes return for review | Integration journey covers edit, re-approval, status and restore |
| Conversations and alerts | Enquiry membership, message bounds and session authorization | Buyer/dealer thread and notifications exercised |
| Uploaded vehicle media | JPEG/PNG/WebP MIME and magic checks, max 6 per submission, max 500 KB/image, 2.5 MB/gallery, owner/admin access while pending, public access only when approved/active, owner-scoped CSRF deletion | API journey checks invalid image data, pending privacy, approved read and deletion denial/success |
| Admin moderation | Dealer/listing/report/account actions with server-side admin role | Integration journey covers approvals, report actions and suspension |

Checks: `node --check server.mjs`, `pnpm build` (Vite production bundle), `pnpm test` (one API journey passed). Running the test without local loopback permission could not reach its spawned server; with loopback access it passed. The suite does not test brute-force limits, XSS payloads in a browser, session expiry, audit-log integrity, image decoder exploits, production TLS, deployment configuration or backup restore.

## Known gaps and limits

- Uploaded images are stored as SQLite BLOBs after client-side resizing. The server checks format signatures and limits bytes, but does not decode/re-encode, malware-scan or isolate uploads. Production should use managed private object storage and a safe processing pipeline.
- No email verification, password recovery, account deletion, administrator MFA, notification preferences or durable shared rate limiter.
- No document/identity verification or history/inspection provider. Dealer profile approval is only a marketplace workflow state.
- No production logs/alerts, monitoring, tested backup/restore or independent penetration test.
- Payment, external messaging, customs calculations and carrier pricing integrations are absent.
- SQLite `DatabaseSync` performs synchronous work in the Node process; measure workload and move to a managed database before meaningful concurrent production use.

Do not treat the local prototype as production-secure or admin approval as legal/business identity verification.
