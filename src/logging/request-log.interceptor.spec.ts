import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { REQUEST_ID_PROP } from './logging.constants';
import { RequestLogInterceptor } from './request-log.interceptor';
import { of, throwError } from 'rxjs';

describe('RequestLogInterceptor（单一 seam 三分支）', () => {
  let interceptor: RequestLogInterceptor;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const makeContext = (overrides: Record<string, any> = {}) => {
    const req: any = {
      method: 'GET',
      headers: {
        'user-agent': 'jest',
        'x-forwarded-for': '1.2.3.4',
      },
      originalUrl: '/api/items?page=1',
      url: '/api/items?page=1',
      path: '/api/items',
      route: { path: '/api/items' },
      query: { page: '1' },
      ip: '',
      socket: { remoteAddress: '9.9.9.9' },
      user: { userId: 'u1' },
      [REQUEST_ID_PROP]: 'req-123',
      body: { password: 'secret', note: 'hi' },
      ...overrides,
    };
    const res: any = { statusCode: 200, ...overrides.res };
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    };
    return { context, req, res };
  };

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    interceptor = new RequestLogInterceptor(
      new ConfigService({ app: { logSlowMs: 1000 } }),
    );
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('成功请求：只产出一条 info 访问日志，含核心字段', async () => {
    const { context } = makeContext();
    const next = { handle: () => of({ data: 1 }) };
    interceptor.intercept(context, next as any).subscribe();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const record = logSpy.mock.calls[0][0] as any;
    expect(record.msg).toBe('request completed');
    expect(record.userId).toBe('u1');
    expect(record.method).toBe('GET');
    expect(record.route).toBe('/api/items');
    expect(record.path).toBe('/api/items?page=1');
    expect(record.status).toBe(200);
    expect(record.requestId).toBe('req-123');
    expect(record.ip).toBe('1.2.3.4');
    expect(record.ua).toBe('jest');
    expect(record.query).toEqual({ page: '1' });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('慢请求：附加 body 并标记 slow', async () => {
    const { context } = makeContext();
    interceptor = new RequestLogInterceptor(
      new ConfigService({ app: { logSlowMs: 0 } }),
    );
    const next = { handle: () => of({ data: 1 }) };
    interceptor.intercept(context, next as any).subscribe();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const record = logSpy.mock.calls[0][0] as any;
    expect(record.msg).toBe('slow request');
    expect(record.slow).toBe(true);
    expect(record.body).toEqual({ password: 'secret', note: 'hi' });
  });

  it('失败请求：只产出一条 error 日志（含 stack），不再重复 info', async () => {
    const { context } = makeContext();
    const boom = new Error('boom');
    const next = { handle: () => throwError(() => boom) };
    interceptor.intercept(context, next as any).subscribe({
      error: () => undefined,
    });
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const record = errorSpy.mock.calls[0][0] as any;
    expect(record.msg).toBe('request failed');
    expect(record.status).toBe(500);
    expect(record.requestId).toBe('req-123');
  });

  it('OPTIONS 预检：不产生任何访问日志', async () => {
    const { context } = makeContext({ method: 'OPTIONS' });
    const next = { handle: () => of({}) };
    interceptor.intercept(context, next as any).subscribe();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});