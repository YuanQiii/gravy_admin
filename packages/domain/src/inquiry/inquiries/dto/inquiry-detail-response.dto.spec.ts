import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { InquiryLineResponseDto } from '../../inquiry-lines/dto/inquiry-line-response.dto';
import { InquiryDetailResponseDto } from './inquiry-detail-response.dto';
import { InquiryResponseDto } from './inquiry-response.dto';
import { SHIPPING_SNAPSHOT_KEYS } from './shipping-snapshot.shape';

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
  shippingAddressId: 'addr-1',
  shippingReceiver: '李四',
  shippingPhone: '13900139000',
  shippingProvince: '江苏省',
  shippingCity: '无锡市',
  shippingDistrict: '滨湖区',
  shippingDetailAddress: '太湖大道 100 号',
  shippingZipCode: '214000',
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

describe('收货地址快照字段（列表与详情两副形状都携带）', () => {
  const listBody = () => wire(projectLine(InquiryResponseDto, INQUIRY_SOURCE));
  const detailBody = () =>
    wire(projectLine(InquiryDetailResponseDto, INQUIRY_SOURCE));

  it('列表响应携带全部 7 个快照字段，值取自被引用地址', () => {
    const body = listBody();

    for (const key of SHIPPING_SNAPSHOT_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.shippingReceiver).toBe('李四');
    expect(body.shippingPhone).toBe('13900139000');
    expect(body.shippingProvince).toBe('江苏省');
    expect(body.shippingCity).toBe('无锡市');
    expect(body.shippingDistrict).toBe('滨湖区');
    expect(body.shippingDetailAddress).toBe('太湖大道 100 号');
    expect(body.shippingZipCode).toBe('214000');
  });

  it('详情响应同样携带全部快照字段（详情 DTO 继承基础形状）', () => {
    const body = detailBody();

    for (const key of SHIPPING_SNAPSHOT_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(body.shippingReceiver).toBe('李四');
  });

  it('未选地址时快照字段仍**在场**且为 null（不是丢字段、也不是空串）', () => {
    const source = {
      ...INQUIRY_SOURCE,
      shippingAddressId: null,
      ...Object.fromEntries(SHIPPING_SNAPSHOT_KEYS.map((k) => [k, null])),
    };

    for (const body of [
      wire(projectLine(InquiryResponseDto, source)),
      wire(projectLine(InquiryDetailResponseDto, source)),
    ]) {
      for (const key of SHIPPING_SNAPSHOT_KEYS) {
        expect(body).toHaveProperty(key, null);
      }
      expect(body.shippingAddressId).toBeNull();
    }
  });

  it('快照与引用可独立存在：引用被置空而快照仍在（地址被硬删后的稳态）', () => {
    const body = wire(
      projectLine(InquiryResponseDto, {
        ...INQUIRY_SOURCE,
        shippingAddressId: null, // 外键 ON DELETE SET NULL 的结果
      }),
    );

    expect(body.shippingAddressId).toBeNull();
    expect(body.shippingReceiver).toBe('李四');
    expect(body.shippingDetailAddress).toBe('太湖大道 100 号');
  });
});
