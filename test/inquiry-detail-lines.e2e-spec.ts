import * as request from 'supertest';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createAdminTestApp, createMallTestApp } from './harness';

/**
 * 询价单详情明细行 e2e（变更 `expose-inquiry-lines-in-detail`）。
 *
 * 覆盖规格契约中「HTTP 线上形状」这一层 —— 单元测试证不了的部分：
 * 响应经过 DTO 投影 + ResponseInterceptor 之后，客户/后台实际收到的 JSON
 * 是什么形状。
 *
 * 关于排序与软删过滤：两者由详情读取形状（`INQUIRY_DETAIL_INCLUDE` 的
 * `orderBy` / `where`）在 SQL 侧完成，本 harness 用 mock prisma、没有真实
 * Postgres，因此这里断言的是「投影不重排行、不引入额外过滤」，SQL 侧的
 * 形状断言见 `inquiries.service.spec.ts` 的接缝用例。
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

const line = (over: Record<string, unknown>) => ({
  id: 11,
  inquiryLineId: 'line-1',
  inquiryId: 'inq-001',
  filterId: 'flt-001',
  productName: 'OF-100',
  model: 'OF-100',
  typeName: 'oil',
  quantity: 1,
  unitPrice: new Prisma.Decimal('12.50'),
  subtotal: new Prisma.Decimal('12.50'),
  remarks: null,
  sortOrder: 1,
  createdById: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  deletedAt: null,
  ...over,
});

const DETAIL_ROW = {
  id: 7,
  inquiryId: 'inq-001',
  inquiryNo: 'INQ202609-0001',
  title: '采购 320D 液压滤清器',
  description: null,
  status: 'quoted',
  customerName: 'Alice',
  customerEmail: null,
  customerPhone: null,
  totalAmount: new Prisma.Decimal('12.50'),
  customerId: 'cust-A',
  createdById: null,
  shippingAddressId: null,
  submittedAt: new Date('2026-09-01T00:00:00Z'),
  quotedAt: new Date('2026-09-02T00:00:00Z'),
  expiresAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-02T00:00:00Z'),
  deletedAt: null,
  inquiryLines: [
    line({ id: 11, inquiryLineId: 'line-1', sortOrder: 1 }),
    line({
      id: 12,
      inquiryLineId: 'line-2',
      productName: '手工填写件',
      model: null,
      typeName: null,
      quantity: 4,
      unitPrice: null,
      subtotal: null,
      remarks: '未报价',
      sortOrder: 2,
    }),
  ],
};

describe('询价单详情明细行 e2e（Mall）', () => {
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

  it('5.1 已报价详情：携带明细行，且 unitPrice/subtotal 为 JSON number', async () => {
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue(DETAIL_ROW);

    const res = await request(harness.app.getHttpServer())
      .get('/inquiries/inq-001')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    expect(data.status).toBe('quoted');
    expect(data.inquiryLines).toHaveLength(2);
    expect(typeof data.inquiryLines[0].unitPrice).toBe('number');
    expect(data.inquiryLines[0].unitPrice).toBe(12.5);
    expect(typeof data.inquiryLines[0].subtotal).toBe('number');
    expect(data.inquiryLines[0].productName).toBe('OF-100');
  });

  it('5.2 未报价明细行：金额为 null（非 0、字段存在）', async () => {
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue(DETAIL_ROW);

    const res = await request(harness.app.getHttpServer())
      .get('/inquiries/inq-001')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const unquoted = res.body.data.inquiryLines[1];
    expect(unquoted.productName).toBe('手工填写件');
    expect(unquoted.quantity).toBe(4);
    expect(unquoted).toHaveProperty('unitPrice', null);
    expect(unquoted).toHaveProperty('subtotal', null);
    expect(unquoted.unitPrice).not.toBe(0);
  });

  it('5.3 投影不重排行（顺序即查询顺序），且自增 id 不出现在线上', async () => {
    const reversed = {
      ...DETAIL_ROW,
      inquiryLines: [...DETAIL_ROW.inquiryLines].reverse(),
    };
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue(reversed);

    const res = await request(harness.app.getHttpServer())
      .get('/inquiries/inq-001')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;
    expect(data.inquiryLines.map((l: any) => l.inquiryLineId)).toEqual([
      'line-2',
      'line-1',
    ]);
    expect(data).not.toHaveProperty('id');
    expect(data.inquiryLines[0]).not.toHaveProperty('id');
  });

  it('5.4 列表端点不携带 inquiryLines', async () => {
    (harness.prisma as any).inquiry.findMany.mockResolvedValue([
      { ...DETAIL_ROW, inquiryLines: undefined },
    ]);
    (harness.prisma as any).inquiry.count.mockResolvedValue(1);

    const res = await request(harness.app.getHttpServer())
      .get('/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).not.toHaveProperty('inquiryLines');
  });

  it('5.4 写端点（submit）响应不携带 inquiryLines', async () => {
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue({
      ...DETAIL_ROW,
      status: 'draft',
    });
    // 状态流转已改为「条件写 + 回读」接缝（atomic-inquiry-status-transition），
    // 不再调用 inquiry.update
    (harness.prisma as any).inquiry.updateMany.mockResolvedValue({ count: 1 });
    (harness.prisma as any).inquiry.findUnique.mockResolvedValue({
      ...DETAIL_ROW,
      status: 'submitted',
      inquiryLines: undefined,
    });

    // 成功路径不经 HttpExceptionFilter，POST 保留框架默认 201；此处只关心响应体形状
    const res = await request(harness.app.getHttpServer())
      .post('/inquiries/inq-001/submit')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data).not.toHaveProperty('inquiryLines');
  });
});

describe('询价单详情明细行 e2e（Admin）', () => {
  let harness: Awaited<ReturnType<typeof createAdminTestApp>>;
  let userToken: string;

  beforeAll(async () => {
    harness = await createAdminTestApp();
    const secret =
      harness.module.get(ConfigService).get<string>('jwt.secret') ||
      'default-secret-key';
    userToken = signJwt(
      {
        sub: 'admin-user-id',
        realm: 'user',
        roleKeys: ['super_admin'],
        status: 'enabled',
        username: 'admin',
        nickname: 'Admin',
      },
      secret,
    );
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('Admin 详情端点同样携带明细行（权限码与路由不变）', async () => {
    (harness.prisma as any).inquiry.findUnique.mockResolvedValue(DETAIL_ROW);

    const res = await request(harness.app.getHttpServer())
      .get('/inquiry/inquiries/inq-001')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.data.inquiryLines).toHaveLength(2);
    expect(typeof res.body.data.inquiryLines[0].unitPrice).toBe('number');
  });

  it('5.5 Admin 明细行端点的 unitPrice/subtotal 为 number（与全仓 Decimal 规则一致）', async () => {
    (harness.prisma as any).inquiryLine.findMany.mockResolvedValue([
      line({ id: 11, inquiryLineId: 'line-1' }),
    ]);
    (harness.prisma as any).inquiryLine.count.mockResolvedValue(1);

    const res = await request(harness.app.getHttpServer())
      .get('/inquiry/inquiry-lines?inquiryId=inq-001')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const first = res.body.data.items[0];
    expect(typeof first.unitPrice).toBe('number');
    expect(first.unitPrice).toBe(12.5);
    expect(typeof first.subtotal).toBe('number');
  });
});
