# ADR 0002: Independent Customer Model (Not Merged into User)

- Status: Accepted
- Date: 2026-08-26
- Related: OpenSpec change `add-equipment-inquiry-customer-domains`, ADR 0003

## Context

The project needs to model B2C end consumers (purchasers of equipment filters) alongside the existing backend staff `User` model. The source schema had a separate `customers` table. During grilling (Q13), the team evaluated three options:

1. Merge Customer into User (single model with role differentiation)
2. Discard the customer domain entirely (out-of-scope for admin backend)
3. Keep Customer as an independent model

The existing `User` model is purpose-built for RBAC: it has `userRoles`, `userPositions`, `departmentId`, and audit fields (`createdById`/`updatedById`) that reference other Users (i.e. every User is created/updated by another User — admin bootstrapping flow).

## Decision

Keep `Customer` as an independent model, separate from `User`.

## Rationale

1. **Different identity providers**: Customers register via username/password or WeChat OAuth (`openid`/`unionid`). Staff login via username/password (JWT). Merging would force `User` to carry WeChat fields that are meaningless for staff.
2. **Audit semantics mismatch**: `User.createdById`/`updatedById` form a self-referential admin chain. Customer self-registration has no admin operator — forcing `createdById` would require either nullable-but-semantically-wrong fields or a sentinel "system" User.
3. **RBAC pollution**: Customers have no roles/permissions/positions/departments. Adding them as Users would require either empty RBAC relations (noise) or special-case logic in every RBAC guard.
4. **Lifecycle divergence**: Customers can be soft-deleted by self-service (account deletion) or admin action. Staff lifecycle is admin-controlled. Separate models keep lifecycle policies clean.
5. **Future extensibility**: B2C features (loyalty points, order history, WeChat Pay) would further bloat a merged User model. An independent Customer model isolates B2C growth.

## Consequences

Positive:
- `User` RBAC logic stays clean — no special-casing for "is this a customer?" in every guard.
- Customer can evolve independently (B2C auth, payment, etc.) without touching admin auth.
- Audit fields are semantically correct on both sides.

Negative:
- Two identity models means two auth flows (future). Acceptable — they serve different audiences.
- No single "user list" across both. Acceptable — admin UIs already separate staff/customer management.

## Alternatives Considered

### A. Merge Customer into User with a `type` discriminator
Rejected. Forces `User` to carry `openid`/`unionid` (meaningless for staff), forces `createdById` to be nullable (breaks admin bootstrapping invariant), and pollutes every RBAC query with a `WHERE type = 'staff'` filter. The cost compounds with every future B2C field.

### B. Discard the customer domain
Rejected. The inquiry domain requires a `customerId` FK (registered-customer scenario) AND a `customerName`/`customerEmail`/`customerPhone` snapshot (anonymous scenario). Without a Customer model, the registered-customer flow has no persistent identity. Anonymous-only would lose customer history and re-engagement.

## References

- OpenSpec change: `openspec/changes/add-equipment-inquiry-customer-domains/`
- Spec: `specs/customer/spec.md` — "客户模型与管理员分离"
- Design: `design.md` D1, D9
