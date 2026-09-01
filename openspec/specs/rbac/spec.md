# rbac Specification

## Purpose
Defines the runtime access-control semantics for the internal RBAC model, in particular how super-administrators are authorized on permission-protected endpoints.

## Requirements

### Requirement: Super-admin runtime bypass

A user who holds the `super_admin` role SHALL be authorized for any endpoint protected by a permission requirement, regardless of the set of individual permission codes attached to that role. The super-admin bypass takes effect before any per-code permission evaluation and does not depend on the role's permission-code completeness.

#### Scenario: Super-admin passes though the role lacks the required code

- **WHEN** an authenticated user holding the `super_admin` role accesses an endpoint that requires a permission code not present in their role
- **THEN** the request is authorized and proceeds

#### Scenario: Non-super-admin still requires the permission code

- **WHEN** an authenticated user who does not hold the `super_admin` role accesses an endpoint that requires a permission code they do not hold
- **THEN** the request is denied

#### Scenario: Super-admin detection is keyed on the role key

- **WHEN** multiple roles are evaluated to determine whether a user is a super-admin
- **THEN** the evaluation matches on the `super_admin` role key consistently across the user-profile and authorization paths

### Requirement: Consistent super-admin detection semantics

The runtime detection of the `super_admin` role SHALL use one shared definition so that the user-profile view and the authorization guard report the same result for the same role set.

#### Scenario: Profile and guard agree on super-admin status

- **WHEN** a user has the `super_admin` role
- **THEN** the user-profile response reports `isSuperAdmin: true` and the authorization guard grants full access

### Requirement: Permission cache invalidation on permission-set change

When the set of permission codes available through the RBAC model changes for any user (such as a permission being removed by a code scan, or a role/user/role-permission binding being reassigned), the cached permission set used by the authorization guard SHALL be invalidated so that revoked permissions stop being authorized without waiting for the cache TTL to expire.

#### Scenario: Removed permission no longer authorizes

- **WHEN** a permission is removed from the system and subsequent cache invalidation completes
- **THEN** users who previously held that permission are no longer authorized through the cached permission set, and any stale cache entry for those users is cleared

#### Scenario: Invalidation is keyed through roles to users

- **WHEN** a permission's set of affected users is determined for invalidation
- **THEN** the affected users are found by walking permission → roles → users, so every user who can reach the changed permission is invalidated at least once

#### Scenario: Name/description-only changes do not require invalidation

- **WHEN** only the `name` or `description` of a permission changes and its `code` is unchanged
- **THEN** no permission cache needs to be invalidated, because the cached values hold permission codes only and are unaffected
