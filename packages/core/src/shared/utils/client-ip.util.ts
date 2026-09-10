/**
 * 可信头 IP 猎取链 —— 单一事实来源。
 *
 * 顺序：`x-forwarded-for` → `x-real-ip` → `x-client-ip` → `x-cluster-client-ip`
 * → 回退 `127.0.0.1`；`::1` 归一化为 `127.0.0.1`。
 * 可由 controller/service 或 logging interceptor 复用，避免各处重复实现造成行为漂移。
 */

export type HeaderSource = Record<string, string | string[] | undefined>;

function firstHeader(
  headers: HeaderSource | undefined,
  key: string,
): string | undefined {
  const value = headers?.[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * 从请求头解析客户端 IP（纯函数，不依赖请求对象）。缺省返回 `127.0.0.1`。
 */
export function resolveClientIp(headers?: HeaderSource): string {
  const candidates = [
    firstHeader(headers, 'x-forwarded-for'),
    firstHeader(headers, 'x-real-ip'),
    firstHeader(headers, 'x-client-ip'),
    firstHeader(headers, 'x-cluster-client-ip'),
  ];
  for (const ip of candidates) {
    if (ip && ip.trim().length > 0) {
      return trimIp(ip);
    }
  }
  return '127.0.0.1';
}

function trimIp(ip: string): string {
  const normalized = ip === '::1' ? '127.0.0.1' : ip;
  // `x-forwarded-for` 可能为 "client, proxy1, proxy2"，取第一个
  return normalized.split(',')[0].trim();
}