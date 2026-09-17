import * as request from 'supertest';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { createAdminTestApp, createMallTestApp } from './harness';

/**
 * 收货地址快照 e2e（变更 `snapshot-inquiry-shipping-address`）。
 *
 * 覆盖「HTTP 线上形状 + 跨请求的持久性」这一层 —— 单测证不了的部分：
 * 响应经 DTO 投影 + ResponseInterceptor 之后客户/后台实际收到的 JSON，
 * 以及「地址被删除后重新查询」这条只有跨越两次请求才能观察的稳态。
 *
 * harness 用 mock prisma、没有真实 Postgres，因此「地址删除 → 外键 SetNull」
 * 用行数据模拟（返回 `shippingAddressId: null` 且快照仍在的行）；快照回填与
 * 外键行为的真实库验证见变更 tasks 5.4（需本地 dev 库）。
 */
function signJwt(payload: Record<string, unknown>, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: now, exp: now + 300 }),
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

/** 快照字段的线上期望值（与下面 addressRow 的值一一对应） */
const SNAPSHOT_EXPECTED = {
  shippingReceiver: '张三',
  shippingPhone: '13800000001',
  shippingProvince: '江苏省',
  shippingCity: '无锡市',
  shippingDistrict: '滨湖区',
  shippingDetailAddress: '太湖大道 100 号',
  shippingZipCode: '214000',
};

/** 地址行（resolveShippingSnapshot 的 select 形状） */
const addressRow = (over: Record<string, unknown> = {}) => ({
  customerId: 'cust-A',
  deletedAt: null,
  receiver: SNAPSHOT_EXPECTED.shippingReceiver,
  phone: SNAPSHOT_EXPECTED.shippingPhone,
  province: SNAPSHOT_EXPECTED.shippingProvince,
  city: SNAPSHOT_EXPECTED.shippingCity,
  district: SNAPSHOT_EXPECTED.shippingDistrict,
  detailAddress: SNAPSHOT_EXPECTED.shippingDetailAddress,
  zipCode: SNAPSHOT_EXPECTED.shippingZipCode,
  ...over,
});

const BASE_INFO_ROW = {
  id: 7,
  inquiryId: 'inq-001',
  inquiryNo: 'INQ202609-000001',
  title: '采购 320D 液压滤清器',
  description: null,
  status: 'draft',
  customerName: 'Alice',
  customerEmail: null,
  customerPhone: null,
  totalAmount: null,
  customerId: 'cust-A',
  createdById: null,
  shippingAddressId: 'addr-own',
  submittedAt: null,
  quotedAt: null,
  expiresAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  deletedAt: null,
};

const LINE_ITEM = { filterId: 'flt-001', quantity: 2 };

describe('收货地址快照 e2e（Mall 客户路径）', () => {
  let harness: Awaited<ReturnType<typeof createMallTestApp>>;
  let token: string;

  beforeAll(async () => {
    harness = await createMallTestApp();
    const secret =
      harness.module.get(ConfigService).get<string>('jwt.secret') ||
      'default-secret-key';
    token = signJwt(
      { sub: 'cust-A', realm: 'customer', jti: crypto.randomUUID() },
      secret,
    );
  });

  afterAll(async () => {
    await harness.app.close();
  });

  // 清掉上一个用例的调用记录（保留 mockResolvedValue / mockImplementation，
  // 因此 harness 的 READ_DEFAULTS 仍在）；否则「不应被调用」这类否定断言会串味。
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** 让 `inquiry.create` 回显写入的数据（真实 DB 亦如此返回整行） */
  const echoCreate = () => {
    (harness.prisma as any).inquiry.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...BASE_INFO_ROW, ...args.data }),
    );
  };

  const mockCustomer = () =>
    (harness.prisma as any).customer.findUnique.mockResolvedValue({
      customerId: 'cust-A',
      deletedAt: null,
      nickName: 'Alice',
      email: 'alice@example.com',
      phoneNumber: '13800000000',
    });

  const mockFilter = () =>
    (harness.prisma as any).filter.findMany.mockResolvedValue([
      { filterId: 'flt-001', model: '320D', typeName: 'Hydraulic' },
    ]);

  it('①客户创建带地址的询价单：响应携带 7 个快照字段', async () => {
    mockCustomer();
    mockFilter();
    echoCreate();
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue(null);
    (harness.prisma as any).customerAddress.findUnique.mockResolvedValue(
      addressRow(),
    );

    const res = await request(harness.app.getHttpServer())
      .post('/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '采购 320D', lines: [LINE_ITEM], shippingAddressId: 'addr-own' })
      .expect(201);

    expect(res.body.data.shippingAddressId).toBe('addr-own');
    expect(res.body.data).toEqual(
      expect.objectContaining(SNAPSHOT_EXPECTED),
    );
  });

  it('①详情端点回显快照（列表与详情同一形状）', async () => {
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue({
      ...BASE_INFO_ROW,
      ...SNAPSHOT_EXPECTED,
      inquiryLines: [],
    });

    const res = await request(harness.app.getHttpServer())
      .get('/inquiries/inq-001')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toEqual(expect.objectContaining(SNAPSHOT_EXPECTED));
  });

  it('②地址被删除后：引用为 null，快照仍完整（信息不丢失）', async () => {
    // 地址硬删 → 外键 ON DELETE SET NULL 把引用置空；快照是创建时点冻结的，不受影响
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue({
      ...BASE_INFO_ROW,
      shippingAddressId: null,
      ...SNAPSHOT_EXPECTED,
      inquiryLines: [],
    });

    const res = await request(harness.app.getHttpServer())
      .get('/inquiries/inq-001')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.shippingAddressId).toBeNull();
    expect(res.body.data).toEqual(expect.objectContaining(SNAPSHOT_EXPECTED));
  });

  it('③请求体携带快照字段：400（服务端派生字段不接受客户端指定）', async () => {
    const res = await request(harness.app.getHttpServer())
      .post('/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '采购 320D',
        lines: [LINE_ITEM],
        shippingReceiver: '伪造收货人',
      });

    expect(res.status).toBe(400);
    expect((harness.prisma as any).inquiry.create).not.toHaveBeenCalled();
  });

  it('地址不存在：400 而非 500（原先会落到外键错误）', async () => {
    mockCustomer();
    mockFilter();
    (harness.prisma as any).customerAddress.findUnique.mockResolvedValue(null);

    const res = await request(harness.app.getHttpServer())
      .post('/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '采购 320D',
        lines: [LINE_ITEM],
        shippingAddressId: 'addr-gone',
      });

    expect(res.status).toBe(400);
  });

  it('地址属于他人：400（归属断言在快照读取内）', async () => {
    mockCustomer();
    mockFilter();
    (harness.prisma as any).customerAddress.findUnique.mockResolvedValue(
      addressRow({ customerId: 'cust-B' }),
    );

    const res = await request(harness.app.getHttpServer())
      .post('/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '采购 320D',
        lines: [LINE_ITEM],
        shippingAddressId: 'addr-other',
      });

    expect(res.status).toBe(400);
  });

  it('不提供地址：快照字段为 null（字段在场、不是缺字段）', async () => {
    mockCustomer();
    mockFilter();
    echoCreate();
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue(null);
    (harness.prisma as any).customerAddress.findUnique.mockResolvedValue(null);
    (harness.prisma as any).inquiry.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...BASE_INFO_ROW,
          shippingAddressId: null,
          ...Object.fromEntries(
            Object.keys(SNAPSHOT_EXPECTED).map((k) => [k, null]),
          ),
          ...args.data,
        }),
    );

    const res = await request(harness.app.getHttpServer())
      .post('/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '采购 320D', lines: [LINE_ITEM] })
      .expect(201);

    for (const key of Object.keys(SNAPSHOT_EXPECTED)) {
      expect(res.body.data).toHaveProperty(key, null);
    }
    // 未提供地址时不应读取地址表
    expect(
      (harness.prisma as any).customerAddress.findUnique,
    ).not.toHaveBeenCalled();
  });
});

describe('收货地址快照 e2e（Admin 管理端路径）', () => {
  let harness: Awaited<ReturnType<typeof createAdminTestApp>>;
  let token: string;

  beforeAll(async () => {
    harness = await createAdminTestApp();
    const secret =
      harness.module.get(ConfigService).get<string>('jwt.secret') ||
      'default-secret-key';
    token = signJwt(
      {
        sub: 'admin-user-id',
        realm: 'user',
        roleKeys: ['super_admin'],
        status: 'enabled',
        username: 'admin',
        jti: crypto.randomUUID(),
      },
      secret,
    );
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('管理端创建同样写入快照', async () => {
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue(null);
    (harness.prisma as any).customerAddress.findUnique.mockResolvedValue(
      addressRow(),
    );
    (harness.prisma as any).inquiry.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...BASE_INFO_ROW,
          createdById: 'admin-user-id',
          ...args.data,
        }),
    );

    const res = await request(harness.app.getHttpServer())
      .post('/inquiry/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '代客下单',
        customerId: 'cust-A',
        shippingAddressId: 'addr-own',
      })
      .expect(201);

    expect(res.body.data).toEqual(expect.objectContaining(SNAPSHOT_EXPECTED));

    const data = (harness.prisma as any).inquiry.create.mock.calls.at(-1)[0]
      .data;
    expect(data).toEqual(
      expect.objectContaining({
        shippingAddressId: 'addr-own',
        ...SNAPSHOT_EXPECTED,
      }),
    );
  });

  it('管理端传入不存在的地址：400 而非 500', async () => {
    (harness.prisma as any).customerAddress.findUnique.mockResolvedValue(null);

    const res = await request(harness.app.getHttpServer())
      .post('/inquiry/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '代客下单',
        customerId: 'cust-A',
        shippingAddressId: 'addr-gone',
      });

    expect(res.status).toBe(400);
  });

  it('管理端错挂他人地址：400（归属校验在事务内接缝）', async () => {
    (harness.prisma as any).customerAddress.findUnique.mockResolvedValue(
      addressRow({ customerId: 'cust-OTHER' }),
    );

    const res = await request(harness.app.getHttpServer())
      .post('/inquiry/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '代客下单',
        customerId: 'cust-A',
        shippingAddressId: 'addr-other-customer',
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('INVALID_SHIPPING_ADDRESS');
    expect((harness.prisma as any).inquiry.create).not.toHaveBeenCalled();
  });

  it('管理端仅传地址不传客户：400（DTO 跨字段约束，未到 service）', async () => {
    const res = await request(harness.app.getHttpServer())
      .post('/inquiry/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '代客下单', shippingAddressId: 'addr-own' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(
      'SHIPPING_ADDRESS_REQUIRES_CUSTOMER',
    );
    expect(
      (harness.prisma as any).customerAddress.findUnique,
    ).not.toHaveBeenCalled();
  });

  it('管理端请求体携带快照字段：400', async () => {
    const res = await request(harness.app.getHttpServer())
      .post('/inquiry/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '代客下单', shippingZipCode: '214000' });

    expect(res.status).toBe(400);
  });
});
