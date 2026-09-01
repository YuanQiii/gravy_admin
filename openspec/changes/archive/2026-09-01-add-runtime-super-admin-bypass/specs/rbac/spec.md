## Purpose

Defines the runtime access-control semantics for the internal RBAC model, in particular how super-administrators are authorized on permission-protected endpoints.

## ADDED Requirements

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