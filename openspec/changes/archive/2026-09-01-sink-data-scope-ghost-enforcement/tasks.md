## 1. 移除强制执行死代码

- [x] 1.1 From `src/modules/system/roles/services/data-scope.service.ts` remove `getUserDataScope`, `buildDataScopeQuery` and the private helpers `getUserDepartmentId`, `getUserDepartmentAndChildIds`, `getChildDepartmentIds`; verify a repo-wide grep for these 5 method names returns zero matches afterward
- [x] 1.2 Confirm the management surface is untouched: `DataScopeService` still exposes `assignDataScopeToRole` / `getRoleDataScope` and still uses `PrismaService` + `NotFoundException`; verify `roles.service.ts` still injects `DataScopeService` and calls both methods

## 2. 文档边界声明

- [x] 2.1 Add an explicit boundary note to `CONTEXT.md` under the permission-cache / RBAC glossary stating data-scope is currently metadata-only and not wired into any business query

## 3. 验收

- [x] 3.1 Run `pnpm lint` and `pnpm build` and confirm they pass with no new errors (existing lint error on unchanged code is pre-existing and not introduced by this change)
- [x] 3.2 Run full unit test suite (`pnpm test`) plus the roles e2e regression and confirm green (no behavior change expected)