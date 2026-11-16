# Security notes

## Implemented in this prototype

- Passwords are derived with scrypt and per-user salts; plaintext passwords are not stored.
- Session identifiers are random, only their SHA-256 hashes are stored, and browser cookies are HttpOnly and SameSite Strict. Production mode adds Secure.
- State-changing requests check the request origin and authenticated requests also require a session CSRF token.
- Admin and dealer APIs enforce account roles on the server. Hiding the `/admin` link or route name is not the security boundary.
- SQL values use prepared statements; sort choices are allow-listed.
- Response headers include a content security policy, frame restriction, MIME sniffing protection and referrer policy.
- Login and account creation use an in-memory IP rate limit.

## Before public deployment

Use HTTPS, a strong unique admin password, a production secret-management system, persistent encrypted storage and tested backups. Put the service behind a maintained reverse proxy and configure trusted proxy behavior only for that proxy. Add durable shared rate limiting, account verification and recovery, abuse monitoring, security alerting, dependency/runtime patching, data-retention controls, upload scanning and a documented incident process. Review the CSP and headers against the final hosting setup. Complete an independent security review and jurisdiction-specific privacy/legal review.

The built-in rate limiter resets on restart and is not shared across server instances. No independent penetration test has been performed. This document records implementation scope; it is not a security certification.
