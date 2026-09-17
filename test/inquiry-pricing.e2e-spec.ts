import * as request from 'supertest';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { createAdminTestApp, createMallTestApp } from './harness';

/**
 * 价格聚合 e2e（变更 `derive-inquiry-price-aggregates`）。
 *
 * 覆盖「HTTP 线上契约」：subtotal / totalAmount 由服务端派生后，
 * 客户端试图指定它们会得到什么，以及派生值在响应里长什么样。
 * 行小计的数值语义（null vs 0、Decimal 精确性）在纯函数单测中穷尽。
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

describe('价格聚合 e2e（Admin）', () => {
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

  describe('报价状态流转：quoted 必须携带 expiresAt', () => {
    it('PATCH status=quoted 且缺 expiresAt：400（QUOTED_REQUIRES_EXPIRES_AT）', async () => {
      const res = await request(harness.app.getHttpServer())
        .patch('/inquiry/inquiries/inq-001/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'quoted' });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain(
        'QUOTED_REQUIRES_EXPIRES_AT',
      );
      expect(
        (harness.prisma as any).inquiry.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('PATCH status=quoted 且携带 expiresAt：200（流转走接缝）', async () => {
      (harness.prisma as any).inquiry.findUnique.mockResolvedValue({
        inquiryId: 'inq-001',
        inquiryNo: 'INQ202609-000001',
        status: 'submitted',
        deletedAt: null,
        submittedAt: new Date(),
        quotedAt: null,
        cancelledAt: null,
      });
      (harness.prisma as any).inquiry.updateMany.mockResolvedValue({
        count: 1,
      });
      (harness.prisma as any).inquiry.findUnique.mockResolvedValueOnce({
        inquiryId: 'inq-001',
        inquiryNo: 'INQ202609-000001',
        status: 'submitted',
        deletedAt: null,
        submittedAt: new Date(),
        quotedAt: null,
        cancelledAt: null,
      });
      (harness.prisma as any).inquiry.updateMany.mockResolvedValue({
        count: 1,
      });
      (harness.prisma as any).inquiry.findUnique.mockResolvedValue({
        inquiryId: 'inq-001',
        inquiryNo: 'INQ202609-000001',
        status: 'quoted',
        deletedAt: null,
        submittedAt: new Date(),
        quotedAt: new Date(),
        cancelledAt: null,
        expiresAt: new Date('2026-12-31'),
      });
      (harness.prisma as any).inquiryLine.aggregate.mockResolvedValue({
        _sum: { subtotal: '50.00' },
      });

      const res = await request(harness.app.getHttpServer())
        .patch('/inquiry/inquiries/inq-001/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'quoted', expiresAt: '2026-12-31' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('quoted');
      expect(res.body.data.isExpired).toBe(false);
      // 条件写必须带期望状态
      const where = (harness.prisma as any).inquiry.updateMany.mock.calls[0][0]
        .where;
      expect(where.status).toBe('submitted');
      // 报价动作须同事务重算合计
      expect((harness.prisma as any).inquiryLine.aggregate).toHaveBeenCalled();
    });
  });

  describe('明细行：subtotal 派生', () => {
    it('创建明细行：subtotal = quantity × unitPrice，并重算整单合计', async () => {
      (harness.prisma as any).inquiry.findUnique.mockResolvedValue({
        inquiryId: 'inq-001',
        deletedAt: null,
      });
      (harness.prisma as any).inquiryLine.create.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve({ inquiryLineId: 'line-1', ...args.data }),
      );
      (harness.prisma as any).inquiryLine.aggregate.mockResolvedValue({
        _sum: { subtotal: '50.00' },
      });

      const res = await request(harness.app.getHttpServer())
        .post('/inquiry/inquiry-lines')
        .set('Authorization', `Bearer ${token}`)
        .send({
          inquiryId: 'inq-001',
          productName: '手工填写件',
          quantity: 4,
          unitPrice: 12.5,
        })
        .expect(201);

      // 派生值出现在响应中（4 × 12.50 = 50）
      expect(Number(res.body.data.subtotal)).toBe(50);
      // 合计重算发生在同一事务的写入之后
      expect((harness.prisma as any).inquiry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { inquiryId: 'inq-001' },
          data: { totalAmount: '50.00' },
        }),
      );
    });

    it('请求体携带 subtotal：400（服务端派生字段不接受客户端指定）', async () => {
      const res = await request(harness.app.getHttpServer())
        .post('/inquiry/inquiry-lines')
        .set('Authorization', `Bearer ${token}`)
        .send({
          inquiryId: 'inq-001',
          productName: '手工填写件',
          subtotal: 999,
        });

      expect(res.status).toBe(400);
      expect((harness.prisma as any).inquiryLine.create).not.toHaveBeenCalled();
    });
  });

  describe('询价单：创建期字段在更新端点不可变（W1 + 派生合计）', () => {
    const CURRENT = {
      inquiryId: 'inq-001',
      deletedAt: null,
      status: 'draft',
      shippingAddressId: 'addr-1',
      shippingReceiver: '张三',
      totalAmount: null,
    };

    it('PATCH 携带 shippingAddressId：400，单据未被改写', async () => {
      (harness.prisma as any).inquiry.findUnique.mockResolvedValue(CURRENT);

      const res = await request(harness.app.getHttpServer())
        .patch('/inquiry/inquiries/inq-001')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '改标题', shippingAddressId: 'addr-OTHER' });

      expect(res.status).toBe(400);
      // 未发生任何写入 —— 引用与快照不可能被换掉
      expect((harness.prisma as any).inquiry.update).not.toHaveBeenCalled();
    });

    it('PATCH 携带 totalAmount：400，合计未被改写', async () => {
      (harness.prisma as any).inquiry.findUnique.mockResolvedValue(CURRENT);

      const res = await request(harness.app.getHttpServer())
        .patch('/inquiry/inquiries/inq-001')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '改标题', totalAmount: 1 });

      expect(res.status).toBe(400);
      expect((harness.prisma as any).inquiry.update).not.toHaveBeenCalled();
    });
  });
});

describe('价格聚合 e2e（Mall）', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('客户创建询价单携带 totalAmount：400', async () => {
    (harness.prisma as any).customer.findUnique.mockResolvedValue({
      customerId: 'cust-A',
      deletedAt: null,
      nickName: 'Alice',
    });

    const res = await request(harness.app.getHttpServer())
      .post('/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '采购', lines: [{ productName: 'x' }], totalAmount: 1 });

    expect(res.status).toBe(400);
    expect((harness.prisma as any).inquiry.create).not.toHaveBeenCalled();
  });
});
