import {
  wechatUsernameCandidates,
  wechatPlaceholderPassword,
} from './wechat-identity';

describe('wechatUsernameCandidates', () => {
  it('按序产出 3 个候选：后12位 → 后24位 → 短hash', () => {
    const openid = 'openid_abcdefghijklmnopqrstuvwxyz';
    const candidates = wechatUsernameCandidates(openid);
    expect(candidates.length).toBe(3);
    expect(candidates[0]).toBe(`wx_${openid.slice(-12)}`);
    expect(candidates[1]).toBe(`wx_${openid.slice(-24)}`);
    expect(candidates[2]).toMatch(/^wx_[0-9a-f]{8}$/);
  });

  it('同一 openid 多次调用得到完全相同序列（稳定）', () => {
    const a = wechatUsernameCandidates('stable-openid-value');
    const b = wechatUsernameCandidates('stable-openid-value');
    expect(a).toEqual(b);
  });

  it('不同 openid 的首候选不同', () => {
    const a = wechatUsernameCandidates('openid-aaaa');
    const b = wechatUsernameCandidates('openid-bbbb');
    expect(a[0]).not.toBe(b[0]);
  });
});

describe('wechatPlaceholderPassword', () => {
  it('前缀为 !wx-login: 且为随机 hex', () => {
    const pwd = wechatPlaceholderPassword();
    expect(pwd.startsWith('!wx-login:')).toBe(true);
    expect(pwd.slice('!wx-login:'.length)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('不可能是明文账号登录会用到的常见密码', () => {
    const pwd = wechatPlaceholderPassword();
    expect(['123456', 'password', 'admin']).not.toContain(pwd);
  });
});