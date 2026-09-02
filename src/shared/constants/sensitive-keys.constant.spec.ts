import { Writable } from 'stream';
import pino from 'pino';
import {
  SENSITIVE_KEYS,
  buildRedactPaths,
} from './sensitive-keys.constant';

describe('SENSITIVE_KEYS 单一来源 & pino redact', () => {
  it('buildRedactPaths 覆盖默认键的精确/通配/请求头路径', () => {
    const paths = buildRedactPaths(SENSITIVE_KEYS);
    expect(paths).toContain('*.password');
    expect(paths).toContain('*.token');
    expect(paths).toContain('*.authorization');
    expect(paths).toContain('req.headers.authorization');
    expect(paths).toContain('*.secret');
  });

  it('追加 LOG_REDACT 路径后也命中', () => {
    const paths = buildRedactPaths(SENSITIVE_KEYS, ['*.idCard']);
    expect(paths).toContain('*.idCard');
  });

  it('pino 默认掩码 password/authorization，并可追加字段掩码', () => {
    const logs: any[] = [];
    const dest = new Writable({
      write(chunk, _enc, cb) {
        logs.push(JSON.parse(String(chunk)));
        cb();
      },
    });
    const logger = pino(
      { redact: { paths: buildRedactPaths(SENSITIVE_KEYS, ['*.idCard']) } },
      dest,
    );
    logger.info({
      password: 'secret1',
      authorization: 'Bearer x',
      nested: { token: 'tt' },
      idCard: '110101',
      ok: 'visible',
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].password).toBe('[Redacted]');
    expect(logs[0].authorization).toBe('[Redacted]');
    expect(logs[0].nested.token).toBe('[Redacted]');
    expect(logs[0].idCard).toBe('[Redacted]');
    expect(logs[0].ok).toBe('visible');
  });
});