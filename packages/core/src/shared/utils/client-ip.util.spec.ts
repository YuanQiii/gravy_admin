import { resolveClientIp } from './client-ip.util';

describe('resolveClientIp', () => {
  it('按可信头顺序优先取 x-forwarded-for', () => {
    const headers = {
      'x-forwarded-for': '203.0.113.1',
      'x-real-ip': '198.51.100.2',
    };
    expect(resolveClientIp(headers)).toBe('203.0.113.1');
  });

  it('x-forwarded-for 缺失时回退 x-real-ip / x-client-ip / x-cluster-client-ip', () => {
    expect(resolveClientIp({ 'x-real-ip': '198.51.100.3' })).toBe(
      '198.51.100.3',
    );
    expect(resolveClientIp({ 'x-client-ip': '198.51.100.4' })).toBe(
      '198.51.100.4',
    );
    expect(resolveClientIp({ 'x-cluster-client-ip': '198.51.100.5' })).toBe(
      '198.51.100.5',
    );
  });

  it('无任何可信头时回退默认 127.0.0.1', () => {
    expect(resolveClientIp(undefined)).toBe('127.0.0.1');
    expect(resolveClientIp({})).toBe('127.0.0.1');
  });

  it('::1 归一化为 127.0.0.1', () => {
    expect(resolveClientIp({ 'x-real-ip': '::1' })).toBe('127.0.0.1');
  });

  it('x-forwarded-for 多级代理取第一个', () => {
    expect(
      resolveClientIp({ 'x-forwarded-for': '203.0.113.1, 198.51.100.2' }),
    ).toBe('203.0.113.1');
  });
});