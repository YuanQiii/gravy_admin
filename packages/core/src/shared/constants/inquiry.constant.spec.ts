import {
  buildStatusPatch,
  INQUIRY_STATUS,
  isValidStatusTransition,
  isInquiryExpired,
} from './inquiry.constant';

/**
 * 状态 → 时间戳字段映射的单测（不变量：**状态与时间戳必须一致**）。
 *
 * 这是纯函数，因此可以穷尽输入：并发与事务行为由 `InquiriesService.applyStatusTransition`
 * 的接缝用例覆盖，这里只管"给定目标状态该写哪些字段"。
 */
describe('buildStatusPatch（状态 → 字段映射）', () => {
  const now = new Date('2026-09-17T08:00:00Z');

  it('submitted → 只写 status 与 submittedAt', () => {
    const patch = buildStatusPatch(INQUIRY_STATUS.SUBMITTED, { now });

    expect(patch).toEqual({
      status: 'submitted',
      submittedAt: now,
    });
  });

  it('quoted 且有 expiresAt → 写 quotedAt 与 expiresAt', () => {
    const patch = buildStatusPatch(INQUIRY_STATUS.QUOTED, {
      now,
      expiresAt: '2026-12-31',
    });

    expect(patch.status).toBe('quoted');
    expect(patch.quotedAt).toBe(now);
    expect(patch.expiresAt).toBeInstanceOf(Date);
    expect((patch.expiresAt as Date).toISOString()).toBe(
      new Date('2026-12-31').toISOString(),
    );
  });

  it('quoted 但不传 expiresAt → 不写该字段（表示"不改动"，不是"清空"）', () => {
    const patch = buildStatusPatch(INQUIRY_STATUS.QUOTED, { now });

    expect(patch.quotedAt).toBe(now);
    expect(patch).not.toHaveProperty('expiresAt');
  });

  it('cancelled → 只写 status 与 cancelledAt', () => {
    const patch = buildStatusPatch(INQUIRY_STATUS.CANCELLED, { now });

    expect(patch).toEqual({ status: 'cancelled', cancelledAt: now });
  });

  it('expired → 不产生新时间戳（终态无对应时间列）', () => {
    const patch = buildStatusPatch(INQUIRY_STATUS.EXPIRED, { now });

    expect(patch).toEqual({ status: 'expired' });
    expect(patch).not.toHaveProperty('submittedAt');
    expect(patch).not.toHaveProperty('quotedAt');
    expect(patch).not.toHaveProperty('cancelledAt');
  });

  it('draft → 不产生新时间戳', () => {
    expect(buildStatusPatch(INQUIRY_STATUS.DRAFT, { now })).toEqual({
      status: 'draft',
    });
  });

  it('updatedById 非 undefined 时并入；null 是合法值（表示清空操作人）', () => {
    expect(
      buildStatusPatch(INQUIRY_STATUS.SUBMITTED, { now, updatedById: 'admin-1' })
        .updatedById,
    ).toBe('admin-1');
    expect(
      buildStatusPatch(INQUIRY_STATUS.SUBMITTED, { now, updatedById: null }),
    ).toHaveProperty('updatedById', null);
    // 省略（undefined）时不写该字段 —— 客户自助流转不改操作人
    expect(
      buildStatusPatch(INQUIRY_STATUS.SUBMITTED, { now }),
    ).not.toHaveProperty('updatedById');
  });

  it('状态与时间戳互斥：每次流转只带自己那一个时间戳', () => {
    for (const to of [
      INQUIRY_STATUS.SUBMITTED,
      INQUIRY_STATUS.QUOTED,
      INQUIRY_STATUS.CANCELLED,
      INQUIRY_STATUS.EXPIRED,
      INQUIRY_STATUS.DRAFT,
    ]) {
      const patch = buildStatusPatch(to, { now });
      const stamps = [
        'submittedAt',
        'quotedAt',
        'cancelledAt',
      ].filter((k) => k in patch);
      // quoted && expiresAt 之外，任何目标状态最多只有一个时间戳
      expect(stamps.length).toBeLessThanOrEqual(1);
      if (to === INQUIRY_STATUS.CANCELLED) {
        expect(patch).not.toHaveProperty('submittedAt');
      }
      if (to === INQUIRY_STATUS.SUBMITTED) {
        expect(patch).not.toHaveProperty('cancelledAt');
      }
    }
  });
});

describe('isValidStatusTransition（与 buildStatusPatch 同址的半边）', () => {
  it('单向流转：允许的方向通过，反向与自环被拒', () => {
    expect(isValidStatusTransition('draft', 'submitted')).toBe(true);
    expect(isValidStatusTransition('draft', 'cancelled')).toBe(true);
    expect(isValidStatusTransition('submitted', 'quoted')).toBe(true);
    expect(isValidStatusTransition('quoted', 'expired')).toBe(true);

    expect(isValidStatusTransition('quoted', 'submitted')).toBe(false);
    expect(isValidStatusTransition('expired', 'quoted')).toBe(false);
    expect(isValidStatusTransition('cancelled', 'draft')).toBe(false);
    // 自环：重复提交/重复取消都应被拒（幂等化不在范围内）
    expect(isValidStatusTransition('submitted', 'submitted')).toBe(false);
  });

  describe('isInquiryExpired（派生展示态，过期判定唯一真值）', () => {
    const NOW = new Date('2026-09-17T12:00:00Z');

    it('quoted + expiresAt < now → true', () => {
      expect(
        isInquiryExpired(
          { status: 'quoted', expiresAt: new Date('2026-09-17T11:59:59Z') },
          NOW,
        ),
      ).toBe(true);
    });

    it('quoted + expiresAt >= now → false（含恰好等于当前时刻）', () => {
      expect(
        isInquiryExpired(
          { status: 'quoted', expiresAt: new Date('2026-09-17T12:00:00Z') },
          NOW,
        ),
      ).toBe(false);
    });

    it('quoted + expiresAt 为空 → false（永久报价是合法口径）', () => {
      expect(isInquiryExpired({ status: 'quoted', expiresAt: null }, NOW)).toBe(
        false,
      );
    });

    it('非 quoted 状态一律 false（draft/submitted/expired/cancelled）', () => {
      for (const status of ['draft', 'submitted', 'expired', 'cancelled']) {
        expect(
          isInquiryExpired(
            { status, expiresAt: new Date('2020-01-01T00:00:00Z') },
            NOW,
          ),
        ).toBe(false);
      }
    });
  });
});
