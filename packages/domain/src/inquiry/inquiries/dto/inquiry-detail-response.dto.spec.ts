import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { InquiryLineResponseDto } from '../../inquiry-lines/dto/inquiry-line-response.dto';
import { InquiryDetailResponseDto } from './inquiry-detail-response.dto';
import { InquiryResponseDto } from './inquiry-response.dto';

/**
 * 响应投影接缝的前置契约测试（见 CONTEXT.md 词条 `Inquiry response projection`）。
 *
 * 断言一律打在**线上 JSON 形状**（`wire` / `wireKeys`）而非类实例上：TS 的字段
 * 声明会发射值为 `undefined` 的自有属性，`Object.keys(instance)` 因此包含未暴露
 * 字段、会稀释断言。`JSON.stringify` 丢掉 `undefined`，只剩真正出现在响应体里的键
 * —— 与规格谈的是同一层。
 */
const LINE_SOURCE: Record<string, unknown> = {
  id: 42,
  inquiryLineId: 'line-1',
  inquiryId: 'inq-1',
  filterId: 'filter-1',
  productName: 'OF-100',
  model: 'OF-100',
  typeName: 'oil',
  quantity: 3,
  unitPrice: new Prisma.Decimal('12.50'),
  subtotal: new Prisma.Decimal('37.50'),
  remarks: '备注',
  sortOrder: 2,
  createdById: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-02T00:00:00Z'),
  junk: 'dropped',
};

const INQUIRY_SOURCE: Record<string, unknown> = {
  id: 7,
  inquiryId: 'inq-1',
  inquiryNo: 'INQ202609-0001',
  title: '采购 320D 液压滤清器',
  description: null,
  status: 'quoted',
  customerName: '张三',
  customerEmail: 'a@b.c',
  customerPhone: '13800138000',
  totalAmount: new Prisma.Decimal('1500.00'),
  customerId: 'cust-1',
  createdById: null,
  shippingAddressId: null,
  submittedAt: new Date('2026-09-01T00:00:00Z'),
  quotedAt: new Date('2026-09-02T00:00:00Z'),
  expiresAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-02T00:00:00Z'),
  inquiryLines: [
    { ...LINE_SOURCE, inquiryLineId: 'line-2', sortOrder: 1 },
    { ...LINE_SOURCE, inquiryLineId: 'line-1', sortOrder: 2 },
  ],
  junk: 'dropped',
};

const projectLine = <T>(
  cls: new (...args: never[]) => T,
  source: Record<string, unknown> = LINE_SOURCE,
) => plainToInstance(cls, source, { excludeExtraneousValues: true });

/** 响应体的实际形状（`undefined` 字段被 JSON 序列化丢弃）。 */
const wire = (row: object): Record<string, unknown> =>
  JSON.parse(JSON.stringify(row)) as Record<string, unknown>;

const wireKeys = (row: object): string[] => Object.keys(wire(row));

describe('询价域 Decimal 字段的序列化（class-transformer 陷阱回归护栏）', () => {
  it('明细行 Decimal 金额被转成 number，不再抛 DecimalError', () => {
    const row = projectLine(InquiryLineResponseDto);

    expect(row.unitPrice).toBe(12.5);
    expect(typeof row.unitPrice).toBe('number');
    expect(row.subtotal).toBe(37.5);
    expect(typeof row.subtotal).toBe('number');
    expect(wire(row).unitPrice).toBe(12.5);
  });

  it('主体 totalAmount 同样被转成 number（此前非空即 500）', () => {
    const row = plainToInstance(InquiryResponseDto, INQUIRY_SOURCE, {
      excludeExtraneousValues: true,
    });

    expect(row.totalAmount).toBe(1500);
    expect(typeof row.totalAmount).toBe('number');
  });

  it('未报价（null）在线上保持 null，不转成 0、也不丢字段', () => {
    const row = projectLine(InquiryLineResponseDto, {
      ...LINE_SOURCE,
      unitPrice: null,
      subtotal: null,
    });

    expect(row.unitPrice).toBeNull();
    expect(row.subtotal).toBeNull();
    const body = wire(row);
    expect(body).toHaveProperty('unitPrice', null);
    expect(body).toHaveProperty('subtotal', null);
    expect(body.unitPrice).not.toBe(0);
  });

  it('数据库自增 id 与未声明的多余键都不出现在线上', () => {
    const lineBody = wire(projectLine(InquiryLineResponseDto));
    const headBody = wire(
      plainToInstance(InquiryResponseDto, INQUIRY_SOURCE, {
        excludeExtraneousValues: true,
      }),
    );

    expect(lineBody).not.toHaveProperty('id');
    expect(lineBody).not.toHaveProperty('junk');
    expect(headBody).not.toHaveProperty('id');
    expect(headBody).not.toHaveProperty('junk');
  });
});

describe('InquiryDetailResponseDto（投影接缝 · 详情主体）', () => {
  it('线上字段集继承自基础 DTO，且唯一新增键是 inquiryLines', () => {
    const baseKeys = wireKeys(projectLine(InquiryResponseDto, INQUIRY_SOURCE));
    const detailKeys = wireKeys(
      projectLine(InquiryDetailResponseDto, INQUIRY_SOURCE),
    );

    expect(baseKeys.length).toBeGreaterThan(0);
    expect(baseKeys).not.toContain('inquiryLines');
    for (const key of baseKeys) {
      expect(detailKeys).toContain(key);
    }
    expect(detailKeys.filter((k) => !baseKeys.includes(k))).toEqual([
      'inquiryLines',
    ]);
  });

  it('明细行元素逐元素投影、金额数值化、多余键被剔除', () => {
    const row = projectLine(InquiryDetailResponseDto, INQUIRY_SOURCE);

    expect(row.inquiryLines).toHaveLength(2);
    const first = row.inquiryLines?.[0];
    expect(first?.inquiryLineId).toBe('line-2');
    expect(typeof first?.unitPrice).toBe('number');
    expect(first?.unitPrice).toBe(12.5);

    const body = wire(row);
    const lines = body.inquiryLines as Record<string, unknown>[];
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toHaveProperty('junk');
    expect(lines[0]).not.toHaveProperty('id');
  });

  it('数据库自增 id 与未声明的多余键都不出现在线上', () => {
    const body = wire(projectLine(InquiryDetailResponseDto, INQUIRY_SOURCE));

    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('junk');
  });
});
