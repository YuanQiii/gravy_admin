/**
 * 敏感字段名单单一来源（Sensitive-keys single source）
 *
 * 同时驱动两条独立的脱敏链路（两个 sink 的脱敏逻辑保持分开，仅名单共用）：
 *  - pino 日志 redact（stdout 掩码）：由 `buildRedactPaths(SENSITIVE_KEYS)` 派生路径规则
 *  - OperationLog 落库 mask（DB 审计）：OperationLogInterceptor 取 SENSITIVE_KEYS 与
 *    `OPLOG_MASK_FIELDS` 的并集做遮蔽
 *
 * 新增敏感字段只需改此处一处；需要「仅日志生效」的用 LOG_REDACT 追加，「仅DB生效」的
 * 用 OPLOG_MASK_FIELDS 追加。
 */
export const SENSITIVE_KEYS: string[] = [
  'password',
  'oldPassword',
  'newPassword',
  'token',
  'authorization',
  'secret',
  'captcha',
];

/** 由字段名派生出 pino redact.paths：精确键 + 任意层级通配键 */
export function buildRedactPaths(keys: string[], extraPaths: string[] = []): string[] {
  const paths = new Set<string>();
  for (const key of keys) {
    paths.add(key);
    paths.add(`*.${key}`);
    paths.add(`req.headers.${key.toLowerCase()}`);
  }
  for (const p of extraPaths) {
    paths.add(p);
    // 无论调用方传入裸名还是 *.{name}，都同时覆盖顶层与任意层级
    const name = p.replace(/^\*\./, '');
    paths.add(name);
    paths.add(`*.${name}`);
  }
  return [...paths];
}