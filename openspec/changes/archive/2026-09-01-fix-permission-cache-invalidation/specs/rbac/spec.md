## Purpose

Defines the runtime access-control semantics for the internal RBAC model, in particular how super-administrators are authorized on permission-protected endpoints.

## ADDED Requirements

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