import { Request } from 'express';

/**
 * 客户端 IP 可信解析（harden-client-ip-trust-boundary）——
 * 「谁是客户端 IP」这一判断的**唯一所有者**。
 *
 * 旧实现 `resolveClientIp` 无条件信任 `x-forwarded-for` 首段：攻击者每次
 * 请求带随机 XFF 即可让登录限流（按 IP 计数）形同虚设，且三处调用点
 * （`@ClientInfo`、两个 log 拦截器）各自手写头猎取链、行为漂移。
 *
 * 新语义：**只认 `req.ip`** —— 它由 Express 按 `trust proxy` 配置解析：
 * - `trust proxy = false`（默认，docker 直连）：`req.ip` = 对端 socket 地址，
 *   任何伪造头都被忽略；
 * - `trust proxy = <层数/CIDR>`（部署在 nginx 等可信代理后）：`req.ip` =
 *   XFF 链中由可信代理写入的那一段。
 *
 * 因此解析正确性依赖部署拓扑声明（`SECURITY_TRUSTED_PROXY`），这是配置
 * 责任而非代码责任 —— 代码只保证"绝不越过 trust proxy 信任边界读头"。
 */

/** 回退环回地址（`::1` 归一化）。 */
export const LOOPBACK_IPV4 = '127.0.0.1';

/** 归一化 IP：`::1` 与 `::ffff:127.0.0.1` → `127.0.0.1`，去掉 IPv4-mapped 前缀。 */
export function normalizeIp(ip: string): string {
  if (ip === '::1') return LOOPBACK_IPV4;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** 客户端 IP 解析契约。 */
export interface ClientIpResolver {
  /** 从请求解析客户端 IP（可信来源：`req.ip`，缺失时安全回退）。 */
  resolve(req: Request): string;
}

/**
 * Express 实现：`req.ip` 为唯一来源。
 *
 * 回退链（仅当 `req.ip` 缺失——非 HTTP 上下文或极老中间件）：socket 对端 →
 * 环回地址。**不读任何 `x-forwarded-for` 类头**——伪造头首段不计入是本
 * module 的核心承诺（单测固化）。
 */
export class ExpressClientIpResolver implements ClientIpResolver {
  resolve(req: Request): string {
    const trusted = (req as { ip?: string }).ip;
    if (trusted && trusted.trim().length > 0) {
      return normalizeIp(trusted.trim());
    }
    const remote = (req as { socket?: { remoteAddress?: string } }).socket
      ?.remoteAddress;
    if (remote && remote.trim().length > 0) {
      return normalizeIp(remote.trim());
    }
    return LOOPBACK_IPV4;
  }
}

/** 共享单例：供无 DI 上下文的装饰器/拦截器使用。 */
export const clientIpResolver: ClientIpResolver = new ExpressClientIpResolver();

/**
 * 解析 \`SECURITY_TRUSTED_PROXY\` 配置为 Express \`trust proxy\` 值
 * （harden-client-ip-trust-boundary 1.1/2.3 的启动期校验）。
 *
 * 合法值：\`false\`/\`true\`（不区分大小写）/ 非负整数（可信代理层数）/
 * CIDR 或 IP 逗号列表（如 \`10.0.0.0/8,172.16.0.0/12\`）。默认 \`false\`。
 * 非法值（负数、非数字、空段）抛错 —— 拓扑声明错误应在启动期暴露而非
 * 运行期静默偏移信任边界。
 */
export function resolveTrustProxy(
  raw: string | undefined,
): boolean | number | string {
  const value = raw?.trim();
  if (value === undefined || value === '') return false;
  if (value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  // CIDR / IP 列表：逐段校验，允许 IPv4/IPv6 CIDR 或裸 IP
  const segments = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new Error(
      `Invalid SECURITY_TRUSTED_PROXY: '${raw}' — expected false/true/hop-count/CIDR-list`,
    );
  }
  for (const seg of segments) {
    const cidrParts = seg.split('/');
    if (cidrParts.length > 2 || !cidrParts[0] || cidrParts[0].length === 0) {
      throw new Error(`Invalid SECURITY_TRUSTED_PROXY segment: '${seg}'`);
    }
    if (cidrParts[1] !== undefined && !/^\d{1,3}$/.test(cidrParts[1])) {
      throw new Error(`Invalid SECURITY_TRUSTED_PROXY prefix: '${seg}'`);
    }
    // 必须含数字且含点或冒号（纯十六进制字母如 'abc' 不是 IP）
    if (
      !/^[0-9a-fA-F.:]+$/.test(cidrParts[0]) ||
      !/\d/.test(cidrParts[0]) ||
      !/[.:]/.test(cidrParts[0])
    ) {
      throw new Error(`Invalid SECURITY_TRUSTED_PROXY address: '${seg}'`);
    }
  }
  return segments.join(', ');
}
