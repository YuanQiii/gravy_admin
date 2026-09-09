import { ConfigService } from '@nestjs/config';
import { REQUEST_ID_PROP } from '../../logging/logging.constants';
import { OperationLogInterceptor } from './operation-log.interceptor';
import { of } from 'rxjs';

describe('OperationLogInterceptor（审计与 corr-id seam）', () => {
  const create = jest.fn().mockResolvedValue({});

  const buildInterceptor = () => {
    const prisma: any = { operationLog: { create } };
    const reflector: any = {
      getAllAndOverride: () => undefined,
    };
    const config: any = {
      get: jest.fn((key, def) => {
        if (key === 'app.oLogEnabled') return true;
        if (key === 'app.oLogMaskFields') return 'customField';
        return def;
      }),
    };
    return new OperationLogInterceptor(prisma, reflector, config);
  };

  afterEach(() => create.mockClear());

  it('write 的 requestId 与 logging module 写入的稳定属性同值', async () => {
    const req: any = {
      method: 'POST',
      headers: {},
      originalUrl: '/users',
      url: '/users',
      query: {},
      body: {},
      ip: '',
      socket: { remoteAddress: '' },
      user: { userId: 'u1', username: 'tom' },
      [REQUEST_ID_PROP]: 'req-abc-123',
    };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    const next = { handle: () => of({}) };

    await new Promise<void>((resolve) => {
      buildInterceptor()
        .intercept(context, next as any)
        .subscribe({ complete: () => setTimeout(resolve, 0) });
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.requestId).toBe('req-abc-123');
  });

  it('掩码名单含单一来源 SENSITIVE_KEYS 与 OPLOG 追加字段', async () => {
    const req: any = {
      method: 'POST',
      headers: {},
      originalUrl: '/users',
      url: '/users',
      query: { password: 'x', customField: 'y', ok: 'z' },
      body: {},
      ip: '',
      socket: { remoteAddress: '' },
      user: { userId: 'u1' },
      [REQUEST_ID_PROP]: 'r1',
    };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    const next = { handle: () => of({}) };

    await new Promise<void>((resolve) => {
      buildInterceptor()
        .intercept(context, next as any)
        .subscribe({ complete: () => setTimeout(resolve, 0) });
    });

    const data = create.mock.calls[0][0].data;
    // password 来自 SENSITIVE_KEYS 单一来源，customField 来自 OPLOG_MASK_FIELDS 追加
    expect(data.query).toEqual({ password: '***', customField: '***', ok: 'z' });
  });
});