import { ConfigService } from '@nestjs/config';
import { REQUEST_ID_PROP, DEFAULT_REQUEST_ID_HEADER } from './logging.constants';
import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware（corr-id seam）', () => {
  /** res mock：记录 setHeader 调用（3.1：关联 ID 回写响应头） */
  function makeRes() {
    return { setHeader: jest.fn() } as any;
  }
  const NEXT = jest.fn();

  afterEach(() => jest.clearAllMocks());

  it('外部 x-request-id 头透传同值，并回写响应头同值', () => {
    const mw = new RequestIdMiddleware(
      new ConfigService({ app: { logRequestIdHeader: 'x-request-id' } }),
    );
    const res = makeRes();
    const req: any = { headers: { 'x-request-id': 'ext-001' } };
    mw.use(req, res, NEXT);
    expect(req[REQUEST_ID_PROP]).toBe('ext-001');
    // 3.1：请求已带该头时沿用原值回写（经网关透传的链路）
    expect(res.setHeader).toHaveBeenCalledWith(
      DEFAULT_REQUEST_ID_HEADER,
      'ext-001',
    );
    expect(NEXT).toHaveBeenCalled();
  });

  it('缺失时生成 UUID 并回写响应头', () => {
    const mw = new RequestIdMiddleware(
      new ConfigService({ app: { logRequestIdHeader: 'x-request-id' } }),
    );
    const res = makeRes();
    const req: any = { headers: {} };
    mw.use(req, res, NEXT);
    expect(req[REQUEST_ID_PROP]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      DEFAULT_REQUEST_ID_HEADER,
      req[REQUEST_ID_PROP],
    );
  });

  it('已存在值时不再覆盖，响应头沿用既有值', () => {
    const mw = new RequestIdMiddleware(
      new ConfigService({ app: { logRequestIdHeader: 'x-request-id' } }),
    );
    const res = makeRes();
    const req: any = {
      headers: { 'x-request-id': 'head' },
      [REQUEST_ID_PROP]: 'keep',
    };
    mw.use(req, res, NEXT);
    expect(req[REQUEST_ID_PROP]).toBe('keep');
    expect(res.setHeader).toHaveBeenCalledWith(
      DEFAULT_REQUEST_ID_HEADER,
      'keep',
    );
  });
});
