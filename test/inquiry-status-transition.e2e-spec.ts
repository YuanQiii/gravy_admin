import * as request from 'supertest';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { createMallTestApp } from './harness';

/**
 * 询价单状态流转 e2e（变更 `atomic-inquiry-status-transition`）。
 *
 * 覆盖「HTTP 层」这一层：条件写 + 归因重读的产物是 200/404/409 中的一个，
 * 且失效更新**不写入任何字段**（单测能看到 `updateMany` 的调用面，但看不到
 * 最终对客户端暴露的状态码与错误码）。
 *
 * 关于"并发"：真实交错无法在顺序 HTTP 中复现。这里的做法是让第二次请求读到
 * **陈旧的状态视图**（`findFirst` 首次返回 draft），而条件写影响 0 行
 * （此时库中已是 submitted）—— 这与并发 submit × cancel 的可观测结果等价。
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

const baseRow = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 7,
  inquiryId: 'inq-001',
  inquiryNo: 'INQ202609-0001',
  title: '采购 320D 液压滤清器',
  description: null,
  status,
  customerName: 'Alice',
  customerEmail: null,
  customerPhone: null,
  totalAmount: null,
  customerId: 'cust-A',
  createdById: null,
  shippingAddressId: null,
  shippingReceiver: null,
  shippingPhone: null,
  shippingProvince: null,
  shippingCity: null,
  shippingDistrict: null,
  shippingDetailAddress: null,
  shippingZipCode: null,
  submittedAt: null,
  quotedAt: null,
  expiresAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  deletedAt: null,
  inquiryLines: [],
  ...extra,
});

describe('询价单状态流转 e2e（Mall）', () => {
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

  it('submit：draft → submitted 成功', async () => {
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue(
      baseRow('draft'),
    );
    (harness.prisma as any).inquiry.updateMany.mockResolvedValue({ count: 1 });
    (harness.prisma as any).inquiry.findUnique.mockResolvedValue(
      baseRow('submitted', { submittedAt: new Date() }),
    );

    const res = await request(harness.app.getHttpServer())
      .post('/inquiries/inq-001/submit')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(res.body.data.status).toBe('submitted');
  });

  it('重复 submit：已 submitted 再提交 → 409，且不触达写入', async () => {
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue(
      baseRow('submitted'),
    );

    const res = await request(harness.app.getHttpServer())
      .post('/inquiries/inq-001/submit')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain(
      'INQUIRY_INVALID_STATUS_TRANSITION',
    );
    expect((harness.prisma as any).inquiry.updateMany).not.toHaveBeenCalled();
  });

  it('并发 submit × cancel：后到者 409，且详情中状态与时间戳不矛盾', async () => {
    // 请求 A（submit）：读到 draft，条件写命中 1 行
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue(
      baseRow('draft'),
    );
    (harness.prisma as any).inquiry.updateMany.mockResolvedValue({ count: 1 });
    (harness.prisma as any).inquiry.findUnique.mockResolvedValue(
      baseRow('submitted', { submittedAt: new Date() }),
    );

    const first = await request(harness.app.getHttpServer())
      .post('/inquiries/inq-001/submit')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(first.body.data.status).toBe('submitted');

    // 请求 B（cancel）：仍持有 draft 的陈旧视图 → 条件写影响 0 行 → 归因重读发现已 submitted
    (harness.prisma as any).inquiry.findFirst
      .mockResolvedValueOnce(baseRow('draft'))
      .mockResolvedValueOnce(baseRow('submitted', { submittedAt: new Date() }));
    (harness.prisma as any).inquiry.updateMany.mockResolvedValue({ count: 0 });

    const second = await request(harness.app.getHttpServer())
      .post('/inquiries/inq-001/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(second.status).toBe(409);
    expect(JSON.stringify(second.body)).toContain(
      'INQUIRY_INVALID_STATUS_TRANSITION',
    );

    // 详情自洽：submitted 必须没有 cancelledAt（即"状态与时间戳互斥"）
    (harness.prisma as any).inquiry.findFirst.mockResolvedValue(
      baseRow('submitted', { submittedAt: new Date() }),
    );
    const detail = await request(harness.app.getHttpServer())
      .get('/inquiries/inq-001')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(detail.body.data.status).toBe('submitted');
    expect(detail.body.data.cancelledAt ?? null).toBeNull();
    expect(detail.body.data.submittedAt).not.toBeNull();
  });
});
