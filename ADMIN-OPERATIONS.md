> Current model: sellers pay Auto Connect to publish listings. Buyers arrange physical purchases and payment directly with sellers. Buyer checkout, carts and payment methods, and seller wallets/payouts are removed. Earlier descriptions of those features below are historical. See [BUSINESS-MODEL.md](BUSINESS-MODEL.md) for the current fee-only implementation and pending owner configuration.

# Auto Connect administration

Open `/admin`. Administrators are provisioned with `APEX_ADMIN_EMAIL` and `APEX_ADMIN_PASSWORD`; public registration never creates an administrator. Keep these values in server environment variables, never in the repository.

## Available now

- Live account/session, registration growth, vehicle-view, enquiry, payment-record and approval metrics, with date ranges and previous-registration-period comparison.
- Searchable, sortable, paginated record tables; selection counts; CSV export; saved views and shareable filter URLs.
- Buyer/seller detail panels with an audited, read-only support preview, related support records, subscriptions and account activity.
- Account suspension, restoration, reversible soft deletion, verification state and session revocation. Administrator accounts are protected from these actions.
- Organizations, teams, membership/ownership records, invitation records and named/custom roles. Staff access assignments apply to existing server-provisioned administrators; creating a membership cannot turn a buyer into an administrator.
- Server-enforced collection/action permissions and organization scope. A staff role can list permissions such as `users:view`, `users:export`, `tickets:*`; `*` grants workspace-owner access. Sensitive email visibility requires `email` in the role's allowed sensitive fields. Existing environment-provisioned administrators without a scoped assignment remain workspace owners.
- Vehicle inventory, draft creation, editing, duplication, archival/restoration and the existing real seller/listing approvals.
- Content drafts, preview, publication to `/api/content`, revision history, rollback and moderation review/resolution.
- Persistent plans, subscription/invoice/discount records, support tickets, internal notes, assignment, escalation, incidents, job requests, integrations, webhook configuration, feature-rollout definitions, privacy/consent/retention requests and backup records.
- Preview and validation before JSON import, detailed row errors, and audited imports. Access-control records must be created individually rather than imported.
- CSRF-protected mutations, confirmation and reason capture for sensitive account actions, version history, database persistence and administrator audit records.
- Responsive Apple-inspired navigation and typography, immediate press feedback, native focus-trapped dialogs, reduced-motion/transparency and increased-contrast support.

## Connections and additional work required

These panels deliberately distinguish local records/configuration from executed external operations:

- Payments, refunds, trials, invoicing delivery, metered billing and checkout entitlements require a payment provider. Recording a paid/refunded invoice does not move money.
- Invitations, reset-access emails, email templates and scheduled report delivery require email integration.
- SSO, MFA, step-up authentication, real impersonation, API-token issuance/rotation and suspicious-login detection require an identity implementation. The support preview does not impersonate users or mint sessions.
- Scheduled content, jobs, report schedules and webhook dispatch/retry require a worker. Scheduling records alone does not run them.
- Feature flags are configuration records until customer-facing code adopts the evaluator. Existing static marketplace copy is not replaced by content records; published records are available through the content API.
- Retention/deletion requests and backup/recovery records support manual operations. They do not automatically purge data, create backups, merge duplicates or restore databases.
- Retention, conversion, churn and acquisition-channel reporting require additional event instrumentation. Active users currently means accounts with sessions created in the selected period.
- Audit entries record successful administrative changes and exports. Full authentication-attempt, IP/device and failed-action history requires further instrumentation.

The application is still a local prototype, not a complete production identity, billing, backup or scheduling platform.

## Verification

`pnpm test` covers existing marketplace behavior and operations authorization, CSRF, validation, version rollback, archive/restore, imports, scoped permissions, account actions and exports.

`pnpm test:e2e` covers buyer discovery, seller listing/photos, administrator approval and report moderation, buyer conversations and draft resume through the redesigned panel.

The authoring pass also checked all 32 admin sections, ticket create/edit/history, desktop/phone overflow, mobile navigation and browser errors.
