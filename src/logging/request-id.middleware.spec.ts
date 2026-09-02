import { ConfigService } from '@nestjs/config';
import { REQUEST_ID_PROP } from './logging.constants';
import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware（corr-id seam）', () => {
  const RES = {} as any;
  const NEXT = jest.fn();

  afterEach(() => jest.clearAllMocks());

  it('外部 x-request-id 头透传同值', () => {
    const mw = new RequestIdMiddleware(
      new ConfigService({ app: { logRequestIdHeader: 'x-request-id' } }),
    );
    const req: any = { headers: { 'x-request-id': 'ext-001' } };
    mw.use(req, RES, NEXT);
    expect(req[REQUEST_ID_PROP]).toBe('ext-001');
    expect(NEXT).toHaveBeenCalled();
  });

  it('缺失时生成 UUID', () => {
    const mw = new RequestIdMiddleware(
      new ConfigService({ app: { logRequestIdHeader: 'x-request-id' } }),
    );
    const req: any = { headers: {} };
    mw.use(req, RES, NEXT);
    expect(req[REQUEST_ID_PROP]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('已存在值时不再覆盖', () => {
    const mw = new RequestIdMiddleware(
      new ConfigService({ app: { logRequestIdHeader: 'x-request-id' } }),
    );
    const req: any = { headers: { 'x-request-id': 'head' }, [REQUEST_ID_PROP]: 'keep' };
    mw.use(req, RES, NEXT);
    expect(req[REQUEST_ID_PROP]).toBe('keep');
  });
});