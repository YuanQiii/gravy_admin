import * as request from 'supertest';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { createMallTestApp } from './harness';

/**
 * B2C 客户 e2e 回归网：覆盖 b2c/inquiries 与 b2c/addresses 的 HTTP 层行为。
 *
 * 与 `equipment-anonymous.e2e-spec.ts` 并列，负责跨 controller/guard/ValidationPipe
 * 的衔接断言——这些在单元测试（service 层）无法覆盖：
 * - 未登录访问 customer 写端点 → 401
 * - 请求体携带 customerId 等身份字段 → forbidNonWhitelisted 400
 * - 客户 token 通过 CustomerJwtGuard（签名 + realm==='customer'）
 * - 跨客户数据隔离（他人询价/地址 → 404）
 */

/* ── Minimal HS256 JWT signer（与 equipment-anonymous spec 一致）── */
function signCustomerJwt(customerId: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      sub: customerId,
      realm: 'customer',
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 300,
    }),
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

/** 合法后台 user token（realm==='user' + roleKeys + status），用于认证域互斥断言 */
function signUserJwt(secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      sub: 'admin-user-id',
      realm: 'user',
      roleKeys: ['super_admin'],
      status: 'enabled',
      username: 'admin',
      nickname: 'Admin',
      iat: now,
      exp: now + 300,
    }),
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

describe('B2C Customer HTTP e2e (inquiries + addresses)', () => {
  let harness: Awaited<ReturnType<typeof createMallTestApp>>;
  let tokenA: string; // 客户 A（本人）
  let secret: string;

  const lineItem = { filterId: 'flt-001', quantity: 2 };

  beforeAll(async () => {
    harness = await createMallTestApp();
    const configService = harness.module.get(ConfigService);
    secret = configService.get<string>('jwt.secret') || 'default-secret-key';
    tokenA = signCustomerJwt('cust-A', secret);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  /* ── 客户鉴权 ─────────────────────────────────────────────── */

  describe('CustomerJwtGuard', () => {
    it('有效客户 token 通过鉴权，可命中 create 端点（非 401）', async () => {
      // mock 客户存在，使 createForCustomer 的 customer 预检通过后到达 $transaction
      (harness.prisma as any).customer.findUnique.mockResolvedValue({
        customerId: 'cust-A',
        nickName: 'Alice',
        deletedAt: null,
      });
      const res = await request(harness.app.getHttpServer())
        .post('/inquiries')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: '采购滤清器', lines: [lineItem] });
      // guard 放行则非 401；此处验证鉴权链路可用（$transaction mock 返回 undefined）
      expect(res.status).not.toBe(401);
    });

    it('未登录访问 b2c/inquiries 返回 401', async () => {
      await request(harness.app.getHttpServer())
        .post('/inquiries')
        .send({ title: 'x', lines: [lineItem] })
        .expect(401);
    });

    it('未登录访问 b2c/addresses 返回 401', async () => {
      await request(harness.app.getHttpServer())
        .post('/addresses')
        .send({
          receiver: '张三',
          phone: '138',
          province: '广东',
          city: '深圳',
          detailAddress: 'xxx',
        })
        .expect(401);
    });

    it('后台 user token 打 mall 受保护路由 401（认证域互斥 D5）', async () => {
      const userToken = signUserJwt(secret);
      await request(harness.app.getHttpServer())
        .get('/inquiries')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(401);
    });

    it('软删/禁用客户 TTL 内写请求不被任何路径以可用性拦截（T6，统一不校验）', async () => {
      // 软删客户行：createForCustomer 的快照读取会拿到 deletedAt 非空的行，
      // 但 P2-3 起该读取**不做**可用性断言 → 请求正常处理，绝不 404 CUSTOMER_NOT_FOUND
      (harness.prisma as any).customer.findUnique.mockResolvedValue({
        customerId: 'cust-A',
        nickName: 'Alice',
        deletedAt: new Date('2026-01-01'), // 软删
        status: 'disabled', // 禁用
      });

      // ① 创建询价单：不再因客户可用性被拒
      const inquiryRes = await request(harness.app.getHttpServer())
        .post('/inquiries')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: '软删客户的询价', lines: [lineItem] });
      expect(inquiryRes.status).not.toBe(401);
      expect(JSON.stringify(inquiryRes.body)).not.toContain(
        'CUSTOMER_NOT_FOUND',
      );

      // ② 新增地址：本就无可用性校验（维持现状）
      const addrRes = await request(harness.app.getHttpServer())
        .post('/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          receiver: '张三',
          phone: '138',
          province: '广东',
          city: '深圳',
          detailAddress: 'xxx',
        });
      expect(addrRes.status).not.toBe(401);
      expect(JSON.stringify(addrRes.body)).not.toContain('CUSTOMER_NOT_FOUND');
    });
  });

  /* ── 请求体携带身份字段 → forbidNonWhitelisted 400 ─────────── */

  describe('Identity field injection rejected (forbidNonWhitelisted)', () => {
    it('POST /b2c/inquiries 携带 customerId 返回 400', async () => {
      await request(harness.app.getHttpServer())
        .post('/inquiries')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'x', lines: [lineItem], customerId: 'cust-B' })
        .expect(400);
    });

    it('POST /b2c/addresses 携带 customerId 返回 400', async () => {
      await request(harness.app.getHttpServer())
        .post('/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          receiver: '张三',
          phone: '138',
          province: '广东',
          city: '深圳',
          detailAddress: 'xxx',
          customerId: 'cust-B',
        })
        .expect(400);
    });
  });

  /* ── 跨客户隔离（service 归属过滤经 HTTP 可见）────────────── */

  describe('Cross-customer isolation', () => {
    it('客户 A 查询他人询价详情返回 404', async () => {
      // findFirst 返回 null → findOneForCustomer 抛 404
      (harness.prisma as any).inquiry.findFirst.mockResolvedValue(null);
      await request(harness.app.getHttpServer())
        .get('/inquiries/inq-other')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('客户 A 更新他人地址返回 404', async () => {
      // assertOwned: findUnique 返回他人地址 → 404
      (harness.prisma as any).customerAddress.findUnique.mockResolvedValue({
        addressId: 'addr-other',
        customerId: 'cust-B',
        deletedAt: null,
      });
      await request(harness.app.getHttpServer())
        .patch('/addresses/addr-other')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ receiver: '张三' })
        .expect(404);
    });
  });

  /* ── 未登录访问浏览端点（公开，不需 token）────────────────── */

  describe('Missing authorization returns 401 for write endpoints', () => {
    it('GET /b2c/addresses (private, no token) return 401', async () => {
      await request(harness.app.getHttpServer())
        .get('/addresses')
        .expect(401);
    });
    it('GET /b2c/inquiries (private, no token) return 401', async () => {
      await request(harness.app.getHttpServer())
        .get('/inquiries')
        .expect(401);
    });
  });

  describe('Non-HttpException 500 & x-request-id (P2-1b 2.2/3.2)', () => {
    it('非预期异常：500，响应头带 x-request-id；自带该头时沿用原值', async () => {
      (harness.prisma as any).inquiry.findMany.mockRejectedValue(
        new Error('boom-secret-detail'),
      );

      // 自带 x-request-id → 响应头沿用原值
      const res = await request(harness.app.getHttpServer())
        .get('/inquiries?page=1&pageSize=10')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-request-id', 'corr-e2e-001')
        .expect(500);
      expect(res.headers['x-request-id']).toBe('corr-e2e-001');

      // 不带 → 生成的 UUID 回写（非生产环境保留原始 message，泛化由单测覆盖）
      const res2 = await request(harness.app.getHttpServer())
        .get('/inquiries?page=1&pageSize=10')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(500);
      expect(res2.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(res2.body.message).toBe('boom-secret-detail');
    });

    it('成功响应同样携带 x-request-id（关联 ID 全局可用）', async () => {
      (harness.prisma as any).inquiry.findMany.mockResolvedValue([]);
      (harness.prisma as any).inquiry.count.mockResolvedValue(0);
      const res = await request(harness.app.getHttpServer())
        .get('/inquiries?page=1&pageSize=10')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });
});
