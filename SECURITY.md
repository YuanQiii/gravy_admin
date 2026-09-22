# 安全政策

## 支持的版本

安全修复只针对 `main` 分支的最新提交（本仓库以滚动方式维护，不提供长期支持分支）。

## 上报漏洞

**不要为安全问题开公开 issue。** 请用任一私密渠道：

- GitHub 仓库页 → **Security** → **Report a vulnerability**（私密安全公告，推荐）
- 若该入口不可用，请直接联系仓库维护者（不通过公开渠道）

上报时请尽量包含：受影响的端点或文件、复现步骤、影响面（未授权访问 / 数据泄露 / 越权 / 拒绝服务）、以及你已有的判断。**请不要在报告里粘贴真实生产凭据**——用脱敏示例代替即可。

我们会在确认后回复处理计划；修复发布前请勿公开细节。

## 本仓库已知的敏感面（务必先读）

以下是**当前仍然存在**的现状，不是"已修"，报告前请先了解它们，避免重复上报：

### 1. 环境变量文件已入库（9 个）

根目录与两个应用下各 3 个：

```
.env.development   .env.production   .env.test
apps/admin/.env.development   apps/admin/.env.production   apps/admin/.env.test
apps/mall/.env.development    apps/mall/.env.production    apps/mall/.env.test
```

（`.env.example` 属有意入库；`.env`、`.env.e2e` 未入库。`.gitignore` 目前只忽略 `.env` 与 `.env.*.local`。）

复核：`git ls-files | grep "\.env"`

### 2. 生产 JWT 密钥与开发环境未分离

根、`apps/admin`、`apps/mall` **三处 `.env.production` 的 `JWT_SECRET` 都与各自 `.env.development` 完全相同**（`POSTGRES_PASSWORD` 三处均已分离）。

**影响**：若本仓库为公开仓库，等于生产环境的 token 签名密钥公开——任何人都能签发被接受的 access / refresh token。

**为什么还没修**：轮换密钥需要与应用部署同步，且**仅删除当前文件不足以消除暴露**（git 历史会被索引）。处置需要三步并举：轮换密钥 → 把 `.env.*` 移出仓库并改用注入 → 按需清理历史。这是一项独立事项，未包含在文档体系重构变更中。

复核：逐键比对三处 `.env.production` 与同目录 `.env.development` 的同名键是否相同。

### 3. 上报时请勿做的事

- 不要为验证漏洞而对接生产环境或使用真实用户数据
- 不要在公开渠道（issue / PR / 讨论区）披露细节
- 不要提交任何形式的真实凭据（含截图）
