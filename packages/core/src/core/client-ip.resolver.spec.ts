import { ExpressClientIpResolver, normalizeIp, resolveTrustProxy, LOOPBACK_IPV4 } from './client-ip.resolver';

/**
 * ClientIpResolver 单测（harden-client-ip-trust-boundary 2.1）。
 *
 * 解析只信 \`req.ip\`（Express 按 trust proxy 配置产出）—— 伪造的
 * \`x-forwarded-for\` 首段**不计入**是本 module 的核心承诺，与
 * \`resolveTrustProxy\` 的启动期校验共同构成信任边界。
 */
describe('ExpressClientIpResolver', () => {
  const resolver = new ExpressClientIpResolver();

  function fakeReq(ip?: string, remoteAddress?: string) {
    return {
      ip,
      socket: { remoteAddress },
      headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' },
    } as never;
  }

  it('req.ip 存在 → 原样归一化返回', () => {
    expect(resolver.resolve(fakeReq('203.0.113.7'))).toBe('203.0.113.7');
  });

  it('::1 归一化为 127.0.0.1（2.1）', () => {
    expect(resolver.resolve(fakeReq('::1'))).toBe('127.0.0.1');
  });

  it('IPv4-mapped 前缀去除', () => {
    expect(resolver.resolve(fakeReq('::ffff:203.0.113.7'))).toBe(
      '203.0.113.7',
    );
  });

  it('req.ip 缺失 → 回退 socket remoteAddress', () => {
    expect(resolver.resolve(fakeReq(undefined, '192.168.1.9'))).toBe(
      '192.168.1.9',
    );
  });

  it('req.ip 与 socket 均缺失 → 127.0.0.1 安全回退', () => {
    expect(resolver.resolve(fakeReq())).toBe(LOOPBACK_IPV4);
  });

  it('伪造 X-Forwarded-For 首段不计入（即使 req.ip 为空）', () => {
    // 回退走 socket，绝不会读转发头 —— 攻击者带随机 XFF 不能改变解析结果
    expect(resolver.resolve(fakeReq(undefined, '10.0.0.5'))).toBe('10.0.0.5');
    expect(resolver.resolve(fakeReq('10.0.0.5'))).not.toBe('9.9.9.9');
  });
});

describe('resolveTrustProxy（启动期校验 2.3）', () => {
  it('默认/空/false → false（不信任任何代理头）', () => {
    expect(resolveTrustProxy(undefined)).toBe(false);
    expect(resolveTrustProxy('')).toBe(false);
    expect(resolveTrustProxy('false')).toBe(false);
    expect(resolveTrustProxy('False')).toBe(false);
  });

  it('true → true', () => {
    expect(resolveTrustProxy('true')).toBe(true);
  });

  it('非负整数 → 层数（数字）', () => {
    expect(resolveTrustProxy('1')).toBe(1);
    expect(resolveTrustProxy('0')).toBe(0);
  });

  it('CIDR / IP 逗号列表 → 规范化字符串', () => {
    expect(resolveTrustProxy('10.0.0.0/8,172.16.0.0/12')).toBe(
      '10.0.0.0/8, 172.16.0.0/12',
    );
    expect(resolveTrustProxy('127.0.0.1')).toBe('127.0.0.1');
  });

  it('非法值启动期报错（负数/非数字/空段）', () => {
    expect(() => resolveTrustProxy('-1')).toThrow();
    expect(() => resolveTrustProxy('abc')).toThrow();
    expect(() => resolveTrustProxy('10.0.0.0/')).toThrow();
    expect(() => resolveTrustProxy('10.0.0.0/8,,junk!')).toThrow();
  });
});

describe('normalizeIp', () => {
  it('::1 与 ::ffff: 前缀', () => {
    expect(normalizeIp('::1')).toBe('127.0.0.1');
    expect(normalizeIp('::ffff:10.1.2.3')).toBe('10.1.2.3');
    expect(normalizeIp('10.1.2.3')).toBe('10.1.2.3');
  });
});
